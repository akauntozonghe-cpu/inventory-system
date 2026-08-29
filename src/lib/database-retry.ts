import { Prisma } from "@prisma/client";

const RETRYABLE_CODES = new Set(["P1001", "P1002", "P1008", "P2024"]);

export function databaseErrorCode(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code;
  if (error instanceof Prisma.PrismaClientInitializationError) return "DATABASE_INITIALIZATION_FAILED";
  return null;
}

export function isRetryableDatabaseError(error: unknown) {
  const code = databaseErrorCode(error);
  return code === "DATABASE_INITIALIZATION_FAILED" || (code !== null && RETRYABLE_CODES.has(code));
}

export async function withDatabaseRetry<T>(operation: () => Promise<T>, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      lastError = error;
      if (!isRetryableDatabaseError(error) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}
