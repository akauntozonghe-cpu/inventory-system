"use client";

import { PackageOpen } from "lucide-react";

type EmptyStateProps = {
  title?: string;
  description?: string;
  action?: React.ReactNode;
};

export default function EmptyState({
  title = "データがありません",
  description = "表示できるデータがありません。",
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
      <PackageOpen
        size={64}
        className="mb-4 text-gray-300"
      />

      <h2 className="text-xl font-bold text-gray-700">
        {title}
      </h2>

      <p className="mt-2 max-w-md text-sm text-gray-500">
        {description}
      </p>

      {action && (
        <div className="mt-6">
          {action}
        </div>
      )}
    </div>
  );
}