import { escapeLabelText } from "./barcode-label";
export function qrPrintDocument(labels: { name: string; image: string }[]) {
  if (!labels.length) throw new Error("印刷する大分類を選択してください。");
  const pages: string[] = [];
  for (let offset = 0; offset < labels.length; offset += 9) {
    pages.push(`<main class="sheet">${labels.slice(offset, offset + 9).map(label => `<article class="label"><p>大分類</p><h1>${escapeLabelText(label.name)}</h1><img src="${escapeLabelText(label.image)}" alt="大分類QR" /></article>`).join("")}</main>`);
  }
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>箱用・大分類QRラベル</title><style>
  @page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{margin:0;color:#000;background:#fff;font-family:Arial,sans-serif}
  .sheet{display:grid;grid-template-columns:repeat(3,60mm);grid-auto-rows:70mm;gap:4mm;width:188mm;break-after:page}.sheet:last-child{break-after:auto}
  .label{width:60mm;height:70mm;padding:2mm;border:.1mm dashed #aaa;text-align:center;break-inside:avoid;overflow:hidden}
  p{margin:0;font-size:8pt;line-height:3mm}h1{font-size:12pt;line-height:5mm;height:10mm;margin:1mm 0;overflow:hidden;overflow-wrap:anywhere}
  img{display:block;width:50mm;height:50mm;margin:0 auto;image-rendering:pixelated}
  .instructions{padding:12px;font-size:14px}.instructions button{padding:10px;margin:8px}
  @media print{.instructions{display:none}}
  </style></head><body><div class="instructions">箱用ラベル60×70mm・QR部分50mm角。印刷倍率は100%／実際のサイズにしてください。<button onclick="window.print()">印刷する</button></div>${pages.join("")}</body></html>`;
}
