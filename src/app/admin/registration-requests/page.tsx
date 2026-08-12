"use client";

import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

type CurrentUser = {
  id: string;
  displayName: string;
  role: "ADMIN" | "WORKER";
};

type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";
type ReviewAction = "APPROVE" | "REJECT";

type RegistrationRequest = {
  id: string;
  scannedCode: string | null;
  name: string;
  manufacturer: string | null;
  managementCode: string | null;
  managementGroupCode: string | null;
  majorCategory: string | null;
  minorCategory: string | null;
  quantity: number;
  unit: string | null;
  lotNo: string | null;
  expirationDate: string | null;
  memo: string | null;
  status: RequestStatus;
  createdAt: string;
  reviewMemo: string | null;
  requestedBy: {
    id: string;
    displayName: string;
    username: string;
  };
  storageLocation: {
    id: string;
    name: string;
  } | null;
  stocktakeSession: {
    id: string;
    title: string;
    status: string;
  } | null;
};

function getMessage(data: unknown, fallback: string) {
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

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(
      `サーバーから応答を受け取れませんでした。HTTP ${response.status}`
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `サーバーから正しい応答を受け取れませんでした。HTTP ${response.status}`
    );
  }
}

function isCurrentUser(data: unknown): data is CurrentUser {
  return (
    typeof data === "object" &&
    data !== null &&
    "id" in data &&
    "displayName" in data &&
    "role" in data &&
    typeof data.id === "string" &&
    typeof data.displayName === "string" &&
    (data.role === "ADMIN" || data.role === "WORKER")
  );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(status: RequestStatus) {
  if (status === "APPROVED") {
    return "承認済";
  }

  if (status === "REJECTED") {
    return "差し戻し";
  }

  return "確認待ち";
}

function statusColor(status: RequestStatus) {
  if (status === "APPROVED") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "REJECTED") {
    return "bg-red-100 text-red-700";
  }

  return "bg-amber-100 text-amber-800";
}

export default function RegistrationRequestsPage() {
  const router = useRouter();

  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [status, setStatus] = useState<RequestStatus>("PENDING");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [target, setTarget] = useState<RegistrationRequest | null>(null);
  const [action, setAction] = useState<ReviewAction | null>(null);

  const [reviewMemo, setReviewMemo] = useState("");
  const [janCode, setJanCode] = useState("");
  const [generateSystemBarcode, setGenerateSystemBarcode] =
    useState(false);

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [authResponse, requestResponse] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch(`/api/admin/registration-requests?status=${status}`, {
          cache: "no-store",
        }),
      ]);

      const authData = await readJson(authResponse);

      if (authResponse.status === 401) {
        router.replace("/login");
        return;
      }

      if (!authResponse.ok || !isCurrentUser(authData)) {
        throw new Error("ログイン情報を確認できませんでした。");
      }

      if (authData.role !== "ADMIN") {
        router.replace("/");
        return;
      }

      const requestData = await readJson(requestResponse);

      if (!requestResponse.ok) {
        throw new Error(
          getMessage(
            requestData,
            "商品登録申請の一覧を取得できませんでした。"
          )
        );
      }

      if (
        typeof requestData !== "object" ||
        requestData === null ||
        !("requests" in requestData) ||
        !Array.isArray(requestData.requests)
      ) {
        throw new Error("商品登録申請のデータが正しくありません。");
      }

      setRequests(requestData.requests as RegistrationRequest[]);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "商品登録申請の一覧を取得できませんでした。"
      );
    } finally {
      setLoading(false);
    }
  }, [router, status]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const openReview = (
    request: RegistrationRequest,
    nextAction: ReviewAction
  ) => {
    setTarget(request);
    setAction(nextAction);
    setReviewMemo("");
    setJanCode(request.scannedCode ?? "");
    setGenerateSystemBarcode(false);
    setError("");
    setNotice("");
  };

  const closeReview = () => {
    if (processing) {
      return;
    }

    setTarget(null);
    setAction(null);
    setReviewMemo("");
    setJanCode("");
    setGenerateSystemBarcode(false);
  };

  const submitReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!target || !action) {
      return;
    }

    const finalJanCode = janCode.trim();

    if (action === "REJECT" && !reviewMemo.trim()) {
      setError("差し戻す理由を入力してください。");
      return;
    }

    if (
      action === "APPROVE" &&
      !finalJanCode &&
      !generateSystemBarcode
    ) {
      setError(
        "JANコードを入力するか、システムバーコードを発行してください。"
      );
      return;
    }

    try {
      setProcessing(true);
      setError("");
      setNotice("");

      const response = await fetch("/api/admin/registration-requests", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId: target.id,
          action,
          reviewMemo,
          janCode: finalJanCode || null,
          generateSystemBarcode:
            action === "APPROVE" &&
            !finalJanCode &&
            generateSystemBarcode,
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getMessage(
            data,
            "商品登録申請を処理できませんでした。"
          )
        );
      }

      setNotice(
        getMessage(
          data,
          action === "APPROVE"
            ? `「${target.name}」を正式登録しました。`
            : `「${target.name}」を差し戻しました。`
        )
      );

      closeReview();
      await loadRequests();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "商品登録申請を処理できませんでした。"
      );
    } finally {
      setProcessing(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-black tracking-widest text-blue-600">
              ADMINISTRATOR MODE
            </p>

            <h1 className="mt-1 text-3xl font-black sm:text-4xl">
              商品登録申請
            </h1>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              一般ユーザーの申請内容を確認し、正式登録または差し戻しを行います。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadRequests()}
              disabled={loading}
              className="rounded-xl bg-white px-4 py-3 font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              更新
            </button>

            <Link
              href="/admin"
              className="rounded-xl bg-slate-800 px-4 py-3 font-bold text-white hover:bg-slate-700"
            >
              管理者メニューへ戻る
            </Link>
          </div>
        </header>

        {notice && (
          <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-800">
            <p className="font-bold">{notice}</p>
          </section>
        )}

        {error && (
          <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-800">
            <p className="font-black">処理できませんでした</p>
            <p className="mt-1">{error}</p>
          </section>
        )}

        <nav className="mt-7 flex gap-2 overflow-x-auto pb-1">
          {(
            [
              ["PENDING", "確認待ち"],
              ["APPROVED", "承認済"],
              ["REJECTED", "差し戻し"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={`whitespace-nowrap rounded-full px-5 py-3 font-bold transition ${
                status === value
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-700 shadow-sm hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <section className="mt-6">
          {loading ? (
            <div className="rounded-3xl bg-white p-10 text-center text-slate-500 shadow-sm">
              商品登録申請を読み込んでいます…
            </div>
          ) : requests.length === 0 ? (
            <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
              <p className="text-lg font-black text-slate-800">
                {statusLabel(status)}の商品登録申請はありません。
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((request) => (
                <article
                  key={request.id}
                  className="rounded-3xl bg-white p-5 shadow-sm sm:p-6"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-sm font-black ${statusColor(
                            request.status
                          )}`}
                        >
                          {statusLabel(request.status)}
                        </span>

                        <span className="text-sm text-slate-500">
                          申請日：{formatDate(request.createdAt)}
                        </span>
                      </div>

                      <h2 className="mt-3 break-words text-2xl font-black text-slate-950">
                        {request.name}
                      </h2>

                      <p className="mt-1 text-sm text-slate-600">
                        申請者：{request.requestedBy.displayName}
                        {" / "}
                        {request.requestedBy.username}
                      </p>

                      <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <dt className="text-sm font-bold text-slate-500">
                            JANコード
                          </dt>
                          <dd className="mt-1 break-all font-bold text-slate-900">
                            {request.scannedCode ?? "未確認"}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-sm font-bold text-slate-500">
                            管理番号
                          </dt>
                          <dd className="mt-1 font-bold text-slate-900">
                            {request.managementCode ?? "-"}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-sm font-bold text-slate-500">
                            分類
                          </dt>
                          <dd className="mt-1 font-bold text-slate-900">
                            {[request.majorCategory, request.minorCategory]
                              .filter(Boolean)
                              .join(" / ") || "-"}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-sm font-bold text-slate-500">
                            メーカー
                          </dt>
                          <dd className="mt-1 font-bold text-slate-900">
                            {request.manufacturer ?? "-"}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-sm font-bold text-slate-500">
                            初期在庫
                          </dt>
                          <dd className="mt-1 text-xl font-black text-blue-700">
                            {request.quantity}
                            <span className="ml-1 text-sm">
                              {request.unit ?? "個"}
                            </span>
                          </dd>
                        </div>

                        <div>
                          <dt className="text-sm font-bold text-slate-500">
                            保管場所
                          </dt>
                          <dd className="mt-1 font-bold text-slate-900">
                            {request.storageLocation?.name ?? "未設定"}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-sm font-bold text-slate-500">
                            ロット番号
                          </dt>
                          <dd className="mt-1 font-bold text-slate-900">
                            {request.lotNo ?? "-"}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-sm font-bold text-slate-500">
                            使用期限
                          </dt>
                          <dd className="mt-1 font-bold text-slate-900">
                            {request.expirationDate ?? "-"}
                          </dd>
                        </div>
                      </dl>

                      {request.stocktakeSession && (
                        <div className="mt-5 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
                          棚卸中に申請された商品：
                          <Link
                            href={`/stocktake/${request.stocktakeSession.id}`}
                            className="ml-1 font-black underline"
                          >
                            {request.stocktakeSession.title}
                          </Link>
                        </div>
                      )}

                      {request.memo && (
                        <div className="mt-4 rounded-xl bg-slate-100 px-4 py-3">
                          <p className="text-sm font-bold text-slate-600">
                            申請メモ
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-slate-800">
                            {request.memo}
                          </p>
                        </div>
                      )}

                      {request.reviewMemo && (
                        <div className="mt-4 rounded-xl bg-slate-100 px-4 py-3">
                          <p className="text-sm font-bold text-slate-600">
                            管理者メモ
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-slate-800">
                            {request.reviewMemo}
                          </p>
                        </div>
                      )}
                    </div>

                    {request.status === "PENDING" && (
                      <div className="flex shrink-0 flex-wrap gap-2 lg:flex-col">
                        <button
                          type="button"
                          onClick={() => openReview(request, "APPROVE")}
                          className="rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white hover:bg-emerald-700"
                        >
                          確認して正式登録
                        </button>

                        <button
                          type="button"
                          onClick={() => openReview(request, "REJECT")}
                          className="rounded-xl bg-red-600 px-5 py-3 font-bold text-white hover:bg-red-700"
                        >
                          差し戻す
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {target && action && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/60 p-0 sm:items-center sm:justify-center sm:p-5">
          <form
            onSubmit={submitReview}
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:max-w-xl sm:rounded-3xl"
          >
            <p
              className={`text-sm font-black ${
                action === "APPROVE"
                  ? "text-emerald-700"
                  : "text-red-700"
              }`}
            >
              {action === "APPROVE"
                ? "商品を正式登録"
                : "商品登録申請を差し戻す"}
            </p>

            <h2 className="mt-1 break-words text-2xl font-black text-slate-950">
              {target.name}
            </h2>

            {action === "APPROVE" ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl bg-slate-100 p-4 text-sm leading-6 text-slate-700">
                  JANコードを確認して入力してください。JANが存在しない商品だけ、システムバーコードを発行できます。
                </div>

                <label className="block">
                  <span className="font-bold text-slate-800">
                    JANコード
                  </span>

                  <input
                    value={janCode}
                    disabled={generateSystemBarcode}
                    onChange={(event) => {
                      setJanCode(event.target.value);
                      if (event.target.value.trim()) {
                        setGenerateSystemBarcode(false);
                      }
                    }}
                    inputMode="numeric"
                    placeholder="例：4901234567890"
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                  />
                </label>

                <label className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <input
                    type="checkbox"
                    checked={generateSystemBarcode}
                    disabled={Boolean(janCode.trim())}
                    onChange={(event) =>
                      setGenerateSystemBarcode(event.target.checked)
                    }
                    className="mt-1 h-5 w-5"
                  />

                  <span>
                    <span className="block font-black text-blue-800">
                      システムバーコードを発行する
                    </span>

                    <span className="mt-1 block text-sm leading-6 text-blue-900">
                      JANがない商品に限り、印刷・棚卸・検索で利用するシステム専用コードを発行します。
                    </span>
                  </span>
                </label>
              </div>
            ) : (
              <p className="mt-4 leading-6 text-slate-600">
                申請者へ理由が通知されます。修正して再申請できるよう、具体的な理由を入力してください。
              </p>
            )}

            <label className="mt-5 block">
              <span className="font-bold text-slate-800">
                {action === "APPROVE"
                  ? "管理者メモ（任意）"
                  : "差し戻し理由"}
              </span>

              <textarea
                rows={4}
                value={reviewMemo}
                onChange={(event) => setReviewMemo(event.target.value)}
                placeholder={
                  action === "APPROVE"
                    ? "例：JANコードを確認し、正式登録しました。"
                    : "例：同一JANの商品がすでに登録されているため、既存商品を確認してください。"
                }
                className={`mt-2 w-full rounded-xl border px-4 py-3 outline-none ${
                  action === "APPROVE"
                    ? "border-emerald-200 focus:border-emerald-500"
                    : "border-red-200 focus:border-red-500"
                }`}
              />
            </label>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={closeReview}
                disabled={processing}
                className="flex-1 rounded-xl bg-slate-200 px-4 py-3 font-bold text-slate-700 disabled:opacity-50"
              >
                キャンセル
              </button>

              <button
                type="submit"
                disabled={processing}
                className={`flex-1 rounded-xl px-4 py-3 font-bold text-white disabled:bg-slate-400 ${
                  action === "APPROVE"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {processing
                  ? "処理中..."
                  : action === "APPROVE"
                    ? "正式登録する"
                    : "差し戻す"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}