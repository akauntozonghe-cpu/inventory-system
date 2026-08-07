import { ItemRepository } from "@/repositories/ItemRepository";

export class ItemService {
  static async getAll() {
    return ItemRepository.findAll();
  }

  static async search(keyword: string) {
    if (!keyword.trim()) {
      return [];
    }

    return ItemRepository.search(keyword);
  }

  static async create(data: {
    name: string;
    janCode?: string;
    manufacturer?: string;
    managementCode?: string;
    managementGroupCode?: string;
    majorCategory?: string;
    minorCategory?: string;
    defaultUnit?: string;
  }) {
    if (!data.name?.trim()) {
      throw new Error("商品名は必須です。");
    }

    return ItemRepository.create(data);
  }

  static async update(data: {
    id: string;
    name?: string;
    janCode?: string;
    manufacturer?: string;
    managementCode?: string;
    managementGroupCode?: string;
    majorCategory?: string;
    minorCategory?: string;
    defaultUnit?: string;
  }) {
    if (!data.id) {
      throw new Error("IDがありません。");
    }

    const { id, ...updateData } = data;

    return ItemRepository.update(id, updateData);
  }

  static async delete(id: string) {
    return ItemRepository.delete(id);
  }
}