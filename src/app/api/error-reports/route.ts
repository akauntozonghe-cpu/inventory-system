import { ErrorSeverity, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getLoggedInUser } from "@/lib/auth";
import { createErrorReport } from "@/lib/error-report";

type ErrorPayload = {
  code?: unknown;
  title?: unknown;
  message?: unknown;
  severity?: unknown;
  route?: unknown;
  sessionId?: unknown;
  detail?: unknown;
};

function getText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeSeverity(value: unknown): ErrorSeverity {
  switch (value) {
    case "INFO":
      return ErrorSeverity.INFO;
    case "WARNING":
      return ErrorSeverity.WARNING;
    case "CRITICAL":
      return ErrorSeverity.CRITICAL;
    default:
      return ErrorSeverity.ERROR;
  }
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value as Prisma.InputJsonArray;
  }

  if (value && typeof value === "object") {
    return value as Prisma.InputJsonObject;
  }

  return undefined;
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = getLoggedInUser(request);

    if (!currentUser) {
      return NextResponse.json(
        {
          code: "ERROR_REPORT_AUTH_401",
          message: "ログイン情報を確認できませんでした。",
        },
        { status: 401 }
      );
    }

    const body = (await request.json()) as ErrorPayload;

    const code = getText(body.code, 80);
    const title = getText(body.title, 120);
    const message = getText(body.message, 2000);

    if (!code || !title || !message) {
      return NextResponse.json(
        {
          code: "ERROR_REPORT_VALIDATION_400",
          message: "エラーレポートの必須項目が不足しています。",
        },
        { status: 400 }
      );
    }

    const report = await createErrorReport({
      code,
      title,
      message,
      severity: normalizeSeverity(body.severity),
      route: getText(body.route, 500) || undefined,
      sessionId: getText(body.sessionId, 100) || undefined,
      detail: toJsonValue(body.detail),
      reporterUserId: currentUser.id,
    });

    if (!report) {
      return NextResponse.json(
        {
          code: "ERROR_REPORT_CREATE_500",
          message: "エラーレポートを保存できませんでした。",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        reportId: report.id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("エラーレポート作成エラー", error);

    return NextResponse.json(
      {
        code: "ERROR_REPORT_UNEXPECTED_500",
        message: "エラーレポートの保存中に予期しないエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}