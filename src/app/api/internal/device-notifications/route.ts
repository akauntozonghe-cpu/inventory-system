import { NextRequest, NextResponse } from "next/server";
import { validCronAuthorization } from "@/lib/cron-auth";
import { deliverDeviceNotifications } from "@/lib/device-push";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  if (!validCronAuthorization(request.headers.get("authorization"), process.env.CRON_SECRET))
    return NextResponse.json({code:"CRON_UNAUTHORIZED"}, {status:401});
  try { await deliverDeviceNotifications(); return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}}); }
  catch { return NextResponse.json({code:"PUSH_DELIVERY_FAILED"},{status:503}); }
}
