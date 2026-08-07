"use client";

type LoadingProps = {
  message?: string;
  fullScreen?: boolean;
};

export default function Loading({
  message = "読み込み中...",
  fullScreen = false,
}: LoadingProps) {
  const content = (
    <div className="flex flex-col items-center justify-center gap-4 py-10">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />

      <p className="text-sm text-gray-500">
        {message}
      </p>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        {content}
      </div>
    );
  }

  return content;
}