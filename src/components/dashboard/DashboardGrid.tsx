import { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export default function DashboardGrid({
  children,
}: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {children}
    </div>
  );
}