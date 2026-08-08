import { NextRequest, NextResponse } from "next/server";
import { ErrorSeverity, Prisma } from "@prisma/client";
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

function text(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function normalizeSeverity(value: unknown): ErrorSeverity {
  if (value === "INFO") return ErrorSeverity.INFO;
  if (value === "WARNING") return ErrorSeverity.WARNING;
  if (value === "CRITICAL") return ErrorSeverity.CRITICAL;

  return ErrorSeverity.ERROR;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ErrorPayload;

    const code = text(body.code, 80);
    const title = text(body.title, 120);
    const message = text(body.message, 2000);

    if (!code || !title || !message) {
      return NextResponse.json(
        {
          message: "エラーコード・タイトル・事象の内容が必要です。",
        },
        {
          status: 400,
        }
      );
    }

    const report = await createErrorReport({
      code,
      title,
      message,
      severity: normalizeSeverity(body.severity),
      route: text(body.route, 500) || undefined,
      sessionId: text(body.sessionId, 100) || undefined,
      detail: body.detail as Prisma.InputJsonValue | undefined,
    });

    if (!report) {
      return NextResponse.json(
        {
          message: "エラーレポートを保存できませんでした。",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        reportId: report.id,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error("エラーレポート受付エラー", error);

    return NextResponse.json(
      {
        message: "エラーレポートの受付に失敗しました。",
      },
      {
        status: 500,
      }
    );
  }
}