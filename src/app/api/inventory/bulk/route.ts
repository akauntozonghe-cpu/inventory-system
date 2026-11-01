import { NextRequest, NextResponse } from "next/server";
import { AllocationType, Prisma } from "@prisma/client";
import { requireAdmin, getAdminElevation } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const operationLabels = {
  EXCLUDE_INSPECTION: "棚卸対象から外す",
  INCLUDE_INSPECTION: "棚卸対象に戻す",
  DELETE: "削除",
  RESTORE: "復元",
  SET_LOCATION: "保管場所を変更",
  SET_ALLOCATION: "在庫区分を変更",
  SET_EXPIRY_ALERT: "期限通知日数を変更",
} as const;
type Operation = keyof typeof operationLabels;
type Snapshot = {id: string; expectedUpdatedAt: string};

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth.response || !auth.user) return auth.response;
  const body = await request.json().catch(() => null);
  const operation = body?.operation as Operation;
  const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const scope = body?.scope;
  const selectedIds: string[] = Array.isArray(body?.selectedIds) ? body.selectedIds : [];
  const snapshots: Snapshot[] = Array.isArray(body?.snapshots) ? body.snapshots : [];

  if (!Object.hasOwn(operationLabels, operation) || !itemId || (scope !== "selected" && scope !== "unselected")
      || (scope === "selected" && selectedIds.length === 0)
      || snapshots.length === 0 || snapshots.length > 150 || selectedIds.length > 150
      || new Set(selectedIds).size !== selectedIds.length
      || selectedIds.some(id => typeof id !== "string" || !id)
      || snapshots.some(s => !s || typeof s.id !== "string" || !s.id || typeof s.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(s.expectedUpdatedAt)))
      || new Set(snapshots.map(s => s.id)).size !== snapshots.length
      || reason.length < 2 || reason.length > 500) {
    return NextResponse.json({code:"BULK_INPUT_INVALID",message:"対象、操作、変更理由（2～500文字）を確認してください。1回の上限は150明細です。"},{status:400});
  }

  const snapshotIds = new Set(snapshots.map(s => s.id));
  if (selectedIds.some(id => !snapshotIds.has(id))) {
    return NextResponse.json({code:"INVALID_SELECTION",message:"選択した在庫が一覧と一致しません。"},{status:400});
  }
  const data = body?.data;
  const locationId = typeof data?.storageLocationId === "string" ? data.storageLocationId.trim() : "";
  const allocation = data?.allocationType;
  const alertDays = data?.expirationAlertDays;
  if ((operation === "SET_LOCATION" && !locationId)
    || (operation === "SET_ALLOCATION" && !["home","flea_market","warehouse"].includes(allocation))
    || (operation === "SET_EXPIRY_ALERT" && (!Number.isInteger(alertDays) || alertDays < 0 || alertDays > 365))) {
    return NextResponse.json({code:"BULK_VALUE_INVALID",message:"変更する値を確認してください。"},{status:400});
  }

  try {
    const affectedCount = await prisma.$transaction(async tx => {
      const item = await tx.item.findUnique({where:{id:itemId},select:{id:true,name:true,isArchived:true}});
      if (!item || item.isArchived) throw new Error("ITEM_NOT_ACTIVE");
      const existing = await tx.inventoryInstance.findMany({
        where:{itemId},
        select:{id:true,updatedAt:true,status:true,archivedFromStatus:true,inspectionExcluded:true,inspectionExclusionReason:true,
          storageLocationId:true,allocationType:true,expirationAlertDays:true,lotNo:true}
      });
      if (existing.length !== snapshots.length || existing.some(s => !snapshotIds.has(s.id))) throw new Error("STOCK_CHANGED");
      const versions = new Map(snapshots.map(s => [s.id, Date.parse(s.expectedUpdatedAt)]));
      if (existing.some(s => s.updatedAt.getTime() !== versions.get(s.id))) throw new Error("STOCK_CHANGED");
      const restoring = operation === "RESTORE";
      const eligible = existing.filter(s => restoring ? s.status === "廃止" : s.status !== "廃止");
      const eligibleIds = new Set(eligible.map(s => s.id));
      if (selectedIds.some(id => !eligibleIds.has(id))) throw new Error("INVALID_SELECTION");
      const selected = new Set(selectedIds);
      const targets = eligible.filter(s => scope === "selected" ? selected.has(s.id) : !selected.has(s.id));
      if (!targets.length) throw new Error("NO_TARGET");

      if (operation === "SET_LOCATION") {
        const loc = await tx.storageLocation.findUnique({where:{id:locationId},select:{id:true}});
        if (!loc) throw new Error("LOCATION_NOT_FOUND");
      }
      const actorId = (auth.user!.baseRole ?? auth.user!.role) === "ADMIN"
        ? auth.user!.id : getAdminElevation(request)?.adminUserId;
      if (!actorId) throw new Error("ADMIN_REQUIRED");

      const changes: Array<{id:string;lotNo:string|null;before:Record<string,unknown>;after:Record<string,unknown>}> = [];
      for (const stock of targets) {
        let patch: Prisma.InventoryInstanceUncheckedUpdateManyInput;
        let before: Record<string,unknown>;
        if (operation === "EXCLUDE_INSPECTION" || operation === "INCLUDE_INSPECTION") {
          const excluded = operation === "EXCLUDE_INSPECTION";
          patch = {inspectionExcluded: excluded, inspectionExclusionReason: excluded ? reason : null};
          before = {inspectionExcluded:stock.inspectionExcluded,inspectionExclusionReason:stock.inspectionExclusionReason};
        } else if (operation === "DELETE") {
          patch = {status:"廃止",archivedFromStatus:stock.status,archivedAt:new Date(),archiveReason:reason};
          before = {status:stock.status};
        } else if (operation === "RESTORE") {
          patch = {status:stock.archivedFromStatus ?? "在庫中",archivedFromStatus:null,archivedAt:null,archiveReason:null};
          before = {status:stock.status};
        } else if (operation === "SET_LOCATION") {
          patch = {storageLocationId:locationId};
          before = {storageLocationId:stock.storageLocationId};
        } else if (operation === "SET_ALLOCATION") {
          patch = {allocationType: allocation as AllocationType};
          before = {allocationType:stock.allocationType};
        } else {
          patch = {expirationAlertDays:alertDays as number};
          before = {expirationAlertDays:stock.expirationAlertDays};
        }
        const updated = await tx.inventoryInstance.updateMany({
          where:{id:stock.id,itemId,updatedAt:stock.updatedAt,status:stock.status},
          data:patch
        });
        if (updated.count !== 1) throw new Error("STOCK_CHANGED");
        changes.push({id:stock.id,lotNo:stock.lotNo,before,after:patch as Record<string,unknown>});
      }
      await tx.adminActionLog.create({data:{
        adminUserId:actorId,action:"INVENTORY_BULK_"+operation,route:"/api/inventory/bulk",
        detail:JSON.parse(JSON.stringify({
          itemId,itemName:item.name,operation,reason,scope,selectedIds,targetIds:targets.map(s => s.id),
          requestedBy:auth.user!.id,changes
        })) as Prisma.InputJsonValue,
      }});
      return targets.length;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
    return NextResponse.json({success:true,affectedCount,message:`${affectedCount}件の在庫を「${operationLabels[operation]}」で更新しました。`});
  } catch(error) {
    const code = error instanceof Error ? error.message : "BULK_FAILED";
    if (code === "STOCK_CHANGED") return NextResponse.json({code,message:"他の端末で在庫が変更されています。再読み込みして対象を選び直してください。"},{status:409});
    if (code === "NO_TARGET" || code === "INVALID_SELECTION" || code === "ITEM_NOT_ACTIVE")
      return NextResponse.json({code,message:"対象に現在操作できない在庫が含まれています。再読み込みしてください。"},{status:409});
    if (code === "LOCATION_NOT_FOUND") return NextResponse.json({code,message:"指定した保管場所が見つかりません。"},{status:400});
    console.error("POST /api/inventory/bulk",error);
    return NextResponse.json({code:"BULK_FAILED",message:"一括操作を保存できませんでした。変更は確定していません。"},{status:409});
  }
}
