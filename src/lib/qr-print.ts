import { escapeLabelText } from "./barcode-label";
export function qrPrintDocument(labels: { name: string; image: string; kind?:string }[]) {
  if (!labels.length) throw new Error("印刷するQRラベルを選択してください。");
  const pages: string[] = [];
  for (let offset = 0; offset < labels.length; offset += 9) {
    pages.push(`<main class="sheet">${labels.slice(offset, offset + 9).map(label => `<article class="label"><p>${escapeLabelText(label.kind??"大分類")} · ${label.kind==="保管場所"?"読むとこの棚の在庫を表示":"読むとこの分類の商品を表示"}</p><h1>${escapeLabelText(label.name)}</h1><img src="${escapeLabelText(label.image)}" alt="${escapeLabelText(label.kind??"大分類")}QR" /></article>`).join("")}</main>`);
  }
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>分類・保管場所QRラベル</title><style>
  @page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{margin:0;color:#000;background:#fff;font-family:Arial,sans-serif}
  .sheet{display:grid;grid-template-columns:repeat(3,60mm);grid-auto-rows:70mm;gap:4mm;width:188mm;break-after:page}.sheet:last-child{break-after:auto}
  .label{width:60mm;height:70mm;padding:2mm;border:.1mm dashed #aaa;text-align:center;break-inside:avoid;overflow:hidden}
  p{margin:0;font-size:7pt;line-height:2.5mm;height:5mm;overflow:hidden}h1{font-size:12pt;line-height:4mm;height:8mm;margin:.5mm 0;overflow:hidden;overflow-wrap:anywhere}
  img{display:block;width:50mm;height:50mm;margin:0 auto;image-rendering:pixelated}
  .instructions{padding:12px;font-size:14px}.instructions button{padding:10px;margin:8px}
  @media print{.instructions{display:none}}
  </style></head><body><div class="instructions">箱・棚用ラベル60×70mm・QR部分50mm角。印刷倍率は100%／実際のサイズにしてください。<button onclick="window.print()">印刷する</button></div>${pages.join("")}</body></html>`;
}
