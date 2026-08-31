type ProductDetail = {
  name: string;
  janCode?: string | null;
  systemBarcode?: string | null;
  managementCode?: string | null;
  managementGroupCode?: string | null;
  manufacturer?: string | null;
  majorCategory?: string | null;
  minorCategory?: string | null;
  defaultUnit?: string | null;
  storageLocationName?: string | null;
  lotNo?: string | null;
  expirationDate?: string | null;
  quantity?: number | null;
  expectedQuantity?: number | null;
  countedQuantity?: number | null;
  stocktakeStatus?: string | null;
  stocktakeAt?: string | null;
  updatedAt?: string | null;
};

type ProductDetailPanelProps = {
  product: ProductDetail;
  compact?: boolean;
};

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split("-");
    return `${year}年${Number(month)}月`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
  }).format(date);
}

function DetailCell({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs font-bold text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-bold text-slate-900">
        {value === null || value === undefined || value === ""
          ? "-"
          : value}
      </dd>
    </div>
  );
}

export default function ProductDetailPanel({
  product,
  compact = false,
}: ProductDetailPanelProps) {
  const expectedQuantity =
    product.expectedQuantity ?? product.quantity ?? null;

  const difference =
    product.countedQuantity === null ||
    product.countedQuantity === undefined ||
    expectedQuantity === null
      ? null
      : product.countedQuantity - expectedQuantity;

  const category =
    [product.majorCategory, product.minorCategory]
      .filter(Boolean)
      .join(" / ") || "-";

  return (
    <details
      open={!compact}
      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 marker:hidden">
        <div>
          <p className="text-xs font-bold tracking-widest text-blue-600">
            PRODUCT DETAIL
          </p>

          <h2 className="mt-1 text-xl font-black text-slate-900">
            {product.name}
          </h2>

          <p className="mt-1 text-sm text-slate-600">
            {product.storageLocationName
              ? `保管場所：${product.storageLocationName}`
              : "保管場所未設定"}
          </p>
        </div>

        <span className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 group-open:hidden">
          詳細を見る
        </span>

        <span className="hidden rounded-xl bg-slate-800 px-3 py-2 text-sm font-bold text-white group-open:inline">
          閉じる
        </span>
      </summary>

      <div className="border-t border-slate-200 p-5">
        <section>
          <h3 className="font-black text-slate-900">商品情報</h3>

          <dl className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailCell label="既存JANコード" value={product.janCode} />
            <DetailCell
              label="システムJAN"
              value={product.systemBarcode}
            />
            <DetailCell
              label="商品管理コード"
              value={product.managementCode}
            />
            <DetailCell
              label="管理グループコード"
              value={product.managementGroupCode}
            />
            <DetailCell label="メーカー" value={product.manufacturer} />
            <DetailCell label="分類" value={category} />
            <DetailCell
              label="基本単位"
              value={product.defaultUnit}
            />
          </dl>
        </section>

        <section className="mt-6 border-t border-slate-200 pt-5">
          <h3 className="font-black text-slate-900">在庫情報</h3>

          <dl className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailCell
              label="保管場所"
              value={product.storageLocationName}
            />
            <DetailCell label="ロット番号" value={product.lotNo} />
            <DetailCell
              label="使用期限"
              value={formatDate(product.expirationDate)}
            />
            <DetailCell
              label="理論在庫"
              value={
                expectedQuantity === null
                  ? "-"
                  : `${expectedQuantity}${product.defaultUnit ?? ""}`
              }
            />
            <DetailCell
              label="棚卸入力値"
              value={
                product.countedQuantity === null ||
                product.countedQuantity === undefined
                  ? "未入力"
                  : `${product.countedQuantity}${product.defaultUnit ?? ""}`
              }
            />
            <DetailCell
              label="最終更新"
              value={formatDate(product.updatedAt)}
            />
          </dl>
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          <div
            className={`rounded-xl p-4 ${
              difference === null
                ? "bg-slate-100"
                : difference === 0
                  ? "bg-emerald-50"
                  : "bg-red-50"
            }`}
          >
            <p className="text-sm font-bold text-slate-600">棚卸差異</p>
            <p
              className={`mt-1 text-2xl font-black ${
                difference === null
                  ? "text-slate-500"
                  : difference === 0
                    ? "text-emerald-600"
                    : "text-red-600"
              }`}
            >
              {difference === null
                ? "未入力"
                : `${difference > 0 ? "+" : ""}${difference}${
                    product.defaultUnit ?? ""
                  }`}
            </p>
          </div>

          <div className="rounded-xl bg-slate-100 p-4">
            <p className="text-sm font-bold text-slate-600">
              棚卸ステータス
            </p>
            <p className="mt-1 text-2xl font-black text-slate-900">
              {product.stocktakeStatus ?? "未棚卸"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              棚卸日時：{formatDate(product.stocktakeAt)}
            </p>
          </div>
        </section>
      </div>
    </details>
  );
}
