"use client";

import { ReactNode } from "react";

export type DataTableColumn<T> = {
  key: keyof T | string;
  title: string;
  align?: "left" | "center" | "right";
  width?: string;
  render?: (row: T) => ReactNode;
};

type Props<T> = {
  columns: DataTableColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
};

export default function DataTable<T>({
  columns,
  data,
  loading = false,
  emptyMessage = "データがありません。",
}: Props<T>) {
  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-10 text-center">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow">
      <table className="w-full border-collapse">
        <thead className="bg-slate-100">
          <tr>
            {columns.map((column) => (
              <th
                key={String(column.key)}
                style={{
                  width: column.width,
                }}
                className={`border-b px-4 py-3 text-sm font-semibold ${
                  column.align === "center"
                    ? "text-center"
                    : column.align === "right"
                    ? "text-right"
                    : "text-left"
                }`}
              >
                {column.title}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {data.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="p-10 text-center text-gray-500"
              >
                {emptyMessage}
              </td>
            </tr>
          )}

          {data.map((row, index) => (
            <tr
              key={index}
              className="border-b transition hover:bg-slate-50"
            >
              {columns.map((column) => (
                <td
                  key={String(column.key)}
                  className={`px-4 py-3 ${
                    column.align === "center"
                      ? "text-center"
                      : column.align === "right"
                      ? "text-right"
                      : "text-left"
                  }`}
                >
                  {column.render
                    ? column.render(row)
                    : String(
                        row[column.key as keyof T] ?? ""
                      )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}