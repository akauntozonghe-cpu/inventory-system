"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type FormData = {
  managementCode: string;
  managementGroupCode: string;
  janCode: string;
  name: string;
  manufacturer: string;
  majorCategory: string;
  minorCategory: string;
  defaultUnit: string;
};

export default function EditItemPage() {
  const params = useParams();
  const router = useRouter();

  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<FormData>({
    managementCode: "",
    managementGroupCode: "",
    janCode: "",
    name: "",
    manufacturer: "",
    majorCategory: "",
    minorCategory: "",
    defaultUnit: "",
  });

  async function loadItem() {
    try {
      const res = await fetch(`/api/items/${id}`);

      if (!res.ok) {
        throw new Error();
      }

      const item = await res.json();

      setForm({
        managementCode: item.managementCode ?? "",
        managementGroupCode: item.managementGroupCode ?? "",
        janCode: item.janCode ?? "",
        name: item.name ?? "",
        manufacturer: item.manufacturer ?? "",
        majorCategory: item.majorCategory ?? "",
        minorCategory: item.minorCategory ?? "",
        defaultUnit: item.defaultUnit ?? "",
      });
    } catch {
      alert("商品の取得に失敗しました。");
      router.back();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) {
      loadItem();
    }
  }, [id]);

  function updateField(
    key: keyof FormData,
    value: string
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-8">

      <h1 className="text-3xl font-bold mb-8">
        商品編集
      </h1>

      <div className="space-y-6">

        <div>
          <label className="block mb-2 font-semibold">
            商品名
          </label>

          <input
            className="w-full rounded-lg border p-3"
            value={form.name}
            onChange={(e) =>
              updateField("name", e.target.value)
            }
          />
        </div>

        <div>
          <label className="block mb-2 font-semibold">
            JANコード
          </label>

          <input
            className="w-full rounded-lg border p-3"
            value={form.janCode}
            onChange={(e) =>
              updateField("janCode", e.target.value)
            }
          />
        </div>

        <div>
          <label className="block mb-2 font-semibold">
            管理番号
          </label>

          <input
            className="w-full rounded-lg border p-3"
            value={form.managementCode}
            onChange={(e) =>
              updateField(
                "managementCode",
                e.target.value
              )
            }
          />
        </div>

        <div>
          <label className="block mb-2 font-semibold">
            管理グループ
          </label>

          <input
            className="w-full rounded-lg border p-3"
            value={form.managementGroupCode}
            onChange={(e) =>
              updateField(
                "managementGroupCode",
                e.target.value
              )
            }
          />
        </div>

        <div>
          <label className="block mb-2 font-semibold">
            メーカー
          </label>

          <input
            className="w-full rounded-lg border p-3"
            value={form.manufacturer}
            onChange={(e) =>
              updateField("manufacturer", e.target.value)
            }
          />
        </div>

        <div>
          <label className="block mb-2 font-semibold">
            大分類
          </label>

          <input
            className="w-full rounded-lg border p-3"
            value={form.majorCategory}
            onChange={(e) =>
              updateField("majorCategory", e.target.value)
            }
          />
        </div>

        <div>
          <label className="block mb-2 font-semibold">
            小分類
          </label>

          <input
            className="w-full rounded-lg border p-3"
            value={form.minorCategory}
            onChange={(e) =>
              updateField("minorCategory", e.target.value)
            }
          />
        </div>

        <div>
          <label className="block mb-2 font-semibold">
            標準単位
          </label>

          <input
            className="w-full rounded-lg border p-3"
            value={form.defaultUnit}
            onChange={(e) =>
              updateField("defaultUnit", e.target.value)
            }
          />
        </div>

      </div>

      <div className="flex gap-4 mt-10">

        <button
          className="rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:bg-gray-400"
          disabled={saving}
          onClick={async () => {
            try {
              setSaving(true);

              const res = await fetch(`/api/items/${id}`, {
                method: "PUT",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(form),
              });

              if (!res.ok) {
                throw new Error();
              }

              alert("保存しました");

              router.push(`/items/${id}`);
            } catch {
              alert("保存に失敗しました");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "保存中..." : "保存"}
        </button>

        <button
          className="rounded-lg border px-6 py-3 hover:bg-gray-100"
          disabled={saving}
          onClick={() => router.back()}
        >
          キャンセル
        </button>

      </div>

    </div>
  );
}