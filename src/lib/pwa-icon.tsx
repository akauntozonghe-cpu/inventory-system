import { ImageResponse } from "next/og";

export function createPwaIcon(size: 192 | 512) {
  const scale = size / 512;
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", position: "relative", overflow: "hidden", alignItems: "center", justifyContent: "center", borderRadius: 108 * scale, background: "linear-gradient(145deg,#155e75 0%,#0f172a 48%,#020617 100%)", color: "white" }}>
    <div style={{ position: "absolute", width: 300 * scale, height: 300 * scale, borderRadius: 999, left: -105 * scale, top: -115 * scale, background: "rgba(34,211,238,.20)" }} />
    <div style={{ display: "flex", position: "absolute", left: 74 * scale, top: 74 * scale, fontSize: 54 * scale, fontWeight: 900, letterSpacing: -5 * scale, color: "#a5f3fc" }}>IO</div>
    <div style={{ display: "flex", position: "absolute", left: 72 * scale, top: 178 * scale, width: 368 * scale, height: 230 * scale, borderRadius: 42 * scale, border: `${10 * scale}px solid rgba(255,255,255,.85)`, background: "linear-gradient(135deg,#0ea5e9,#4338ca)", boxShadow: `0 ${24 * scale}px ${50 * scale}px rgba(14,165,233,.32)` }} />
    <div style={{ display: "flex", position: "absolute", left: 106 * scale, top: 216 * scale, width: 300 * scale, height: 104 * scale, alignItems: "stretch", justifyContent: "space-between", padding: `${18 * scale}px ${22 * scale}px`, borderRadius: 20 * scale, background: "white" }}>{[8,4,12,5,8,4,11,6,9,4,12].map((width,index)=><div key={index} style={{ display: "flex", width: width * scale, background: index % 3 === 0 ? "#0284c7" : "#0f172a" }} />)}</div>
    <div style={{ display: "flex", position: "absolute", left: 112 * scale, top: 347 * scale, fontSize: 25 * scale, fontWeight: 900, letterSpacing: 4 * scale }}>INVENTORY OS</div>
    <div style={{ display: "flex", position: "absolute", right: 54 * scale, top: 56 * scale, width: 94 * scale, height: 94 * scale, borderRadius: 999, alignItems: "center", justifyContent: "center", background: "#10b981", border: `${8 * scale}px solid rgba(255,255,255,.9)`, fontSize: 54 * scale, fontWeight: 900 }}>✓</div>
  </div>, { width: size, height: size, headers: { "Cache-Control": "public, max-age=31536000, immutable" } });
}
