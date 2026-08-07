import { useEffect, useMemo, useState } from "react";
import type { Item } from "./types";

export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");

  async function fetchItems() {
    setLoading(true);

    try {
      const res = await fetch("/api/items");

      if (!res.ok) {
        throw new Error();
      }

      const data = await res.json();

      setItems(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchItems();
  }, []);

  const filteredItems = useMemo(() => {
    const keyword = search.toLowerCase();

    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(keyword) ||
        (item.janCode ?? "").includes(keyword)
    );
  }, [items, search]);

  return {
    items,
    filteredItems,
    loading,
    search,
    setSearch,
    fetchItems,
  };
}