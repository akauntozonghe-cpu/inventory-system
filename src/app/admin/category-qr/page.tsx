"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

type Item = {
  id: string;
  majorCategory: string | null;
};

function createQrValue(category: string) {
  return `INVENTORY_OS:CATEGORY:MAJOR:${encodeURIComponent(category)}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

        const [userResponse, itemResponse] = await Promise.all([
          fetch("/api/auth/me", {
            cache: "no-store",
          }),
          fetch("/api/items", {
            cache: "no-store",
          }),
        ]);

        const [userText, itemText] = await Promise.all([
          userResponse.text(),
          itemResponse.text(),
        ]);

        let userData: unknown = null;
        let itemData: unknown = null;

        try {
          userData = userText ? JSON.parse(userText) : null;
        } catch {
          throw new Error("ログイン情報を確認できませんでした。");
        }

        try {
          itemData = itemText ? JSON.parse(itemText) : null;
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

        if (!itemResponse.ok || !Array.isArray(itemData)) {
          throw new Error(
            readMessage(itemData, "商品一覧を取得できませんでした。")
          );
        }

        const uniqueCategories = Array.from(
          new Set(
            (itemData as Item[])
              .map((item) => item.majorCategory?.trim() ?? "")
              .filter((category) => category.length > 0)
          )
        ).sort((a, b) => a.localeCompare(b, "ja"));

        setCategories(uniqueCategories);
        setSelectedCategories(uniqueCategories);

        const imageEntries = await Promise.all(
          uniqueCategories.map(async (category) => {
            const image = await QRCode.toDataURL(createQrValue(category), {
              errorCorrectionLevel: "M",
              width: 320,
              margin: 2,
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

    const labels = selected
      .map((category) => {
        const image = qrImages[category];

        if (!image) {
          return "";
        }

        return `
          <article class="label">
            <p class="caption">INVENTORY OS / 大分類QR</p>
            <h1>${escapeHtml(category)}</h1>
            <img src="${image}" alt="${escapeHtml(category)} の大分類QR" />
            <p class="instruction">
              このQRを読み取ると、商品一覧を「${escapeHtml(
                category
              )}」に絞り込みます。
            </p>
          </article>
        `;
      })
      .join("");

    if (!labels) {
      setMessage("QRラベルを作成できませんでした。");
      return;
    }

    const printWindow = window.open("", "_blank", "width=900,height=700");

    if (!printWindow) {
      setMessage(
        "印刷画面を開けませんでした。ブラウザのポップアップ許可を確認してください。"
      );
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html lang="ja">
        <head>
          <meta charset="utf-8" />
          <title>大分類QRラベル</title>
          <style>
            @page {
              size: A4;
              margin: 8mm;
            }

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              color: #111827;
              font-family: Arial, "Noto Sans JP", sans-serif;
            }

            .grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              grid-auto-rows: 86mm;
              gap: 4mm;
            }

            .label {
              height: 86mm;
              overflow: hidden;
              padding: 4mm;
              border: 1px solid #cbd5e1;
              border-radius: 3mm;
              text-align: center;
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .label:nth-child(6n) {
              break-after: page;
              page-break-after: always;
            }

            .caption {
              margin: 0;
              color: #475569;
              font-size: 8pt;
              font-weight: 700;
            }

            h1 {
              margin: 3mm 0;
              font-size: 17pt;
              word-break: break-word;
            }

            img {
              width: 50mm;
              height: 50mm;
              image-rendering: pixelated;
            }

            .instruction {
              margin: 2mm 0 0;
              color: #475569;
              font-size: 8pt;
            }

            @media print {
              body {
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
              }
            }
          </style>
        </head>
        <body>
          <main class="grid">${labels}</main>
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `);

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
        </header>

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
