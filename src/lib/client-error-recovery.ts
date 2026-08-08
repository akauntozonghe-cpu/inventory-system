"use client";

export type RecoveryOptions<T> = {
  code: string;
  title: string;
  message: string;
  severity?: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  route?: string;
  sessionId?: string;
  detail?: Record<string, unknown>;

  /**
   * 復旧時に再実行する処理。
   * 例：保存API、進捗取得API、カメラ再起動など。
   */
  action: () => Promise<T>;

  /**
   * 自動再試行回数。初期値は3回。
   */
  retries?: number;

  /**
   * 再試行までの待ち時間。初期値は700ms。
   */
  retryDelayMs?: number;
};

export type RecoveryResult<T> =
  | {
      success: true;
      value: T;
      attempts: number;
      reportId: string | null;
    }
  | {
      success: false;
      error: Error;
      attempts: number;
      reportId: string | null;
    };

type ErrorReportResponse = {
  reportId?: string;
};

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function createReport(
  options: Omit<RecoveryOptions<unknown>, "action">
) {
  try {
    const response = await fetch("/api/error-reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: options.code,
        title: options.title,
        message: options.message,
        severity: options.severity ?? "ERROR",
        route: options.route ?? window.location.pathname,
        sessionId: options.sessionId,
        detail: options.detail,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as ErrorReportResponse;

    return data.reportId ?? null;
  } catch {
    /*
     * 通信障害時はレポート自体をサーバーへ送れない。
     * 一時保存機能で、復旧後に送信する。
     */
    return null;
  }
}

async function updateReport(
  reportId: string,
  action:
    | "START_AUTO_RECOVERY"
    | "AUTO_RECOVERY_SUCCEEDED"
    | "ADMIN_REQUIRED",
  note: string
) {
  try {
    await fetch(`/api/error-reports/${reportId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        note,
      }),
    });
  } catch {
    // レポート更新に失敗しても、本来の復旧処理は止めない。
  }
}

/**
 * エラー検知後に自動復旧を試す。
 *
 * 成功時：自動復旧済みとしてログを残す。
 * 失敗時：管理者対応待ちとしてログを残し、呼び出し元へ失敗を返す。
 */
export async function recoverAfterFailure<T>(
  options: RecoveryOptions<T>
): Promise<RecoveryResult<T>> {
  const retries = Math.max(1, options.retries ?? 3);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 700);

  const reportId = await createReport(options);

  if (reportId) {
    await updateReport(
      reportId,
      "START_AUTO_RECOVERY",
      "自動復旧を開始しました。"
    );
  }

  let lastError = new Error(options.message);

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const value = await options.action();

      if (reportId) {
        await updateReport(
          reportId,
          "AUTO_RECOVERY_SUCCEEDED",
          `自動復旧に成功しました。再試行回数：${attempt}回`
        );
      }

      return {
        success: true,
        value,
        attempts: attempt,
        reportId,
      };
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("復旧処理中に不明なエラーが発生しました。");

      if (attempt < retries) {
        await sleep(retryDelayMs * attempt);
      }
    }
  }

  if (reportId) {
    await updateReport(
      reportId,
      "ADMIN_REQUIRED",
      `自動復旧できませんでした。試行回数：${retries}回。${lastError.message}`
    );
  }

  return {
    success: false,
    error: lastError,
    attempts: retries,
    reportId,
  };
}