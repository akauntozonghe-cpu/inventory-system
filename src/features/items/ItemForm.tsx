type Props = {
  name: string;
  janCode: string;

  isEdit?: boolean;

  setName: (value: string) => void;
  setJanCode: (value: string) => void;

  onSubmit: () => void;
  onCancel?: () => void;
};

export default function ItemForm({
  name,
  janCode,
  isEdit = false,
  setName,
  setJanCode,
  onSubmit,
  onCancel,
}: Props) {
  return (
    <div className="rounded-xl bg-white p-6 shadow">

      <h2 className="mb-6 text-xl font-semibold">
        {isEdit ? "商品編集" : "商品登録"}
      </h2>

      <div className="space-y-4">

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="商品名"
          className="w-full rounded-lg border p-3"
        />

        <input
          value={janCode}
          onChange={(e) => setJanCode(e.target.value)}
          placeholder="JANコード"
          className="w-full rounded-lg border p-3"
        />

        <div className="flex gap-3">

          <button
            onClick={onSubmit}
            className="flex-1 rounded-lg bg-blue-600 p-3 font-semibold text-white hover:bg-blue-700"
          >
            {isEdit ? "更新する" : "登録する"}
          </button>

          {isEdit && onCancel && (
            <button
              onClick={onCancel}
              className="rounded-lg border px-5 py-3 hover:bg-gray-100"
            >
              キャンセル
            </button>
          )}

        </div>

      </div>

    </div>
  );
}