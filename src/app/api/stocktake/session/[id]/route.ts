import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAdminElevation,
  getLoggedInUser,
  hasAdminAccess,
} from "@/lib/auth";

type SessionAction = "PAUSE" | "RESUME" | "COMPLETE";

type ConflictItem = {
  inventoryInstanceId: string;
  expectedQuantity: number;
  currentQuantity: number;
};

function canOperateSession(
  session: { operatorUserId: string | null },
  userId: string,
  elevatedAdmin: boolean
) {
  // 既存データ（operatorUserId が未設定）も、移行期間中は操作可能にする。
  return (
    session.operatorUserId === null ||
    session.operatorUserId === userId ||
    elevatedAdmin
  );
}

async function stopAsConflict(input: {
  sessionId: string;
  title: string;
  userId: string;
  conflicts: ConflictItem[];
}) {
  await prisma.$transaction(async (tx) => {
    const session = await tx.stocktakeSession.findUnique({
      where: { id: input.sessionId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!session || session.status === "COMPLETED") {
      return;
    }

    await tx.stocktakeSession.update({
      where: { id: input.sessionId },
      data: {
        status: "CONFLICT",
        pausedAt: new Date(),
      },
    });

    await tx.notification.create({
      data: {
        type: "STOCKTAKE_CONFLICT",
        audience: "ADMIN",
        title: `棚卸の競合を検知しました：${input.title}`,
        message:
          "棚卸開始後に在庫数が変更された対象があります。誤反映を防ぐため、棚卸を安全停止しました。",
        stocktakeSessionId: input.sessionId,
        detail: {
          operatorUserId: input.userId,
          conflicts: input.conflicts,
        },
      },
    });
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getLoggedInUser(request);

  if (!user) {
    return NextResponse.json(
      {
        code: "STOCKTAKE_SESSION_AUTH_401",
        message: "ログイン情報を確認できませんでした。",
      },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;

    const body = (await request.json()) as {
      action?: unknown;
    };

    const action = body.action;

    if (
      action !== "PAUSE" &&
      action !== "RESUME" &&
      action !== "COMPLETE"
    ) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_SESSION_ACTION_400",
          message: "指定された操作は利用できません。",
        },
        { status: 400 }
      );
    }

    const sessionAction: SessionAction = action;
    const elevatedAdmin = hasAdminAccess(request);

    const session = await prisma.stocktakeSession.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
        operatorUserId: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_SESSION_NOT_FOUND",
          message: "棚卸セッションが見つかりません。",
        },
        { status: 404 }
      );
    }

    if (!canOperateSession(session, user.id, elevatedAdmin)) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_SESSION_FORBIDDEN",
          message: "この棚卸を操作する権限がありません。",
        },
        { status: 403 }
      );
    }

    if (session.status === "COMPLETED") {
      return NextResponse.json(
        {
          code: "STOCKTAKE_ALREADY_COMPLETED",
          message: "この棚卸はすでに終了しています。",
        },
        { status: 409 }
      );
    }

    if (session.status === "CONFLICT") {
      return NextResponse.json(
        {
          code: "STOCKTAKE_CONFLICT_LOCKED",
          message:
            "在庫競合が検知されたため、この棚卸は安全停止中です。管理者が内容を確認してください。",
        },
        { status: 409 }
      );
    }

    if (sessionAction === "PAUSE") {
      if (session.status !== "IN_PROGRESS") {
        return NextResponse.json(
          {
            code: "STOCKTAKE_PAUSE_INVALID",
            message: "作業中の棚卸のみ中断できます。",
          },
          { status: 400 }
        );
      }

      const updated = await prisma.stocktakeSession.update({
        where: { id },
        data: {
          status: "PAUSED",
          pausedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        message: "棚卸を中断しました。入力済みのデータは保存されています。",
        session: updated,
      });
    }

    if (sessionAction === "RESUME") {
      if (session.status !== "PAUSED") {
        return NextResponse.json(
          {
            code: "STOCKTAKE_RESUME_INVALID",
            message: "中断中の棚卸のみ再開できます。",
          },
          { status: 400 }
        );
      }

      const updated = await prisma.stocktakeSession.update({
        where: { id },
        data: {
          status: "IN_PROGRESS",
          pausedAt: null,
        },
      });

      return NextResponse.json({
        success: true,
        message: "棚卸を再開しました。",
        session: updated,
      });
    }

    if (
      session.status !== "IN_PROGRESS" &&
      session.status !== "REVIEW"
    ) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_COMPLETE_INVALID",
          message: "現在の状態では棚卸を終了できません。",
        },
        { status: 400 }
      );
    }

    const elevation = getAdminElevation(request);
    const auditAdminUserId =
      user.role === "ADMIN"
        ? user.id
        : elevation?.adminUserId ?? null;

    const result = await prisma.$transaction(
      async (tx) => {
        const currentSession = await tx.stocktakeSession.findUnique({
          where: { id },
          select: {
            id: true,
            title: true,
            status: true,
            targets: {
              select: {
                inventoryInstanceId: true,
                expectedQuantity: true,
                inventoryInstance: {
                  select: {
                    id: true,
                    quantity: true,
                  },
                },
              },
            },
            records: {
              select: {
                inventoryInstanceId: true,
                countedQuantity: true,
                memo: true,
              },
            },
          },
        });

        if (!currentSession) {
          throw new Error("STOCKTAKE_COMPLETE_NOT_FOUND");
        }

        if (currentSession.status === "COMPLETED") {
          throw new Error("STOCKTAKE_COMPLETE_ALREADY_DONE");
        }

        if (
          currentSession.status !== "IN_PROGRESS" &&
          currentSession.status !== "REVIEW"
        ) {
          throw new Error("STOCKTAKE_COMPLETE_STATUS_INVALID");
        }

        const recordByInventoryId = new Map(
          currentSession.records.map((record) => [
            record.inventoryInstanceId,
            record,
          ])
        );

        const recordedTargets = currentSession.targets.filter((target) =>
          recordByInventoryId.has(target.inventoryInstanceId)
        );

        const conflicts: ConflictItem[] = recordedTargets
          .filter(
            (target) =>
              target.inventoryInstance.quantity !== target.expectedQuantity
          )
          .map((target) => ({
            inventoryInstanceId: target.inventoryInstanceId,
            expectedQuantity: target.expectedQuantity,
            currentQuantity: target.inventoryInstance.quantity,
          }));

        if (conflicts.length > 0) {
          return {
            kind: "CONFLICT" as const,
            title: currentSession.title,
            conflicts,
          };
        }

        let matchedCount = 0;
        let differenceCount = 0;

        for (const target of recordedTargets) {
          const record = recordByInventoryId.get(
            target.inventoryInstanceId
          );

          if (!record) {
            continue;
          }

          const difference =
            record.countedQuantity - target.expectedQuantity;

          if (difference === 0) {
            matchedCount += 1;
          } else {
            differenceCount += 1;
          }

          // 開始時の在庫数と一致する場合だけ更新する。
          // 直前に他操作で変更されていれば、更新せず競合として停止する。
          const updateResult = await tx.inventoryInstance.updateMany({
            where: {
              id: target.inventoryInstanceId,
              quantity: target.expectedQuantity,
            },
            data: {
              quantity: record.countedQuantity,
              actualQuantity: record.countedQuantity,
              stocktakeStatus: "棚卸済",
              stocktakeAt: new Date(),
            },
          });

          if (updateResult.count !== 1) {
            throw new Error("STOCKTAKE_COMPLETE_RACE_CONFLICT");
          }

          await tx.inventoryHistory.create({
            data: {
              inventoryInstanceId: target.inventoryInstanceId,
              changeQuantity: difference,
              action:
                difference === 0
                  ? "棚卸終了（一致）"
                  : "棚卸終了（差異反映）",
            },
          });

          await tx.inventoryEvent.create({
            data: {
              inventoryInstanceId: target.inventoryInstanceId,
              eventType: "STOCKTAKE",
              quantityBefore: target.expectedQuantity,
              quantityChange: difference,
              quantityAfter: record.countedQuantity,
              reason:
                difference === 0
                  ? "棚卸終了（一致）"
                  : "棚卸終了（差異反映）",
              memo: record.memo,
              performedByUserId: user.id,
              stocktakeSessionId: id,
              detail: {
                sessionTitle: currentSession.title,
                expectedQuantity: target.expectedQuantity,
                countedQuantity: record.countedQuantity,
              },
            },
          });
        }

        const summary = {
          targetCount: currentSession.targets.length,
          recordedCount: recordedTargets.length,
          matchedCount,
          differenceCount,
          unrecordedCount:
            currentSession.targets.length - recordedTargets.length,
        };

        const completedSession = await tx.stocktakeSession.update({
          where: { id },
          data: {
            status: "COMPLETED",
            pausedAt: null,
            completedAt: new Date(),
          },
          select: {
            id: true,
            title: true,
            status: true,
            completedAt: true,
          },
        });

        await tx.notification.create({
          data: {
            type: "STOCKTAKE_COMPLETED",
            audience: "ADMIN",
            title: `棚卸が終了しました：${currentSession.title}`,
            message: `${user.displayName} さんが棚卸を終了しました。棚卸済 ${summary.recordedCount} 件、差異 ${summary.differenceCount} 件です。`,
            stocktakeSessionId: id,
            detail: summary,
          },
        });

        if (differenceCount > 0) {
          await tx.notification.create({
            data: {
              type: "STOCKTAKE_DIFFERENCE",
              audience: "ADMIN",
              title: `棚卸差異があります：${currentSession.title}`,
              message: `差異が ${differenceCount} 件あります。棚卸履歴から内容を確認してください。`,
              stocktakeSessionId: id,
              detail: summary,
            },
          });
        }

        if (auditAdminUserId) {
          await tx.adminActionLog.create({
            data: {
              adminUserId: auditAdminUserId,
              action: "STOCKTAKE_COMPLETE",
              route: `/api/stocktake/session/${id}`,
              targetSessionId: id,
              detail: {
                completedByUserId: user.id,
                ...summary,
              },
            },
          });
        }

        return {
          kind: "COMPLETED" as const,
          session: completedSession,
          summary,
        };
      },
      {
        maxWait: 15_000,
        timeout: 60_000,
      }
    );

    if (result.kind === "CONFLICT") {
      await stopAsConflict({
        sessionId: id,
        title: result.title,
        userId: user.id,
        conflicts: result.conflicts,
      });

      return NextResponse.json(
        {
          code: "STOCKTAKE_COMPLETE_CONFLICT",
          message:
            "棚卸開始後に在庫数が変更された対象があります。誤反映を防ぐため棚卸を安全停止しました。",
          conflicts: result.conflicts,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        result.summary.recordedCount === 0
          ? "保存済みの入力がないため、在庫数は変更せず棚卸を終了しました。"
          : "棚卸を終了し、保存済みの棚卸入力を在庫数へ反映しました。",
      session: result.session,
      summary: result.summary,
    });
  } catch (error) {
    console.error("PATCH /api/stocktake/session/[id]", error);

    const code =
      error instanceof Error
        ? error.message
        : "STOCKTAKE_SESSION_UPDATE_500";

    if (code === "STOCKTAKE_COMPLETE_RACE_CONFLICT") {
      const { id } = await params;

      const latestSession = await prisma.stocktakeSession.findUnique({
        where: { id },
        select: {
          title: true,
        },
      });

      await stopAsConflict({
        sessionId: id,
        title: latestSession?.title ?? "棚卸",
        userId: user.id,
        conflicts: [],
      });

      return NextResponse.json(
        {
          code,
          message:
            "在庫更新と同時に別の変更を検知しました。誤反映を防ぐため棚卸を安全停止しました。",
        },
        { status: 409 }
      );
    }

    const knownMessages: Record<string, string> = {
      STOCKTAKE_COMPLETE_NOT_FOUND:
        "棚卸セッションが見つかりません。",
      STOCKTAKE_COMPLETE_ALREADY_DONE:
        "この棚卸はすでに終了しています。",
      STOCKTAKE_COMPLETE_STATUS_INVALID:
        "現在の状態では棚卸を終了できません。",
    };

    return NextResponse.json(
      {
        code,
        message:
          knownMessages[code] ??
          "棚卸状態の更新に失敗しました。",
      },
      { status: 500 }
    );
  }
}