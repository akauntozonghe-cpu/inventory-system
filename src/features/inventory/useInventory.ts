"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  Inventory,
  Item,
} from "./types";

export function useInventory() {
  const [items, setItems] =
    useState<Item[]>([]);

  const [inventories, setInventories] =
    useState<Inventory[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [search, setSearch] =
    useState("");

  async function fetchItems() {
    const res = await fetch("/api/items");

    if (!res.ok) {
      throw new Error("商品取得失敗");
    }

    setItems(await res.json());
  }

  async function fetchInventory() {
    setLoading(true);

    try {
      const res = await fetch("/api/inventory");

      if (!res.ok) {
        throw new Error("在庫取得失敗");
      }

      setInventories(await res.json());

    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchItems();
    fetchInventory();
  }, []);

  const filteredInventories =
    useMemo(() => {
      const keyword =
        search.toLowerCase();

      return inventories.filter(
        (inv) =>
          inv.item.name
            .toLowerCase()
            .includes(keyword) ||
          (
            inv.storageLocation
              ?.name ?? ""
          )
            .toLowerCase()
            .includes(keyword)
      );
    }, [inventories, search]);

  return {
    items,

    inventories:
      filteredInventories,

    loading,

    search,

    setSearch,

    fetchInventory,
  };
}