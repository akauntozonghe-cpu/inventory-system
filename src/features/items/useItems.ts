"use client";

import { useEffect, useMemo, useState } from "react";
import type { Item } from "./types";

export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [janCode, setJanCode] = useState("");

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("nameAsc");

  const [editingId, setEditingId] = useState<string | null>(null);

  async function fetchItems() {
    setLoading(true);

    try {
      const res = await fetch("/api/items");

      if (!res.ok) {
        throw new Error("商品の取得に失敗しました。");
      }

      const data = await res.json();

      setItems(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchItems();
  }, []);

  async function saveItem() {
    if (!name.trim()) return;

    const res = await fetch("/api/items", {
      method: editingId ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: editingId,
        name,
        janCode,
      }),
    });

    if (!res.ok) {
      throw new Error("保存に失敗しました。");
    }

    setEditingId(null);
    setName("");
    setJanCode("");

    fetchItems();
  }

  function editItem(item: Item) {
    setEditingId(item.id);
    setName(item.name);
    setJanCode(item.janCode ?? "");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setName("");
    setJanCode("");
  }

  const filteredItems = useMemo(() => {
    const keyword = search.toLowerCase();

    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(keyword) ||
        (item.janCode ?? "").includes(keyword)
    );
  }, [items, search]);

  const sortedItems = useMemo(() => {
    const list = [...filteredItems];

    switch (sort) {
      case "nameDesc":
        return list.sort((a, b) =>
          b.name.localeCompare(a.name)
        );

      case "janAsc":
        return list.sort((a, b) =>
          (a.janCode ?? "").localeCompare(b.janCode ?? "")
        );

      case "janDesc":
        return list.sort((a, b) =>
          (b.janCode ?? "").localeCompare(a.janCode ?? "")
        );

      default:
        return list.sort((a, b) =>
          a.name.localeCompare(b.name)
        );
    }
  }, [filteredItems, sort]);

  return {
    items,
    filteredItems,
    sortedItems,
    loading,

    name,
    setName,

    janCode,
    setJanCode,

    search,
    setSearch,

    sort,
    setSort,

    editingId,

    fetchItems,
    saveItem,
    editItem,
    cancelEdit,
  };
}