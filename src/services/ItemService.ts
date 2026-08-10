import { ItemRepository } from "@/repositories/ItemRepository";

type ItemCreateInput = {
  name: string;
  janCode?: string;
  systemBarcode?: string;
  manufacturer?: string;
  managementCode?: string;
  managementGroupCode?: string;
  majorCategory?: string;
  minorCategory?: string;
  defaultUnit?: string;
};

type ItemUpdateInput = Partial<{
  name: string;
  janCode: string;
  systemBarcode: string;
  manufacturer: string;
  managementCode: string;
  managementGroupCode: string;
  majorCategory: string;
  minorCategory: string;
  defaultUnit: string;
}>;

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

  static async create(data: ItemCreateInput) {
    if (!data.name?.trim()) {
      throw new Error("商品名は必須です。");
    }

    return ItemRepository.create({
      ...data,
      name: data.name.trim(),
      janCode: data.janCode?.trim() || undefined,
      systemBarcode: data.systemBarcode?.trim() || undefined,
      manufacturer: data.manufacturer?.trim() || undefined,
      managementCode: data.managementCode?.trim() || undefined,
      managementGroupCode: data.managementGroupCode?.trim() || undefined,
      majorCategory: data.majorCategory?.trim() || undefined,
      minorCategory: data.minorCategory?.trim() || undefined,
      defaultUnit: data.defaultUnit?.trim() || undefined,
    });
  }

  static async update(data: ItemUpdateInput & { id: string }) {
    if (!data.id) {
      throw new Error("商品IDがありません。");
    }

    const { id, ...updateData } = data;

    return ItemRepository.update(id, {
      ...updateData,
      name: updateData.name?.trim(),
      janCode: updateData.janCode?.trim(),
      systemBarcode: updateData.systemBarcode?.trim(),
      manufacturer: updateData.manufacturer?.trim(),
      managementCode: updateData.managementCode?.trim(),
      managementGroupCode: updateData.managementGroupCode?.trim(),
      majorCategory: updateData.majorCategory?.trim(),
      minorCategory: updateData.minorCategory?.trim(),
      defaultUnit: updateData.defaultUnit?.trim(),
    });
  }

  static async delete(id: string) {
    if (!id) {
      throw new Error("商品IDがありません。");
    }

    return ItemRepository.delete(id);
  }
}