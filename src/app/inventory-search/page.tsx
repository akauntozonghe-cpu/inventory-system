import { redirect } from "next/navigation";

export default function InventorySearchRedirect() {
  redirect("/items");
}
