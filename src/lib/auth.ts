import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { NextResponse, type NextRequest } from "next/server";

const scrypt = promisify(scryptCallback);

export const AUTH_COOKIE = "inventory_session";
export const ADMIN_ELEVATION_COOKIE = "inventory_admin_elevation";

const SESSION_SECONDS = 60 * 60 * 12;
const ADMIN_ELEVATION_SECONDS = 60 * 10;

export type UserRole = "ADMIN" | "WORKER";

export type LoggedInUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  mustChangePassword: boolean;
  featurePermissions?: string[];
  expiresAt: number;
};

export type AdminElevation = {
  adminUserId: string;
  authenticatedByUserId: string;
  expiresAt: number;
};

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET が未設定、または短すぎます。32文字以上のランダムな文字列を設定してください。"
    );
  }

  return secret;
}

function sign(value: string) {
  return createHmac("sha256", getAuthSecret())
    .update(value)
    .digest("base64url");
}

function safelyCompare(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();

  return timingSafeEqual(leftHash, rightHash);
}

function createSignedToken(payload: object) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");

  return `${encoded}.${sign(encoded)}`;
}

function readSignedToken<T>(token?: string): T | null {
  if (!token) {
    return null;
  }

  const [encoded, signature, ...rest] = token.split(".");

  if (!encoded || !signature || rest.length > 0) {
    return null;
  }

  if (!safelyCompare(signature, sign(encoded))) {
    return null;
  }

  try {
    return JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as T;
  } catch {
    return null;
  }
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

  return safelyCompare(calculatedHash.toString("hex"), savedHash);
}

export function createSessionToken(
  user: Omit<LoggedInUser, "expiresAt">
) {
  return createSignedToken({
    ...user,
    expiresAt: Date.now() + SESSION_SECONDS * 1000,
  });
}

export function verifySessionToken(token?: string): LoggedInUser | null {
  const user = readSignedToken<LoggedInUser>(token);

  if (
    !user ||
    !user.id ||
    !user.username ||
    !user.displayName ||
    (user.role !== "ADMIN" && user.role !== "WORKER") ||
    typeof user.mustChangePassword !== "boolean" ||
    typeof user.expiresAt !== "number" ||
    user.expiresAt <= Date.now()
  ) {
    return null;
  }

  return user;
}

export function getLoggedInUser(request: NextRequest) {
  return verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);
}

/** 旧コードとの互換用 */
export function getCurrentUser(request: NextRequest) {
  return getLoggedInUser(request);
}

export function isAdmin(user: LoggedInUser | null) {
  return user?.role === "ADMIN";
}

export function createAdminElevationToken(input: {
  adminUserId: string;
  authenticatedByUserId: string;
}) {
  return createSignedToken({
    ...input,
    expiresAt: Date.now() + ADMIN_ELEVATION_SECONDS * 1000,
  });
}

export function verifyAdminElevationToken(
  token?: string
): AdminElevation | null {
  const elevation = readSignedToken<AdminElevation>(token);

  if (
    !elevation ||
    !elevation.adminUserId ||
    !elevation.authenticatedByUserId ||
    typeof elevation.expiresAt !== "number" ||
    elevation.expiresAt <= Date.now()
  ) {
    return null;
  }

  return elevation;
}

export function getAdminElevation(request: NextRequest) {
  return verifyAdminElevationToken(
    request.cookies.get(ADMIN_ELEVATION_COOKIE)?.value
  );
}

/**
 * 管理者本人、または「このログイン中ユーザー」に対して発行された
 * 一時管理者認証だけを許可する。
 */
export function hasAdminAccess(request: NextRequest) {
  const currentUser = getLoggedInUser(request);

  if (!currentUser) {
    return false;
  }

  if (isAdmin(currentUser)) {
    return true;
  }

  const elevation = getAdminElevation(request);

  return elevation?.authenticatedByUserId === currentUser.id;
}

export function requireLogin(request: NextRequest) {
  const user = getLoggedInUser(request);

  if (!user) {
    return {
      user: null,
      response: NextResponse.json(
        {
          code: "AUTH_REQUIRED",
          message: "ログインが必要です。",
        },
        { status: 401 }
      ),
    };
  }

  return {
    user,
    response: null,
  };
}

export function requireAdmin(request: NextRequest) {
  const login = requireLogin(request);

  if (login.response) {
    return login;
  }

  if (!hasAdminAccess(request)) {
    return {
      user: null,
      response: NextResponse.json(
        {
          code: "ADMIN_REQUIRED",
          message: "この操作には管理者権限が必要です。",
        },
        { status: 403 }
      ),
    };
  }

  return login;
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_SECONDS,
};

export const adminElevationCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: ADMIN_ELEVATION_SECONDS,
};
