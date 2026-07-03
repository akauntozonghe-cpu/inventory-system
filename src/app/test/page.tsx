"use client";

export default function TestPage() {
  const createItem = async () => {
    const itemRes =
      await fetch("/api/items", {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          name: "テスト商品",
        }),
      });

    const item =
      await itemRes.json();

    await fetch("/api/inventory", {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        itemId: item.id,

        quantity: 10,

        allocationType: "home",

        location: "棚A",
      }),
    });

    alert("作成完了");
  };

  return (
    <div className="p-8">
      <button
        onClick={createItem}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        テスト在庫作成
      </button>
    </div>
  );
}