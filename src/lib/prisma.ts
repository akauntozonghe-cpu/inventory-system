import { PrismaClient } from "@prisma/client";
import { currentOperationAccess } from "./operation-access";

declare global {
  var prisma:
    | PrismaClient
    | undefined;
}

const base =
  global.prisma ||
  new PrismaClient();

if (
  process.env.NODE_ENV !==
  "production"
) {
  global.prisma =
    base;
}
// Capture signed request context on every audit write, including transaction clients.
// The context describes the active session, not whether an operation required elevation.
export const prisma = base.$extends({name:"operation-access-audit",query:{adminActionLog:{async create({args,query}){
  const access=await currentOperationAccess();
  const detail=args.data.detail;
  args.data.detail={...(detail&&typeof detail==="object"&&!Array.isArray(detail)?detail:{}),access};
  return query(args);
}},inventoryEvent:{async create({args,query}){
  const access=await currentOperationAccess();
  const detail=args.data.detail;
  args.data.detail={...(detail&&typeof detail==="object"&&!Array.isArray(detail)?detail:{}),access};
  return query(args);
}}}}) as unknown as PrismaClient;
