"use client";
type Props = { page: number; totalPages: number; start: number; end: number; total: number; onPageChange: (page: number) => void };
export default function Pagination({ page, totalPages, start, end, total, onPageChange }: Props) {
  return <nav aria-label="一覧のページ切り替え" className="my-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
    <p role="status" aria-live="polite" className="text-sm font-bold text-slate-600">{total === 0 ? "0件" : `${total}件中 ${start + 1}–${end}件`}</p>
    {totalPages > 1 && <div className="flex items-center gap-2">
      <button type="button" aria-label="前のページ" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="min-h-11 rounded-xl border px-4 font-bold disabled:opacity-40">前へ</button>
      <span className="min-w-16 text-center text-sm font-bold">{page} / {totalPages}</span>
      <button type="button" aria-label="次のページ" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="min-h-11 rounded-xl border px-4 font-bold disabled:opacity-40">次へ</button>
    </div>}
  </nav>;
}
