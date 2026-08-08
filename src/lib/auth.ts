import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { NextRequest } from "next/server";

const scrypt = promisify(scryptCallback);

export const AUTH_COOKIE = "inventory_session";
const SESSION_SECONDS = 60 * 60 * 12;

export type LoggedInUser = {
  id: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "WORKER";
  expiresAt: number;
};

function secret() {
  const value = process.env.AUTH_SECRET;

  if (!value || value.length < 32) {
    throw new Error("AUTH_SECRET が設定されていません。");
  }

  return value;
}

function sign(value: string) {
  return createHmac("sha256", secret())
    .update(value)
    .digest("base64url");
}

function sameText(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();

  return timingSafeEqual(leftHash, rightHash);
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;

  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  passwordHash: string
) {
  const [salt, savedHash] = passwordHash.split(":");

  if (!salt || !savedHash) {
    return false;
  }

  const calculatedHash = (await scrypt(password, salt, 64)) as Buffer;

  return sameText(calculatedHash.toString("hex"), savedHash);
}

export function createSessionToken(
  user: Omit<LoggedInUser, "expiresAt">
) {
  const payload: LoggedInUser = {
    ...user,
    expiresAt: Date.now() + SESSION_SECONDS * 1000,
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");

  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(
  token?: string
): LoggedInUser | null {
  if (!token) {
    return null;
  }

  const [encoded, receivedSignature, ...rest] = token.split(".");

  if (!encoded || !receivedSignature || rest.length > 0) {
    return null;
  }

  if (!sameText(receivedSignature, sign(encoded))) {
    return null;
  }

  try {
    const user = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as LoggedInUser;

    if (
      !user.id ||
      !user.username ||
      !user.displayName ||
      !user.role ||
      user.expiresAt <= Date.now()
    ) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

export function getLoggedInUser(request: NextRequest) {
  return verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);
}

export function isAdmin(user: LoggedInUser | null) {
  return user?.role === "ADMIN";
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_SECONDS,
};