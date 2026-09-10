import { expect, it } from "vitest";
import fs from "node:fs";
it("keeps the field scanner optimized for both JAN and QR and accepts minor QR for stocktake scope",()=>{
  const source=fs.readFileSync(new URL("../src/components/FieldScanButton.tsx",import.meta.url),"utf8");
  expect(source).toContain('title={kind === "JAN" ? "JAN・QRを読み取る"');
  expect(source).toContain('if (kind !== "MINOR" && kind !== "SCOPE")');
  expect(source).toContain("大分類・小分類・保管場所のQR");
});
