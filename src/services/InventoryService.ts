import { InventoryRepository } from "@/repositories/InventoryRepository";

export class InventoryService {
  static async search(keyword: string) {
    if (!keyword.trim()) {
      return [];
    }

    return InventoryRepository.search(keyword);
  }
}