import { StocktakeRepository } from "@/repositories/StocktakeRepository";

export class StocktakeService {
  static async startSession(
    title: string,
    operator?: string
  ) {
    if (!title.trim()) {
      throw new Error("棚卸名を入力してください");
    }

    return StocktakeRepository.createSession({
      title,
      operator,
    });
  }

  static async finishSession(id: string) {
    return StocktakeRepository.completeSession(id);
  }

  static async getSession(id: string) {
    return StocktakeRepository.getSession(id);
  }

  static async getRunningSession() {
    return StocktakeRepository.getActiveSession();
  }
}