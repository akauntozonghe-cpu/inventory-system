import { createPwaIcon } from "@/lib/pwa-icon";

export const runtime = "edge";
export function GET() { return createPwaIcon(512); }
