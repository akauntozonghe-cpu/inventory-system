"use client";

import { useEffect, useMemo, useState } from "react";

import PageHeader from "@/components/common/PageHeader";
import SearchBar from "@/components/common/SearchBar";

import ItemStats from "./ItemStats";
import ItemForm from "./ItemForm";
import ItemTable from "./ItemTable";
import ItemSort from "./ItemSort";

import type { Item } from "./types";

export default function ItemPage() {
  const [items, setItems] = useState<Item[]>([]);

  const [name, setName] = useState("");
  const [janCode, setJanCode] = useState("");

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("nameAsc");

  const [loading, setLoading] = useState(false);

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

    try {
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
    } catch (error) {
      console.error(error);
      alert("保存に失敗しました。");
    }
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

    return items.filter((item) => {
      return (
        item.name.toLowerCase().includes(keyword) ||
        (item.janCode ?? "").includes(keyword)
      );
    });
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="商品管理"
        description="商品マスタ管理"
      />

      <ItemStats
        items={items}
        filteredItems={filteredItems}
        loading={loading}
      />

      <ItemForm
        name={name}
        janCode={janCode}
        isEdit={editingId !== null}
        setName={setName}
        setJanCode={setJanCode}
        onSubmit={saveItem}
        onCancel={cancelEdit}
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="商品名・JAN検索"
          className="max-w-xl"
        />

        <ItemSort
          value={sort}
          onChange={setSort}
        />
      </div>

      <ItemTable
        items={sortedItems}
        reload={fetchItems}
        onEdit={editItem}
      />
    </div>
  );
}