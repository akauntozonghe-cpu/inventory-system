type Props = {
  title: string;
  value: number | string;
  icon: string;
  color?: string;
};

export default function StatusCard({
  title,
  value,
  icon,
  color = "bg-white",
}: Props) {
  return (
    <div
      className={`${color} rounded-2xl border p-5 shadow transition hover:shadow-lg`}
    >
      <div className="flex items-center justify-between">

        <div>

          <p className="text-sm text-gray-500">
            {title}
          </p>

          <p className="mt-2 text-3xl font-bold">
            {value}
          </p>

        </div>

        <div className="text-5xl">
          {icon}
        </div>

      </div>
    </div>
  );
}