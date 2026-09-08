import Link from "next/link";
export default function SectionNavigation({ label, current, links }: { label: string; current: string; links: readonly { href: string; label: string }[] }) {
  return <nav aria-label={label} className="my-4 flex flex-wrap gap-2">{links.map(link => <Link key={link.href} href={link.href} aria-current={current === link.href ? "page" : undefined} className={"rounded-xl px-4 py-2 text-sm font-bold " + (current === link.href ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700")}>{link.label}</Link>)}</nav>;
}
export const marketplaceLinks = [{ href: "/marketplace", label: "出品・発送" }, { href: "/admin/marketplace/advisor", label: "価格・送料の試算" }, { href: "/admin/marketplace/settings", label: "販売・配送設定" }];
export const classificationLinks = [{ href: "/admin/classifications", label: "分類・保管場所" }, { href: "/admin/category-qr", label: "大分類QRの印刷" }];
