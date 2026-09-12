"use client";
import Link from "next/link";
import type { ComponentProps } from "react";
import { useAppAccess } from "./AppAccessProvider";
export default function PermissionLink(props: ComponentProps<typeof Link>) {
  const {canPath}=useAppAccess();
  const href=typeof props.href === "string" ? props.href : props.href.pathname ?? "/";
  return canPath(href) ? <Link {...props}/> : null;
}
