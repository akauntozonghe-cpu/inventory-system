import JsBarcode from "jsbarcode";

export type LabelScale = 0.8 | 1;
export const escapeLabelText = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));

/** GS1 Japan: X=0.33mm, JAN-13 37.29×25.93mm, JAN-8 26.73×21.31mm at 100%. */
export function barcodeLabel(value: string, scale: LabelScale = 0.8) {
  if (scale !== 0.8 && scale !== 1) throw new Error("印刷倍率は80%または100%を選択してください。");
  const ean = /^\d{13}$/.test(value) ? "EAN13" : /^\d{8}$/.test(value) ? "EAN8" : null;
  if (!ean && !/^SYS-[A-Z0-9-]+$/.test(value)) throw new Error(`コード「${value || "入力なし"}」は${value.length}文字です。商品に印字された8桁または13桁の数字を確認してください。桁を勝手に追加・省略せず、JANがない商品はシステムJANを発行してください。`);
  const encoded: { encodings?: Array<{ data: string }> } = {};
  try { JsBarcode(encoded, value, { format: ean ?? "CODE128", displayValue: false, flat: true }); }
  catch { throw new Error(`コード「${value}」の検査数字が正しくありません。商品情報を修正してください。`); }
  const bits = encoded.encodings?.map((entry) => entry.data).join("");
  if (!bits) throw new Error("バーコードを生成できませんでした。");
  const x = 0.33 * scale;
  const left = ean === "EAN13" ? 11 : ean === "EAN8" ? 7 : 10;
  const right = ean ? 7 : 10;
  const modules = left + bits.length + right;
  const barHeight = (ean === "EAN8" ? 18.23 : 22.85) / 0.33;
  const height = (ean === "EAN8" ? 21.31 : 25.93) * scale;
  const width = modules * x;
  const baseline = height / x - 2;
  const middle = ean === "EAN13" ? 45 : 31;
  const bars = [...bits].map((bit, index) => {
    const guard = ean && (index < 3 || (index >= middle && index < middle + 5) || index >= bits.length - 3);
    return bit === "1" ? `<rect x="${left + index}" y="0" width="1" height="${barHeight + (guard ? 5 : 0)}"/>` : "";
  }).join("");
  const digit = (text: string, position: number) => `<text x="${position}" y="${baseline}" text-anchor="middle">${text}</text>`;
  const humanReadable = ean === "EAN13"
    ? digit(value[0], left - 5) + [...value.slice(1, 7)].map((n, i) => digit(n, left + 6.5 + i * 7)).join("") + [...value.slice(7)].map((n, i) => digit(n, left + 53.5 + i * 7)).join("")
    : ean === "EAN8"
      ? [...value.slice(0, 4)].map((n, i) => digit(n, left + 6.5 + i * 7)).join("") + [...value.slice(4)].map((n, i) => digit(n, left + 39.5 + i * 7)).join("")
      : digit(value, modules / 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(3)}mm" height="${height.toFixed(3)}mm" viewBox="0 0 ${modules} ${height / x}" role="img" aria-label="${value}"><rect width="100%" height="100%" fill="white"/><g fill="black" shape-rendering="crispEdges">${bars}</g><g fill="black" font-family="Arial, sans-serif" font-size="8.3">${humanReadable}</g></svg>`;
  return { svg, bits, width, height, quietLeft: left * x, quietRight: right * x, moduleWidth: x, labelWidth: Math.ceil(width + 2), labelHeight: Math.ceil(height + 5) };
}

export function barcodePrintDocument(items: Array<{ name: string; barcode: string }>, layout: "A4" | "LABEL" = "A4", scale: LabelScale = 0.8, includeName = true) {
  if (!items.length) throw new Error("印刷する商品を選択してください。");
  const labels = items.map((item) => {try{return { ...barcodeLabel(item.barcode, scale), name: item.name };}catch(error){throw new Error(`商品「${item.name}」：${error instanceof Error?error.message:"ラベルを作成できません。"}`);}});
  const labelHeight = Math.max(...labels.map(label=>includeName?label.labelHeight:Math.ceil(label.height+2)));
  const pageWidth = layout === "A4" ? 194 : Math.max(...labels.map((label) => label.labelWidth));
  const pageHeight = layout === "A4" ? 281 : labelHeight;
  const pages: string[][] = [[]];
  let rowWidth = 0, rowTop = 0;
  for (const label of labels) {
    if (label.labelWidth > pageWidth) throw new Error("このコードは用紙の幅を超えています。コードを確認してください。");
    if (rowWidth && rowWidth + 2 + label.labelWidth > pageWidth) { rowWidth = 0; rowTop += labelHeight + 2; }
    if (rowTop + labelHeight > pageHeight) { pages.push([]); rowTop = 0; rowWidth = 0; }
    pages[pages.length - 1].push(`<article class="label" style="width:${label.labelWidth}mm;height:${labelHeight}mm">${includeName ? `<p>${escapeLabelText(label.name)}</p>` : ""}${label.svg}</article>`);
    rowWidth += (rowWidth ? 2 : 0) + label.labelWidth;
    if (layout === "LABEL") { rowWidth = pageWidth; }
  }
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>商品バーコードラベル</title><style>
  @page { size:${layout === "A4" ? "A4 portrait" : `${pageWidth}mm ${pageHeight}mm`}; margin:${layout === "A4" ? "8mm" : "0"}; }
  *{box-sizing:border-box}body{margin:0;background:white;color:black;font-family:Arial,sans-serif}
  .sheet{display:flex;flex-wrap:wrap;align-content:flex-start;gap:2mm;width:${pageWidth}mm;break-after:page}.sheet:last-child{break-after:auto}
  .label{flex:none;padding:1mm;break-inside:avoid;outline:0.1mm dashed #aaa;overflow:hidden}
  .label p{margin:0 0 .4mm;height:2.6mm;line-height:2.6mm;font-size:6.5pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  svg{display:block;margin:0 auto;max-width:none;flex:none}
  .instructions{padding:12px;font-size:14px}.instructions button{margin:8px;padding:8px}
  @media print{.instructions{display:none}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body><div class="instructions">印刷倍率は「100%／実際のサイズ」、余白・ヘッダー・フッターは印刷画面に合わせてください。「用紙に合わせる」で縮小しないでください。まず1枚を印刷して読み取りを確認してください。<button onclick="window.print()">印刷する</button></div>${pages.map((page) => `<main class="sheet">${page.join("")}</main>`).join("")}</body></html>`;
}
