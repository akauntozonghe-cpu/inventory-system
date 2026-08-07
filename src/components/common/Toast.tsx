"use client";

type ToastProps = {
  message: string;
  type?: "success" | "error" | "info";
};

export default function Toast({
  message,
  type = "info",
}: ToastProps) {
  const colors = {
    success: "bg-green-600",
    error: "bg-red-600",
    info: "bg-blue-600",
  };

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 rounded-lg px-5 py-3 text-white shadow-lg ${colors[type]}`}
    >
      {message}
    </div>
  );
}