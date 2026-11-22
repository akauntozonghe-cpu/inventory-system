import {nextClassification} from "@/lib/classification-change";
import { assessClassificationCleanup, assessLocationCleanup } from "@/lib/classification-cleanup";
import {summarizeStock} from "@/lib/stock-state";
import {buildClassificationUsageRows} from "@/lib/classification-usage";
import { renameClassificationMaster } from "@/lib/classification-links";
import { ensureClassification, syncItemLinks } from "@/lib/item-links";
import { normalizeDisplayText } from "@/lib/input-normalization";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAdminActionLog } from "@/lib/error-report";

function text(value: unknown, max = 100) { return normalizeDisplayText(value, max); }

/** Reassign each individual stock without ever merging or deleting stocktake,
 * stock history or marketplace records. Duplicate lots remain distinct. */
async function mergeInventory(sourceLocationId: string, targetLocationId: string, actorId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const [from, to] = await Promise.all([
      tx.storageLocation.findUnique({ where: { id: sourceLocationId } }),
      tx.storageLocation.findUnique({ where: { id: targetLocationId } }),
    ]);
    if (!from || !to || from.id === to.id) throw new Error("LOCATION_CHANGED");
    // Closed registration requests are historical records; don't rewrite the
    // originally requested location or clear the FK during source deletion.
    const historicalRequests=await tx.itemRegistrationRequest.count({
      where:{storageLocationId:sourceLocationId,status:{not:"PENDING"}},
    });
    if(historicalRequests) throw new Error("LOCATION_HISTORICAL_REQUESTS");
    const migratedStocks = await tx.inventoryInstance.updateMany({
      where: { storageLocationId: sourceLocationId },
      data: { storageLocationId: targetLocationId },
    });
    const migratedRequests = await tx.itemRegistrationRequest.updateMany({
      where: { storageLocationId: sourceLocationId, status: "PENDING" },
      data: { storageLocationId: targetLocationId },
    });
    const updatedSessions = await tx.stocktakeSession.updateMany({
      where: {
        scopeType: "LOCATION",
        scopeValue: from.name,
        status: { in: ["IN_PROGRESS", "PAUSED", "REVIEW", "CONFLICT"] },
      },
      data: { scopeValue: to.name, scopeLabel: to.name },
    });
    await tx.storageLocation.delete({ where: { id: sourceLocationId } });
    await tx.adminActionLog.create({
      data: {
        adminUserId: actorId,
        action: "CLASSIFICATION_MERGE_LOCATION",
        route: "/admin/classifications",
        detail: {
          reason, sourceLocationId, sourceLocationName: from.name,
          targetLocationId, targetLocationName: to.name,
          moved: migratedStocks.count,
          requests: migratedRequests.count, sessions: updatedSessions.count,
          preservedInventoryInstances: true,
        },
      },
    });
    return { moved: migratedStocks.count, consolidated: 0, requests: migratedRequests.count };
  }, { timeout: 30_000, isolationLevel: "Serializable" });
}

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request); if (auth.response) return auth.response;
  try {
    const [masters, items, locations] = await prisma.$transaction(tx=>Promise.all([
      tx.classification.findMany({ orderBy: [{ kind: "asc" }, { parentName: "asc" }, { name: "asc" }] }),
      tx.item.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, isArchived:true, janCode: true, systemBarcode: true, majorCategory: true, minorCategory: true, managementCode:true, defaultUnit:true, inventoryInstances: { select: { id:true, quantity: true, unit:true, storageLocationId:true } }, _count: { select: { inventoryInstances: true } } } }),
      tx.storageLocation.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { inventories: true, itemRegistrationRequests: true } } } }),
    ]),{isolationLevel:"RepeatableRead"});
    // The same Item records checked by the delete preflight determine usage.
    // Zero on-hand quantity does not mean zero products linked to a category.
    const rows=buildClassificationUsageRows(masters,items);
    const retiredMajors=new Map(rows.filter(row=>row.kind==="MAJOR"&&row.retiredAt).map(row=>[row.name,row.retiredAt]));
    // A child of a retired major is also inactive for new assignments,
    // without needing to rewrite the child master or any historical product.
    for(const row of rows){
      if(row.kind==="MINOR" && !row.retiredAt && retiredMajors.has(row.parentName)){
        row.retiredAt=retiredMajors.get(row.parentName)!;
        row.retiredViaParent=true;
      }
    }
    return NextResponse.json({ classifications: rows, locations, items: items.filter(item=>!item.isArchived).map((item) => ({ id: item.id, name: item.name, managementCode:item.managementCode, inventoryInstances:item.inventoryInstances, janCode: item.janCode, systemBarcode: item.systemBarcode, majorCategory: item.majorCategory, minorCategory: item.minorCategory, inventoryCount: item._count.inventoryInstances, quantityLabel:summarizeStock(item.inventoryInstances,item.defaultUnit).map(row=>row.quantity+" "+row.unit).join(" ／ "), totalQuantity: item.inventoryInstances.reduce((sum, row) => sum + row.quantity, 0) })) });
  } catch (error) { console.error("GET classifications", error); return NextResponse.json({ code: "CLASSIFICATION_LIST_FAILED", message: "分類・保管場所を取得できませんでした。", action: "自動再読込後も解決しない場合はシステム点検を実行してください。" }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request); if (auth.response || !auth.user) return auth.response;
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action, 40), kind = text(body.kind, 20), name = text(body.name), parentName = text(body.parentName), source = text(body.source), target = text(body.target), targetParent = text(body.targetParent);
    let result: unknown;
    if (action === "CREATE_CLASSIFICATION") {
      if (!["MAJOR", "MINOR"].includes(kind) || !name || (kind === "MINOR" && !parentName)) return NextResponse.json({ code: "CLASSIFICATION_INPUT_INVALID", message: "分類名と親分類を確認してください。" }, { status: 400 });
      result = await prisma.$transaction(async (tx) => {
        const previous=await tx.classification.findUnique({where:{kind_name_parentName:{
          kind,name,parentName:kind==="MAJOR"?"":parentName,
        }}});
        if(previous?.retiredAt) throw new Error("CLASSIFICATION_RETIRED_USE_RESTORE");
        if(kind==="MINOR") {
          const parent=await tx.classification.findUnique({where:{kind_name_parentName:{
            kind:"MAJOR",name:parentName,parentName:"",
          }}});
          if(parent?.retiredAt) throw new Error("CLASSIFICATION_RETIRED_USE_RESTORE");
        }
        await ensureClassification(tx, kind === "MAJOR" ? name : parentName, kind === "MINOR" ? name : null);
        return { created: true };
      });
    } else if (action === "RENAME_OR_MERGE_CLASSIFICATION") {
      if (!["MAJOR", "MINOR"].includes(kind) || !source || !target) return NextResponse.json({ code: "CLASSIFICATION_INPUT_INVALID", message: "変更元と変更先を指定してください。" }, { status: 400 });
      result = await prisma.$transaction(async (tx) => {
        if (kind === "MAJOR") {
          const items = await tx.item.updateMany({ where: { majorCategory: source }, data: { majorCategory: target } });
          // Rename only stock values that actually use the renamed label.
          // A lot deliberately assigned another category must not change.
          const inventories = await tx.inventoryInstance.updateMany({ where: { majorCategory: source }, data: { majorCategory: target } });
          await tx.itemRegistrationRequest.updateMany({ where: { majorCategory: source, status: "PENDING" }, data: { majorCategory: target } });
          await tx.stocktakeSession.updateMany({ where: { scopeType: "MAJOR_CATEGORY", scopeValue: source, status: { in: ["IN_PROGRESS", "PAUSED", "REVIEW", "CONFLICT"] } }, data: { scopeValue: target, scopeLabel: target } });
          const children = await tx.classification.findMany({ where: { kind: "MINOR", parentName: source } });
          for (const child of children) await renameClassificationMaster(tx, "MINOR", child.name, source, child.name, target);
          await renameClassificationMaster(tx, "MAJOR", source, "", target, "");
          return { items: items.count, inventories: inventories.count };
        }
        if (!parentName) throw new Error("小分類の変更には親の大分類を指定してください。");
        const otherParents = await tx.item.count({ where: { minorCategory: source, NOT: { majorCategory: parentName } } });
        const activeScope = await tx.stocktakeSession.count({ where: { scopeType: "MINOR_CATEGORY", scopeValue: source, status: { in: ["IN_PROGRESS", "PAUSED", "REVIEW", "CONFLICT"] } } });
        if (source !== target && otherParents && activeScope) throw new Error("同名の小分類をまとめて棚卸中です。棚卸の完了後に小分類名を変更してください。");
        const where = { minorCategory: source, majorCategory: parentName };
        const nextMajor = targetParent || parentName;
        const items = await tx.item.updateMany({ where, data: { minorCategory: target, majorCategory: nextMajor } });
        // Keep null/inherited and other independently configured lot categories.
        const inherited = await tx.inventoryInstance.updateMany({
          where: { minorCategory: source, majorCategory: null, item: { majorCategory: nextMajor } },
          data: { minorCategory: target },
        });
        const explicitlyLinked = await tx.inventoryInstance.updateMany({
          where: { minorCategory: source, majorCategory: parentName },
          data: { minorCategory: target, majorCategory: nextMajor },
        });
        const inventories = { count: inherited.count + explicitlyLinked.count };
        await tx.itemRegistrationRequest.updateMany({ where: { ...where, status: "PENDING" }, data: { minorCategory: target, majorCategory: nextMajor } });
        if (!otherParents) await tx.stocktakeSession.updateMany({ where: { scopeType: "MINOR_CATEGORY", scopeValue: source, status: { in: ["IN_PROGRESS", "PAUSED", "REVIEW", "CONFLICT"] } }, data: { scopeValue: target, scopeLabel: target } });
        await ensureClassification(tx, nextMajor, null);
        await renameClassificationMaster(tx, "MINOR", source, parentName, target, nextMajor);
        return { items: items.count, inventories: inventories.count };
      });
    } else if (action === "ASSIGN_ITEMS") {
      const itemIds = Array.isArray(body.itemIds) ? Array.from(new Set(body.itemIds.filter((value): value is string => typeof value === "string" && value.length > 0))) : [];
      if (itemIds.length > 500) return NextResponse.json({ code: "CLASSIFICATION_BATCH_LIMIT", message: "一度に変更できるのは500件までです。選択を減らして実行してください。" }, { status: 400 });
      if (body.expectedClassifications !== undefined && (!Array.isArray(body.expectedClassifications) || body.expectedClassifications.length !== itemIds.length || body.expectedClassifications.some(row=>!row || typeof row!=="object" || typeof row.id!=="string" || !(row.majorCategory===null || typeof row.majorCategory==="string") || !(row.minorCategory===null || typeof row.minorCategory==="string")))) return NextResponse.json({code:"CLASSIFICATION_INPUT_INVALID",message:"変更前の分類を確認できません。選び直してください。"},{status:400});
      const hasMajor = Object.prototype.hasOwnProperty.call(body, "majorCategory");
      const hasMinor = Object.prototype.hasOwnProperty.call(body, "minorCategory");
      const majorCategory = body.majorCategory === null ? null : text(body.majorCategory);
      const minorCategory = body.minorCategory === null ? null : text(body.minorCategory);
      if (itemIds.length === 0 || (!hasMajor && !hasMinor)) return NextResponse.json({ code: "CLASSIFICATION_ITEMS_REQUIRED", message: "編集する商品と変更内容を選択してください。" }, { status: 400 });
      if (hasMinor && minorCategory && !(hasMajor ? majorCategory : text(body.currentMajor))) return NextResponse.json({ code: "CLASSIFICATION_PARENT_REQUIRED", message: "小分類を設定する場合は大分類も選択してください。" }, { status: 400 });
      result = await prisma.$transaction(async (tx) => {
        // Retired categories cannot be newly assigned, but may remain on
        // pre-existing items until an administrator explicitly reclassifies them.
        if(hasMajor && majorCategory){
          const m=await tx.classification.findUnique({where:{kind_name_parentName:{kind:"MAJOR",name:majorCategory,parentName:""}}});
          if(m?.retiredAt)throw new Error("CLASSIFICATION_RETIRED_USE_RESTORE");
        }
        if(hasMinor && minorCategory){
          const major=hasMajor?majorCategory:text(body.currentMajor);
          const m=await tx.classification.findUnique({where:{kind_name_parentName:{kind:"MINOR",name:minorCategory,parentName:major??""}}});
          if(m?.retiredAt)throw new Error("CLASSIFICATION_RETIRED_USE_RESTORE");
        }
        const selected = await tx.item.findMany({ where: { id: { in: itemIds }, isArchived: false }, select: { id: true, majorCategory: true, minorCategory: true } });
        if (selected.length !== itemIds.length) throw new Error("CLASSIFICATION_ITEMS_CHANGED");
        if(Array.isArray(body.expectedClassifications)){const expected=body.expectedClassifications as Array<{id:string;majorCategory:string|null;minorCategory:string|null}>;if(selected.some(item=>!expected.some(row=>row.id===item.id&&row.majorCategory===item.majorCategory&&row.minorCategory===item.minorCategory)))throw new Error("CLASSIFICATION_ITEMS_CHANGED");}
        // Preserve each lot's classification overrides while keeping legacy
        // copies of the previous item classification synchronized.
        for (const item of selected) {
          const next = nextClassification(item, {
            ...(hasMajor ? { majorCategory } : {}),
            ...(hasMinor ? { minorCategory } : {}),
            keepMinorCategory: body.keepMinorCategory === true,
          });
          const updated = await tx.item.updateMany({
            where: { id: item.id, isArchived: false, majorCategory: item.majorCategory, minorCategory: item.minorCategory },
            data: next,
          });
          if (updated.count !== 1) throw new Error("CLASSIFICATION_ITEMS_CHANGED");
          await syncItemLinks(tx, item.id,
            { majorCategory: item.majorCategory, minorCategory: item.minorCategory, manufacturer: null, defaultUnit: null },
            { majorCategory: next.majorCategory, minorCategory: next.minorCategory, manufacturer: null, defaultUnit: null },
          );
        }
        await tx.adminActionLog.create({data:{adminUserId:auth.user!.id,action:"CLASSIFICATION_ASSIGN_ITEMS",route:"/admin/classifications",detail:{before:selected,after:selected.map(item=>({id:item.id,...nextClassification(item,{...(hasMajor?{majorCategory}:{}),...(hasMinor?{minorCategory}:{}),keepMinorCategory:body.keepMinorCategory===true})}))}}});
        return { updatedItems: selected.length, requestedItems: itemIds.length };
      },{isolationLevel:"Serializable"});
    } else if (action === "RETIRE_CLASSIFICATION" || action === "RESTORE_CLASSIFICATION") {
      if (!["MAJOR","MINOR"].includes(kind) || !source
        || (kind === "MINOR" && !parentName)
        || body.confirmName !== source || !(body.expectedId === null || typeof body.expectedId === "string")
        || (action === "RETIRE_CLASSIFICATION" && text(body.reason,500).length<2)) {
        return NextResponse.json({code:"CLASSIFICATION_RETIRE_INPUT_INVALID",message:"対象名・分類と廃止理由を確認してください。"}, {status:400});
      }
      const change=await prisma.$transaction(async tx=>{
        const parent=kind==="MINOR"
          ? await tx.classification.findUnique({where:{kind_name_parentName:{kind:"MAJOR",name:parentName,parentName:""}}})
          : null;
        if(action==="RESTORE_CLASSIFICATION" && parent?.retiredAt)
          return {changed:false,why:"PARENT_RETIRED" as const};
        const key={kind,name:source,parentName:kind==="MAJOR"?"":parentName};
        const previous=await tx.classification.findUnique({where:{kind_name_parentName:key}});
        if((previous?.id??null)!==body.expectedId) return {changed:false,why:"CLASSIFICATION_CHANGED" as const};
        if(action==="RESTORE_CLASSIFICATION" && !previous)
          return {changed:false,why:"CLASSIFICATION_NOT_FOUND" as const};
        const retiring=action==="RETIRE_CLASSIFICATION";
        if(previous?.retiredAt && retiring || (previous && !previous.retiredAt && !retiring))
          return {changed:false,why:retiring?"ALREADY_RETIRED" as const:"ALREADY_ACTIVE" as const};
        const now=new Date();
        const master=retiring
          ? await tx.classification.upsert({
            where:{kind_name_parentName:key},
            update:{retiredAt:now,retirementReason:text(body.reason,500),retiredByUserId:auth.user!.id},
            create:{...key,retiredAt:now,retirementReason:text(body.reason,500),retiredByUserId:auth.user!.id},
          })
          : await tx.classification.update({
            where:{id:previous!.id},
            data:{retiredAt:null,retirementReason:null,retiredByUserId:null},
          });
        await tx.adminActionLog.create({data:{
          adminUserId:auth.user!.id,
          action:retiring?"CLASSIFICATION_RETIRE":"CLASSIFICATION_RESTORE",
          route:"/admin/classifications",
          detail:{id:master.id,kind,name:source,parentName,reason:text(body.reason,500),
            previousRetiredAt:previous?.retiredAt??null,
            productClassificationsPreserved:true,inventoryQuantitiesPreserved:true,stocktakeHistoryPreserved:true},
        }});
        return {changed:true,retired:retiring,id:master.id};
      },{isolationLevel:"Serializable"});
      if(!change.changed){
        return NextResponse.json({code:"CLASSIFICATION_RETIRE_CONFLICT",
          message: change.why==="PARENT_RETIRED"
          ? "親の大分類が廃止中です。先に親分類を復元してください。"
          : "分類の状態が変更されています。一覧を再読み込みしてから操作してください。",
          detail:change.why},{status:409});
      }
      return NextResponse.json({
        code:action==="RETIRE_CLASSIFICATION"?"CLASSIFICATION_RETIRED":"CLASSIFICATION_RESTORED",
        message:action==="RETIRE_CLASSIFICATION"
          ? `分類「${source}」を廃止済みに移動しました。使用中の商品・在庫明細・棚卸履歴は保持しています。`
          : `分類「${source}」を復元しました。`,
        result:change,
      });
    } else if (action === "UNASSIGN_AND_DELETE_CLASSIFICATION") {
      if (!["MAJOR","MINOR"].includes(kind) || !source || (kind==="MINOR"&&!parentName)
        || body.confirmName!==source || !(body.expectedId===null || typeof body.expectedId==="string")
        || typeof body.reason!=="string" || text(body.reason,500).length<2
        || !Array.isArray(body.expectedItems) || !body.expectedItems.length
        || body.expectedItems.length>100
        || body.expectedItems.some((row:unknown)=>!row || typeof row!=="object"
          || !("id" in row) || typeof row.id!=="string"
          || !("updatedAt" in row) || typeof row.updatedAt!=="string")) {
        return NextResponse.json({code:"CLASSIFICATION_UNASSIGN_INVALID",message:"分類、対象商品、確認名、変更理由を確認してください。"},{status:400});
      }
      const expected=body.expectedItems as Array<{id:string;updatedAt:string}>;
      const expectedVersions=new Map(expected.map(row=>[row.id,row.updatedAt]));
      if(expectedVersions.size!==expected.length) return NextResponse.json({code:"CLASSIFICATION_UNASSIGN_INVALID",message:"商品が重複しています。"},{status:400});
      const deletion=await prisma.$transaction(async tx=>{
        const assessment=await assessClassificationCleanup(tx,kind as "MAJOR"|"MINOR",source,parentName);
        if(!assessment.canUnassignAndDelete || assessment.id!==body.expectedId)
          return {deleted:false,assessment};
        const current=assessment.linkedItems??[];
        if(current.length!==expected.length || current.some(item=>expectedVersions.get(item.id)!==item.updatedAt.toISOString()))
          throw new Error("CLASSIFICATION_ITEMS_CHANGED");
        const original=await tx.item.findMany({
          where:kind==="MAJOR"?{majorCategory:source,isArchived:false}:{majorCategory:parentName,minorCategory:source,isArchived:false},
          select:{id:true,name:true,updatedAt:true,majorCategory:true,minorCategory:true},
        });
        if(original.length!==expected.length || original.some(item=>expectedVersions.get(item.id)!==item.updatedAt.toISOString()))
          throw new Error("CLASSIFICATION_ITEMS_CHANGED");
        for(const item of original){
          const next={majorCategory:kind==="MAJOR"?null:item.majorCategory,minorCategory:null};
          const result=await tx.item.updateMany({
            where:{id:item.id,updatedAt:item.updatedAt,isArchived:false,
              majorCategory:item.majorCategory,minorCategory:item.minorCategory},
            data:next,
          });
          if(result.count!==1)throw new Error("CLASSIFICATION_ITEMS_CHANGED");
          await syncItemLinks(tx,item.id,{
            majorCategory:item.majorCategory,minorCategory:item.minorCategory,
            manufacturer:null,defaultUnit:null,
          },{
            ...next,manufacturer:null,defaultUnit:null,
          });
        }
        // Zero-quantity explicit per-lot references from other products are
        // cleared separately; no stock rows, quantities or audit history deleted.
        const stockWhere=kind==="MAJOR"
          ? {majorCategory:source,status:{not:"廃止"},quantity:{lte:0}}
          : {minorCategory:source,status:{not:"廃止"},quantity:{lte:0},
              OR:[{majorCategory:parentName},{majorCategory:null,item:{majorCategory:parentName}}]};
        const updatedStocks=await tx.inventoryInstance.updateMany({
          where:stockWhere,
          data:kind==="MAJOR"?{majorCategory:null,minorCategory:null}:{minorCategory:null},
        });
        if(assessment.id) await tx.classification.delete({where:{id:assessment.id}});
        await tx.adminActionLog.create({data:{
          adminUserId:auth.user!.id,action:"CLASSIFICATION_UNASSIGN_AND_DELETE",
          route:"/admin/classifications",
          detail:{kind,source,parentName,reason:text(body.reason,500),productIds:original.map(item=>item.id),
            updatedProducts:original.length,updatedStockOverrides:updatedStocks.count,
            masterDeleted:Boolean(assessment.id),quantitiesPreserved:true,stocktakeHistoryPreserved:true},
        }});
        return {deleted:true,masterDeleted:Boolean(assessment.id),updatedProducts:original.length,updatedStockOverrides:updatedStocks.count};
      },{isolationLevel:"Serializable",timeout:30000});
      if(!deletion.deleted) return NextResponse.json({
        code:"CLASSIFICATION_UNASSIGN_BLOCKED",
        message:"在庫が残っている、棚卸や登録申請で使用中、または分類が変更されたため一括整理を停止しました。最新の使用状況を確認してください。",
        assessment:deletion.assessment,
      },{status:409});
      return NextResponse.json({code:"CLASSIFICATION_UNASSIGN_DELETE_OK",
        message:deletion.masterDeleted ? `${deletion.updatedProducts}件の商品の分類を解除し、分類「${source}」を削除しました。在庫数量と棚卸履歴は変更していません。` : `${deletion.updatedProducts}件の商品に設定された「${source}」の分類を解除しました。在庫数量と棚卸履歴は変更していません。`,
        result:deletion});
    } else if (action === "PREVIEW_DELETE_CLASSIFICATION" || action === "DELETE_CLASSIFICATION") {
      if (!["MAJOR", "MINOR"].includes(kind) || !source || (kind === "MINOR" && !parentName)) {
        return NextResponse.json({ code: "CLASSIFICATION_INPUT_INVALID", message: "削除する分類と親分類を指定してください。" }, { status: 400 });
      }
      if (action === "PREVIEW_DELETE_CLASSIFICATION") {
        const assessment = await prisma.$transaction(
          tx => assessClassificationCleanup(tx, kind as "MAJOR" | "MINOR", source, parentName),
          { isolationLevel: "RepeatableRead" },
        );
        return NextResponse.json({ code: "CLASSIFICATION_DELETE_PREVIEW", assessment });
      }
      if (body.confirmName !== source || typeof body.expectedId !== "string") {
        return NextResponse.json({ code: "CLASSIFICATION_DELETE_CONFIRM_REQUIRED", message: "削除対象の名前を確認し、確認画面から実行してください。" }, { status: 400 });
      }
      const deletion = await prisma.$transaction(async tx => {
        const assessment = await assessClassificationCleanup(tx, kind as "MAJOR" | "MINOR", source, parentName);
        if (!assessment.canDelete) return { deleted: false, assessment };
        if (body.expectedId !== assessment.id) throw new Error("CLASSIFICATION_ITEMS_CHANGED");
        await tx.classification.delete({ where: { id: assessment.id! } });
        await tx.adminActionLog.create({ data: {
          adminUserId: auth.user!.id,
          action: "CLASSIFICATION_DELETE_CLASSIFICATION",
          route: "/admin/classifications",
          detail: { kind, name: source, parentName, reason: text(body.reason, 500), assessment },
        } });
        return { deleted: true, assessment };
      }, { isolationLevel: "Serializable" });
      if (!deletion.deleted) return NextResponse.json({ code: "CLASSIFICATION_IN_USE", message: deletion.assessment.counts.items ? `在庫数量とは別に、${deletion.assessment.counts.items}件の商品マスタにこの分類が設定されています。分類解除・統合を行ってから削除してください。` : "在庫明細・登録申請・棚卸・子分類から参照されています。使用状況を確認してください。", assessment: deletion.assessment }, { status: 409 });
      return NextResponse.json({ code: "CLASSIFICATION_DELETE_OK", message: `分類「${source}」を削除しました。商品・在庫・棚卸履歴は変更していません。`, result: deletion });
    } else if (action === "RETIRE_LOCATION" || action === "RESTORE_LOCATION") {
      const sourceId=text(body.sourceId);
      if(!sourceId || body.confirmName===undefined ||
         !(action==="RESTORE_LOCATION" || text(body.reason,500).length>=2)){
        return NextResponse.json({code:"LOCATION_RETIRE_INPUT_INVALID",message:"対象名と廃止理由を確認してください。"},{status:400});
      }
      const result=await prisma.$transaction(async tx=>{
        const previous=await tx.storageLocation.findUnique({where:{id:sourceId}});
        if(!previous)return {changed:false,why:"NOT_FOUND"};
        if(body.confirmName!==previous.name || body.expectedId!==previous.id)
          return {changed:false,why:"CHANGED"};
        const retiring=action==="RETIRE_LOCATION";
        if(Boolean(previous.retiredAt)===retiring)return {changed:false,why:"ALREADY_SET"};
        const now=new Date();
        const updated=await tx.storageLocation.update({
          where:{id:sourceId},
          data:retiring
            ? {retiredAt:now,retirementReason:text(body.reason,500),retiredByUserId:auth.user!.id}
            : {retiredAt:null,retirementReason:null,retiredByUserId:null},
        });
        await tx.adminActionLog.create({data:{
          adminUserId:auth.user!.id,action:retiring?"CLASSIFICATION_RETIRE_LOCATION":"CLASSIFICATION_RESTORE_LOCATION",
          route:"/admin/classifications",
          detail:{sourceId,name:previous.name,reason:text(body.reason,500),
            productDataPreserved:true,inventoryLinksPreserved:true,stocktakeHistoryPreserved:true},
        }});
        return {changed:true,id:updated.id,retired:retiring};
      },{isolationLevel:"Serializable"});
      if(!result.changed)return NextResponse.json({code:"LOCATION_RETIRE_CONFLICT",
        message:"保管場所の状態が変更されています。再読み込みしてから操作してください。",
        detail:result.why},{status:409});
      return NextResponse.json({code:action==="RETIRE_LOCATION"?"LOCATION_RETIRED":"LOCATION_RESTORED",
        message:action==="RETIRE_LOCATION"
          ? "保管場所を廃止済みに移動しました。在庫明細と棚卸履歴は移動・削除していません。"
          : "保管場所を復元しました。",result});
    } else if (action === "PREVIEW_DELETE_LOCATION" || action === "DELETE_LOCATION") {
      const sourceId = text(body.sourceId);
      if (!sourceId) return NextResponse.json({ code: "LOCATION_INPUT_INVALID", message: "削除する保管場所を指定してください。" }, { status: 400 });
      if (action === "PREVIEW_DELETE_LOCATION") {
        const assessment = await prisma.$transaction(tx => assessLocationCleanup(tx, sourceId), { isolationLevel: "RepeatableRead" });
        return NextResponse.json({ code: "LOCATION_DELETE_PREVIEW", assessment });
      }
      if (typeof body.expectedId !== "string" || typeof body.confirmName !== "string") {
        return NextResponse.json({ code: "LOCATION_DELETE_CONFIRM_REQUIRED", message: "削除対象の名前を確認し、確認画面から実行してください。" }, { status: 400 });
      }
      const deletion = await prisma.$transaction(async tx => {
        const assessment = await assessLocationCleanup(tx, sourceId);
        if (!assessment.canDelete) return { deleted: false, assessment };
        if (body.expectedId !== assessment.id || body.confirmName !== assessment.name) throw new Error("LOCATION_CHANGED");
        await tx.storageLocation.delete({ where: { id: sourceId } });
        await tx.adminActionLog.create({ data: {
          adminUserId: auth.user!.id,
          action: "CLASSIFICATION_DELETE_LOCATION",
          route: "/admin/classifications",
          detail: { sourceId, name: assessment.name, reason: text(body.reason, 500), assessment },
        } });
        return { deleted: true, assessment };
      }, { isolationLevel: "Serializable" });
      if (!deletion.deleted) return NextResponse.json({ code: "LOCATION_IN_USE", message: "在庫・登録申請・棚卸で使用中です。先に移動してから削除してください。", assessment: deletion.assessment }, { status: 409 });
      return NextResponse.json({ code: "LOCATION_DELETE_OK", message: `保管場所「${deletion.assessment.name}」を削除しました。在庫・棚卸履歴は変更していません。`, result: deletion });
    } else if (action === "CREATE_LOCATION") {
      if (!name) return NextResponse.json({ code: "LOCATION_NAME_REQUIRED", message: "保管場所名を入力してください。" }, { status: 400 });
      result = await prisma.storageLocation.upsert({ where: { name }, update: { description: text(body.description, 500) || null }, create: { name, description: text(body.description, 500) || null } });
    } else if (action === "RENAME_LOCATION") {
      const sourceId = text(body.sourceId); if (!sourceId || !target) return NextResponse.json({ code: "LOCATION_INPUT_INVALID", message: "変更元と新しい名称を指定してください。" }, { status: 400 });
      const before = await prisma.storageLocation.findUnique({ where: { id: sourceId } }); if (!before) return NextResponse.json({ code: "LOCATION_NOT_FOUND", message: "保管場所が見つかりません。" }, { status: 404 });
      result = await prisma.$transaction([prisma.storageLocation.update({ where: { id: sourceId }, data: { name: target, description: text(body.description, 500) || before.description } }), prisma.stocktakeSession.updateMany({ where: { scopeType: "LOCATION", scopeValue: before.name, status: { in: ["IN_PROGRESS", "PAUSED", "REVIEW", "CONFLICT"] } }, data: { scopeValue: target, scopeLabel: target } })]);
    } else if (action === "MERGE_LOCATION") {
      const sourceId = text(body.sourceId), targetId = text(body.targetId); if (!sourceId || !targetId || sourceId === targetId) return NextResponse.json({ code: "LOCATION_MERGE_INVALID", message: "異なる統合元と統合先を指定してください。" }, { status: 400 });
      if(text(body.reason,500).length<2) return NextResponse.json({code:"LOCATION_MERGE_REASON_REQUIRED",message:"統合して廃止する理由を2文字以上で入力してください。"},{status:400});
      result = await mergeInventory(sourceId, targetId, auth.user.id, text(body.reason, 500));
    } else return NextResponse.json({ code: "CLASSIFICATION_ACTION_INVALID", message: "編集操作が正しくありません。" }, { status: 400 });
    if (action !== "MERGE_LOCATION" && action !== "ASSIGN_ITEMS") await createAdminActionLog({ adminUserId: auth.user.id, action: `CLASSIFICATION_${action}`, route: "/admin/classifications", detail: { kind, name, parentName, source, target, targetParent, reason: text(body.reason,500), result: result as never } });
    return NextResponse.json({ code: "CLASSIFICATION_UPDATE_OK", message: "分類・在庫・棚卸範囲を更新し、操作履歴へ記録しました。", result });
  } catch (error) { console.error("POST classifications", error);
    if(error instanceof Error && error.message==="CLASSIFICATION_RETIRED_USE_RESTORE")
      return NextResponse.json({code:"CLASSIFICATION_RETIRED_USE_RESTORE",
        message:"その分類は廃止済みです。分類・保管場所の整理にある「廃止済み」から復元してください。"},
        {status:409});
    if (error && typeof error === "object" && (("code" in error && ["P2034", "P2025"].includes(String(error.code))) || (error instanceof Error && ["LOCATION_CHANGED", "LOCATION_HISTORICAL_REQUESTS", "CLASSIFICATION_ITEMS_CHANGED"].includes(error.message)))) return NextResponse.json({ code: error instanceof Error && error.message === "LOCATION_HISTORICAL_REQUESTS" ? "LOCATION_HISTORICAL_REQUESTS" : "CLASSIFICATION_CHANGED", message: error instanceof Error && error.message === "LOCATION_HISTORICAL_REQUESTS" ? "完了済みの商品登録申請がこの場所を参照しています。履歴を壊さないよう統合は停止しました。過去の申請と移動方法を確認してください。" : "他の操作で情報が変わりました。再読込してから実行してください。" }, { status: 409 }); return NextResponse.json({ code: "CLASSIFICATION_UPDATE_FAILED", message: error instanceof Error && (error.message.startsWith("小分類の変更") || error.message.startsWith("同名の小分類")) ? error.message : "分類編集を完了できませんでした。現在の状態を再読込して確認してください。", action: "入力内容を確認して再試行し、解決しない場合はエラー管理を開いてください。" }, { status: 500 }); }
}
