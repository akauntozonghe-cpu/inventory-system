/** Internal identifiers remain in data and links; only the assigned barcode is shown. */
export default function ProductIdentity({item}:{item:{id?:string;janCode?:string|null;systemBarcode?:string|null};inventoryId?:string}) {
  const jan = item.janCode?.trim();
  const code = jan || item.systemBarcode?.trim();
  if (!code) return null;
  return <dl className="my-2 grid gap-1 text-sm text-slate-600"><div><dt className="inline font-bold">{jan ? "JAN" : "システムJAN"}：</dt><dd className="inline break-all font-mono">{code}</dd></div></dl>;
}
