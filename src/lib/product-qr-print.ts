import { barcodeLabel, escapeLabelText, type LabelProfile, type LabelScale } from "./barcode-label";

export type ProductQrMode = "QR" | "BOTH";
export type ProductQrLabel = { name: string; barcode: string; image: string };

/**
 * Product QR encodes the exact, currently registered product barcode string.
 * This is intentionally the same raw code returned by a JAN scan:
 * parseScan(code) -> ITEM and resolveScan(code) -> ITEM.
 * Never use an item URL or opaque JSON payload in place of a registered code.
 */
export function productQrPrintDocument(
  labels: ProductQrLabel[],
  mode: ProductQrMode,
  layout: "A4" | "LABEL" = "A4",
  scale: LabelScale = 0.8,
  profile: LabelProfile = "COMPACT",
  includeName = true,
) {
  if (!labels.length) throw new Error("印刷する商品を選択してください。");
  if (mode !== "QR" && mode !== "BOTH") throw new Error("印刷形式が正しくありません。");

  const labelWidth = 60, labelHeight = 70;
  const rendered = labels.map(row => {
    const code = row.barcode.trim();
    // Validate against the existing JAN/legacy-system-code rules. A QR must
    // never encode a missing or broken identifier that scanners cannot find.
    const barcode = barcodeLabel(code, scale, profile);
    if (mode === "BOTH" && barcode.width > 55) {
      throw new Error(`商品「${row.name}」のコードは幅が広すぎるため、JAN＋QRを同じラベルに収められません。QRのみを選ぶかコードを確認してください。`);
    }
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(row.image)) {
      throw new Error(`商品「${row.name}」のQR画像を確認できません。`);
    }
    const qrSize = mode === "QR" ? 46
      : Math.max(24, Math.min(38, 62 - barcode.height - (includeName ? 6 : 0)));
    return `<article class="label">
      ${includeName ? `<p class="name" title="${escapeLabelText(row.name)}">${escapeLabelText(row.name)}</p>` : ""}
      <img class="qr" width="600" height="600" style="width:${qrSize.toFixed(2)}mm;height:${qrSize.toFixed(2)}mm" src="${row.image}" alt="商品QR" />
      ${mode === "BOTH" ? `<div class="barcode">${barcode.svg}</div>` : ""}
      <p class="code">${escapeLabelText(code)}</p>
    </article>`;
  });
  const sheets: string[] = [];
  const pageSize = layout === "A4" ? 9 : 1;
  for (let start = 0; start < rendered.length; start += pageSize) {
    sheets.push(`<main class="sheet">${rendered.slice(start, start + pageSize).join("")}</main>`);
  }
  const pageSizeCss = layout === "A4" ? "A4 portrait" : `${labelWidth}mm ${labelHeight}mm`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${mode === "BOTH" ? "商品JAN＋QR" : "商品QR"}一括印刷</title><style>
    @page{size:${pageSizeCss};margin:${layout === "A4" ? "8mm" : "0"}}
    *{box-sizing:border-box}html,body{margin:0;padding:0;color:#000;font-family:Arial,sans-serif;background:#fff}
    .sheet{width:${layout === "A4" ? "188mm" : "60mm"};display:grid;grid-template-columns:repeat(${layout === "A4" ? 3 : 1},60mm);grid-auto-rows:70mm;gap:${layout === "A4" ? "4mm" : "0"};break-after:page;page-break-after:always}
    .sheet:last-child{break-after:auto;page-break-after:auto}
    .label{width:60mm;height:70mm;overflow:hidden;padding:2mm;display:flex;flex-direction:column;align-items:center;justify-content:center;break-inside:avoid;page-break-inside:avoid;border:.1mm dashed #bbb}
    .name{max-width:100%;margin:0 0 1mm;line-height:5mm;height:5mm;font-size:9pt;font-weight:bold;text-align:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .qr{display:block;object-fit:contain;image-rendering:pixelated;flex:none}
    .barcode{display:block;max-width:56mm;flex:none;margin-top:.6mm}
    .barcode svg{display:block;margin:0 auto}
    .code{margin:.6mm 0 0;max-width:100%;height:3.5mm;line-height:3.5mm;overflow:hidden;font-size:7pt;font-family:monospace;text-align:center;white-space:nowrap}
    .notice{padding:12px;font-size:14px;background:#f1f5f9;position:sticky;top:0}
    .notice button{padding:8px;margin:8px}
    @media print{.notice{display:none}.label{border-color:transparent}}
    @media screen{body{background:#eee}.sheet{margin:8mm auto;background:white;box-shadow:0 0 6px #aaa}}
  </style></head><body><div class="notice"><strong>${labels.length}枚・${sheets.length}ページ</strong> ／ 60×70mm（QR ${mode === "BOTH" ? "＋ JAN" : "のみ"}）。印刷倍率100%・実際のサイズ、ヘッダー/フッターはオフ。まず1枚試し印刷して読み取ってください。<button onclick="window.print()">印刷する</button></div>${sheets.join("")}</body></html>`;
}
