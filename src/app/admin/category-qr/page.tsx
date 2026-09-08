"use client";
import SectionNavigation, { classificationLinks } from "@/components/common/SectionNavigation";

import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { qrPrintDocument } from "@/lib/qr-print";

type ClassificationPayload = { classifications?: Array<{ kind: string; name: string; labelCode?: string }> };

function createQrValue(category: string, labelCode?: string) {
  return labelCode
    ? JSON.stringify({ type: "INVENTORY_CLASSIFICATION_LABEL", classificationLabelCode: labelCode, majorCategory: category })
    : `INVENTORY_OS:CATEGORY:MAJOR:${encodeURIComponent(category)}`;
}


function readMessage(data: unknown, fallback: string) {
  if (
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return fallback;
}

export default function CategoryQrPage() {
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setMessage("");

        const [userResponse, classificationResponse] = await Promise.all([
          fetch("/api/auth/me", {
            cache: "no-store",
          }),
          fetch("/api/admin/classifications", {
            cache: "no-store",
          }),
        ]);

        const [userText, classificationText] = await Promise.all([
          userResponse.text(),
          classificationResponse.text(),
        ]);

        let userData: unknown = null;
        let classificationData: unknown = null;

        try {
          userData = userText ? JSON.parse(userText) : null;
        } catch {
          throw new Error("ログイン情報を確認できませんでした。");
        }

        try {
          classificationData = classificationText ? JSON.parse(classificationText) : null;
        } catch {
          throw new Error("商品一覧を確認できませんでした。");
        }

        if (
          !userResponse.ok ||
          typeof userData !== "object" ||
          userData === null ||
          !("role" in userData) ||
          userData.role !== "ADMIN"
        ) {
          setMessage("この画面は管理者のみ利用できます。");
          return;
        }

        setIsAdmin(true);

        if (!classificationResponse.ok || !classificationData || typeof classificationData !== "object") {
          throw new Error(
            readMessage(classificationData, "分類マスターを取得できませんでした。")
          );
        }

        const classificationRows = (classificationData as ClassificationPayload).classifications;
        const majorRows = (Array.isArray(classificationRows) ? classificationRows : []).filter((row) => row.kind === "MAJOR" && row.name?.trim());
        const uniqueCategories = Array.from(
          new Set(
            majorRows
              .map((row) => row.name?.trim() ?? "")
              .filter((category) => category.length > 0)
          )
        ).sort((a, b) => a.localeCompare(b, "ja"));

        setCategories(uniqueCategories);
        setSelectedCategories(uniqueCategories);
        const codes = Object.fromEntries(majorRows.filter((row) => row.labelCode).map((row) => [row.name.trim(), row.labelCode as string]));

        const imageEntries = await Promise.all(
          uniqueCategories.map(async (category) => {
            const image = await QRCode.toDataURL(createQrValue(category, codes[category]), {
              errorCorrectionLevel: "M",
              width: 600,
              margin: 4,
            });

            return [category, image] as const;
          })
        );

        setQrImages(Object.fromEntries(imageEntries));
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "大分類QRの作成に失敗しました。"
        );
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  useLiveRefresh(async () => {
    const response = await fetch("/api/admin/classifications", { cache: "no-store" });
    if (!response.ok) throw new Error("分類を更新できませんでした。");
    const data = await response.json() as ClassificationPayload;
    const rows = (data.classifications ?? []).filter((row) => row.kind === "MAJOR");
    const names = rows.map((row) => row.name).sort((a,b) => a.localeCompare(b, "ja"));
    const images = await Promise.all(rows.map(async (row) => [row.name, await QRCode.toDataURL(createQrValue(row.name, row.labelCode), { errorCorrectionLevel: "M", width: 600, margin: 4 })] as const));
    setCategories(names); setQrImages(Object.fromEntries(images));
    setSelectedCategories((current) => current.filter((name) => names.includes(name)));
  });

  const selected = useMemo(
    () =>
      categories.filter((category) => selectedCategories.includes(category)),
    [categories, selectedCategories]
  );

  const allSelected =
    categories.length > 0 &&
    categories.every((category) => selectedCategories.includes(category));

  const toggleCategory = (category: string) => {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((value) => value !== category)
        : [...current, category]
    );
  };

  const toggleAll = () => {
    setSelectedCategories(allSelected ? [] : categories);
  };

  const printSelected = () => {
    setMessage("");

    if (selected.length === 0) {
      setMessage("印刷する大分類を選んでください。");
      return;
    }

    const labels = selected.filter(category => qrImages[category]).map(category => ({ name: category, image: qrImages[category] }));
    if (!labels.length) { setMessage("QRラベルを作成できませんでした。"); return; }

    const printWindow = window.open("", "_blank", "width=900,height=700");

    if (!printWindow) {
      setMessage(
        "印刷画面を開けませんでした。ブラウザのポップアップ許可を確認してください。"
      );
      return;
    }

    printWindow.document.write(qrPrintDocument(labels));
    printWindow.document.close();
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-4xl rounded-2xl bg-white p-10 text-center text-slate-500 shadow-sm">
          大分類QRを準備しています…
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-bold tracking-widest text-indigo-600">
              ADMINISTRATION
            </p>

            <h1 className="mt-1 text-3xl font-black text-slate-900">
              大分類QRラベル
            </h1>

            <p className="mt-2 text-slate-600">
              棚や保管ケースへ貼り付けると、読み取りだけで商品一覧を大分類ごとに絞り込めます。
            </p>
          </div>

          <Link
            href="/admin"
            className="rounded-xl bg-white px-4 py-3 text-center font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            管理者設定へ戻る
          </Link>
        </header><SectionNavigation label="分類管理" current="/admin/category-qr" links={classificationLinks} />

        {message && (
          <section className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-5 font-bold text-red-700">
            {message}
          </section>
        )}

        {!isAdmin ? null : categories.length === 0 ? (
          <section className="rounded-2xl bg-white p-10 text-center text-slate-600 shadow-sm">
            大分類が登録された商品がまだありません。
          </section>
        ) : (
          <>
            <section className="mb-5 rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex cursor-pointer items-center gap-3 font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-5 w-5"
                  />
                  すべて選択
                </label>

                <button
                  type="button"
                  onClick={printSelected}
                  disabled={selected.length === 0}
                  className="rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-400"
                >
                  選択した {selected.length} 件をまとめて印刷
                </button>
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <article
                  key={category}
                  className="rounded-2xl bg-white p-5 text-center shadow-sm"
                >
                  <label className="flex cursor-pointer items-center gap-2 text-left text-sm font-bold text-slate-600">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(category)}
                      onChange={() => toggleCategory(category)}
                      className="h-5 w-5"
                    />
                    印刷対象にする
                  </label>

                  {qrImages[category] && (
                    <>
                      {/* Generated data URLs must remain unoptimized for reliable printing. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrImages[category]}
                        alt={`${category}の大分類QR`}
                        className="mx-auto mt-4 h-48 w-48"
                      />
                    </>
                  )}

                  <h2 className="mt-4 text-xl font-black text-slate-900">
                    {category}
                  </h2>

                  <p className="mt-2 text-sm text-slate-500">
                    読み取るとこの大分類に絞り込みます。
                  </p>
                </article>
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
