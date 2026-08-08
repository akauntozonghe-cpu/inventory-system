"use client";

type SaveStocktakeRecordInput = {
  sessionId: string;
  inventoryInstanceId: string;
  countedQuantity: number;
  memo?: string;
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

export async function saveStocktakeRecord(
  input: SaveStocktakeRecordInput
) {
  const response = await fetch("/api/stocktake/record", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    throw new Error(
      getMessage(data, "棚卸データを保存できませんでした。")
    );
  }

  return data;
}