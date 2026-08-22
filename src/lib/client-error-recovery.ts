"use client";

type RecoveryOptions<T> = {
  code: string;
  title: string;
  message: string;
  route?: string;
  sessionId?: string;
  detail?: Record<string, unknown>;
  action: () => Promise<T>;
  maxRetries?: number;
  retryDelayMs?: number;
};

type RecoveryResult<T> = {
  success: boolean;
  value?: T;
  reportId: string | null;
};

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function createReport(options: {
  code: string;
  title: string;
  message: string;
  route?: string;
  sessionId?: string;
  detail?: Record<string, unknown>;
}) {
  try {
    const response = await fetch("/api/error-reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...options,
        severity: "ERROR",
      }),
    });

    const data: unknown = await response.json();

    if (
      response.ok &&
      typeof data === "object" &&
      data !== null &&
      "reportId" in data &&
      typeof data.reportId === "string"
    ) {
      return data.reportId;
    }
  } catch {
    // エラーレポート保存に失敗しても、本来の復旧処理は続ける
  }

  return null;
}

async function updateReport(
  reportId: string | null,
  action:
    | "START_AUTO_RECOVERY"
    | "AUTO_RECOVERY_SUCCEEDED"
    | "ADMIN_REQUIRED"
) {
  if (!reportId) {
    return;
  }

  try {
    await fetch(
      `/api/error-reports/${encodeURIComponent(reportId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      }
    );
  } catch {
    // レポート更新の失敗で作業を止めない
  }
}

export async function recoverAfterFailure<T>(
  options: RecoveryOptions<T>
): Promise<RecoveryResult<T>> {
  const maxRetries = options.maxRetries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 700;

  const reportId = await createReport({
    code: options.code,
    title: options.title,
    message: options.message,
    route: options.route,
    sessionId: options.sessionId,
    detail: options.detail,
  });

  await updateReport(reportId, "START_AUTO_RECOVERY");

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const value = await options.action();

      await updateReport(
        reportId,
        "AUTO_RECOVERY_SUCCEEDED"
      );

      return {
        success: true,
        value,
        reportId,
      };
    } catch {
      if (attempt < maxRetries) {
        await wait(retryDelayMs * (attempt + 1));
      }
    }
  }

  await updateReport(reportId, "ADMIN_REQUIRED");

  return {
    success: false,
    reportId,
  };
}
