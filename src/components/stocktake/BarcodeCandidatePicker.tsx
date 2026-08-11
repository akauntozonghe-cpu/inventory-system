"use client";

export type BarcodeCandidate = {
  id: string;
  expectedQuantity: number;
  countedQuantity: number | null;
  isRecorded: boolean;
  lotNo: string | null;
  expirationDate: string | null;
  unit: string | null;
  item: {
    name: string;
    janCode: string | null;
    systemBarcode: string | null;
  };
  storageLocation: {
    name: string;
  } | null;
};

type BarcodeCandidatePickerProps = {
  barcode: string;
  candidates: BarcodeCandidate[];
  onSelect: (candidate: BarcodeCandidate) => void;
  onClose: () => void;
};

export default function BarcodeCandidatePicker({
  barcode,
  candidates,
  onSelect,
  onClose,
}: BarcodeCandidatePickerProps) {
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/70 p-4">
      <div className="mx-auto flex min-h-full max-w-xl items-center">
        <section className="w-full rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-blue-600">
                バーコードを読み取りました
              </p>

              <h2 className="mt-1 text-2xl font-black text-slate-950">
                棚卸する対象を選んでください
              </h2>

              <p className="mt-2 break-all text-sm text-slate-600">
                読取コード：{barcode}
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

          <p className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            同じJANの商品が複数あります。保管場所・ロット番号・使用期限を確認して選んでください。
          </p>

          <div className="mt-5 space-y-3">
            {candidates.map((candidate) => {
              const unit = candidate.unit ?? "";
              const difference =
                candidate.countedQuantity === null
                  ? null
                  : candidate.countedQuantity -
                    candidate.expectedQuantity;

              const status =
                !candidate.isRecorded
                  ? "未棚卸"
                  : difference === 0
                    ? "一致"
                    : "差異あり";

              const statusClass =
                !candidate.isRecorded
                  ? "bg-orange-100 text-orange-700"
                  : difference === 0
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-700";

              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => onSelect(candidate)}
                  className="w-full rounded-2xl border-2 border-slate-200 p-4 text-left transition hover:border-blue-500 hover:bg-blue-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-black text-slate-950">
                        {candidate.item.name}
                      </h3>

                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                        <div>
                          <dt className="font-bold text-slate-500">
                            保管場所
                          </dt>
                          <dd className="mt-1 font-semibold text-slate-900">
                            {candidate.storageLocation?.name ?? "未設定"}
                          </dd>
                        </div>

                        <div>
                          <dt className="font-bold text-slate-500">
                            ロット番号
                          </dt>
                          <dd className="mt-1 font-semibold text-slate-900">
                            {candidate.lotNo ?? "-"}
                          </dd>
                        </div>

                        <div>
                          <dt className="font-bold text-slate-500">
                            使用期限
                          </dt>
                          <dd className="mt-1 font-semibold text-slate-900">
                            {candidate.expirationDate ?? "-"}
                          </dd>
                        </div>

                        <div>
                          <dt className="font-bold text-slate-500">
                            現在庫
                          </dt>
                          <dd className="mt-1 font-black text-blue-600">
                            {candidate.expectedQuantity}
                            {unit}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${statusClass}`}
                    >
                      {status}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}