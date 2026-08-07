type Props = {
  value: string;
  onChange: (value: string) => void;
};

export default function ItemSort({
  value,
  onChange,
}: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border px-4 py-2"
    >
      <option value="nameAsc">商品名（昇順）</option>
      <option value="nameDesc">商品名（降順）</option>
      <option value="janAsc">JAN（昇順）</option>
      <option value="janDesc">JAN（降順）</option>
    </select>
  );
}