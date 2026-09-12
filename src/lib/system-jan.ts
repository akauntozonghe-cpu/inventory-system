import { randomInt } from "node:crypto";
export function generateSystemJan() {
  const base = "20" + String(randomInt(0, 10_000_000_000)).padStart(10, "0");
  const sum = [...base].reduce((n, digit, i) => n + Number(digit) * (i % 2 ? 3 : 1), 0);
  return base + (10 - sum % 10) % 10;
}
