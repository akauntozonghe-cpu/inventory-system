"use client";

type Props = {
  open: boolean;
  adminName: string;
  onClose: () => void;
  onRegisterItem: () => void;
  onIssueBarcode: () => void;
  onOpenErrorReports: () => void;
  onReload: () => void;
  onExitAdminMode: () => void;
};

export default function StocktakeAdminMenu({
  open,
  adminName,
  onClose,
  onRegisterItem,
  onIssueBarcode,
  onOpenErrorReports,
  onReload,
  onExitAdminMode,
}: Props) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[75] overflow-y-auto bg-slate-950/70 p-4">
      <div className="mx-auto flex min-h-full max-w-lg items-center">
        <section className="w-full rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-violet-600">管理者モード</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">
                棚卸管理メニュー
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                認証者：{adminName}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700"
            >
              閉じる
            </button>
          </div>

          <div className="mt-6 grid gap-3">
            <button
              type="button"
              onClick={onRegisterItem}
              className="rounded-2xl border-2 border-blue-100 bg-blue-50 p-4 text-left"
            >
              <span className="block font-black text-blue-950">
                ＋ 未登録商品を追加
              </span>
              <span className="mt-1 block text-sm text-blue-800">
                棚卸中に見つかった未登録商品を登録し、棚卸対象へ追加します。
              </span>
            </button>

            <button
              type="button"
              onClick={onIssueBarcode}
              className="rounded-2xl border-2 border-violet-100 bg-violet-50 p-4 text-left"
            >
              <span className="block font-black text-violet-950">
                バーコードを発行・確認
              </span>
              <span className="mt-1 block text-sm text-violet-800">
                JANがない商品にシステムバーコードを発行します。
              </span>
            </button>

            <button
              type="button"
              onClick={onReload}
              className="rounded-2xl border-2 border-emerald-100 bg-emerald-50 p-4 text-left"
            >
              <span className="block font-black text-emerald-950">
                棚卸対象を再読み込み
              </span>
              <span className="mt-1 block text-sm text-emerald-800">
                商品登録・在庫変更後の最新状態を画面へ反映します。
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenErrorReports}
              className="rounded-2xl border-2 border-amber-100 bg-amber-50 p-4 text-left"
            >
              <span className="block font-black text-amber-950">
                エラーレポートを確認
              </span>
              <span className="mt-1 block text-sm text-amber-800">
                自動復旧できなかったエラーと対応状況を確認します。
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={onExitAdminMode}
            className="mt-5 min-h-12 w-full rounded-2xl bg-slate-800 px-4 py-3 font-bold text-white"
          >
            管理者モードを終了
          </button>
        </section>
      </div>
    </div>
  );
}