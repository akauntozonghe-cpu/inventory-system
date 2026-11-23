"use client";
import {useCallback,useEffect,useMemo,useState} from "react";

type ArchiveRecord={
  id:string;entityType:"CLASSIFICATION"|"STORAGE_LOCATION";originalId:string;archivedAt:string;reason:string|null;
  snapshot:Record<string,unknown>;reRegistrations:Array<{id:string,newEntityId:string,createdAt:string}>;
};
const getLabel=(r:ArchiveRecord)=>typeof r.snapshot?.name==="string"?r.snapshot.name:"名称不明";
export default function ArchiveRecordsPage(){
  const [records,setRecords]=useState<ArchiveRecord[]>([]);
  const [type,setType]=useState("ALL");
  const [selected,setSelected]=useState<string|null>(null);
  const [name,setName]=useState("");
  const [parent,setParent]=useState("");
  const [parents,setParents]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const load=useCallback(async()=>{
    const [list,masters]=await Promise.all([
      fetch("/api/admin/archive-records",{cache:"no-store"}),
      fetch("/api/admin/classifications",{cache:"no-store"}),
    ]);
    if(!list.ok)throw new Error("廃止記録を取得できません。管理者権限を確認してください。");
    const json=await list.json();
    setRecords(Array.isArray(json.records)?json.records:[]);
    if(masters.ok){
      const data=await masters.json();
      setParents((Array.isArray(data.classifications)?data.classifications:[])
        .filter((row:{kind:string;retiredAt:string|null})=>row.kind==="MAJOR"&&!row.retiredAt)
        .map((row:{name:string})=>row.name)
        .sort((a:string,b:string)=>a.localeCompare(b,"ja",{numeric:true})));
    }
  },[]);
  useEffect(()=>{void load().catch(e=>setError(String(e)));},[load]);
  const chosen=useMemo(()=>records.find(r=>r.id===selected)||null,[records,selected]);
  const filtered=records.filter(r=>type==="ALL"||r.entityType===type);
  function selectRecord(r:ArchiveRecord){
    setSelected(r.id);setName(getLabel(r));
    setParent(typeof r.snapshot?.parentName==="string"?r.snapshot.parentName:"");
    setMessage("");setError("");
  }
  async function register(){
    if(!chosen || !name.trim() || busy)return;
    setBusy(true);setMessage("");setError("");
    try{
      const response=await fetch("/api/admin/archive-records",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({archiveId:chosen.id,confirmation:"REGISTER_AS_NEW",name,parentName:parent}),
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.message||"再登録できませんでした。");
      setMessage("新しいIDで登録しました。旧廃止記録は保持しています。");
      await load();
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  return <main className="mx-auto max-w-6xl px-4 py-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-black">廃止記録管理</h1><p className="mt-1 text-sm text-slate-600">通常の商品・分類・在庫とは独立して保管された記録です。管理者のみ操作できます。</p></div>
      <a href="/admin/classifications" className="rounded-xl border px-4 py-3 font-bold">分類・保管場所へ戻る</a>
    </div>
    {error&&<p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-red-900">{error}</p>}
    {message&&<p role="status" className="mb-3 rounded-xl bg-green-50 p-3 text-green-900">{message}</p>}
    <label className="mb-3 block text-sm font-bold">記録の種類
      <select value={type} onChange={e=>setType(e.target.value)} className="ml-2 rounded-lg border p-2">
        <option value="ALL">すべて</option><option value="CLASSIFICATION">分類</option><option value="STORAGE_LOCATION">保管場所</option>
      </select>
    </label>
    <div className="grid gap-4 md:grid-cols-2">
      <section aria-label="廃止記録一覧" className="min-h-48 space-y-2 rounded-2xl border bg-white p-3">
        {filtered.length===0?<p className="p-4 text-slate-600">保存された廃止記録はありません。従来の退役フラグ付きデータは、まだこの領域に移行していません。</p>:filtered.map(r=>
          <button key={r.id} type="button" onClick={()=>selectRecord(r)} className={"w-full rounded-xl border p-3 text-left "+(selected===r.id?"border-blue-600 bg-blue-50":"hover:bg-slate-50")}>
            <span className="block font-bold">{getLabel(r)}</span>
            <span className="text-xs text-slate-600">{r.entityType==="CLASSIFICATION"?"分類":"保管場所"} ／ {new Date(r.archivedAt).toLocaleString("ja-JP")} ／ 再登録 {r.reRegistrations.length}回</span>
          </button>
        )}
      </section>
      <section aria-label="廃止記録の詳細" className="rounded-2xl border bg-white p-4">
        {!chosen?<p className="text-slate-600">左の記録を選択すると、詳細と再登録が表示されます。</p>:<>
          <h2 className="mb-2 text-xl font-black">{getLabel(chosen)}</h2>
          <p className="mb-4 text-sm text-slate-600">旧ID: {chosen.originalId} ／ 理由: {chosen.reason||"記載なし"}</p>
          <div className="mb-3 rounded-xl bg-slate-50 p-3 text-xs"><p className="mb-1 font-bold">廃止時の保存内容</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(chosen.snapshot,null,2)}</pre></div>
          <h3 className="font-black">廃止記録を元に新規登録</h3>
          <p className="mt-1 text-sm text-slate-600">元のレコードは復活させません。現在の登録制約で新IDを発行します。</p>
          <label className="mt-3 block text-sm font-bold">登録する名称
            <input value={name} onChange={e=>setName(e.target.value)} maxLength={100} className="mt-1 w-full rounded-lg border p-3"/>
          </label>
          {chosen.entityType==="CLASSIFICATION"&&chosen.snapshot.kind==="MINOR"&&
          <label className="mt-3 block text-sm font-bold">登録先の有効な大分類
            <select value={parent} onChange={e=>setParent(e.target.value)} className="mt-1 w-full rounded-lg border p-3">
              <option value="">選択してください</option>{parents.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </label>}
          <button type="button" disabled={busy||!name.trim()} onClick={()=>void register()} className="mt-4 w-full rounded-xl bg-blue-700 p-3 font-bold text-white disabled:opacity-40">新しいIDで登録する</button>
        </>}
      </section>
    </div>
  </main>;
}
