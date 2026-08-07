import { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
};

export default function Section({
  title,
  children,
}: Props) {
  return (
    <section className="rounded-2xl border bg-white p-6 shadow">

      <h2 className="mb-5 text-xl font-bold">
        {title}
      </h2>

      {children}

    </section>
  );
}