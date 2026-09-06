import { ImageResponse } from "next/og";

export function createPwaIcon(size: 192 | 512) {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "22%", background: "#080d19" }}>
    <svg width="72%" height="72%" viewBox="0 0 384 384" fill="none">
      <rect x="12" y="12" width="360" height="360" rx="92" fill="#0d1526" stroke="#1e293b" strokeWidth="8" />
      <path d="M192 74 326 148 192 222 58 148 192 74Z" fill="#2dd4bf" />
      <path d="M58 148 192 222v100L58 248V148Z" fill="#f8fafc" />
      <path d="M326 148 192 222v100l134-74V148Z" fill="#64748b" />
      <path d="M192 222v100" stroke="#0d1526" strokeWidth="12" />
      <path d="m122 113 135 74" stroke="#0d1526" strokeWidth="12" strokeLinecap="round" />
    </svg>
  </div>, { width: size, height: size, headers: { "Cache-Control": "public, max-age=31536000, immutable" } });
}
