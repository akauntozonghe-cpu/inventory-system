import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST() {
  await prisma.inventoryHistory.deleteMany();

  await prisma.inventoryInstance.deleteMany();

  await prisma.item.deleteMany();

  await prisma.storageLocation.deleteMany();

  return NextResponse.json({
    success: true,
  });
}