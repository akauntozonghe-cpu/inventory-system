"use client";

export default function ResetPage() {
  const reset = async () => {
    await fetch("/api/reset", {
      method: "POST",
    });

    alert("全削除完了");
  };

  return (
    <div className="p-8">
      <button
        onClick={reset}
        className="bg-red-500 text-white px-4 py-2 rounded"
      >
        DB全削除
      </button>
    </div>
  );
}