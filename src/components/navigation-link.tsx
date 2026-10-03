"use client";
import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
function NavigationStatus() {
  const { pending } = useLinkStatus();
  return pending ? <span className="navigation-pending" role="status">Opening...</span> : null;
}
export function NavigationLink({ children, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props}>{children}<NavigationStatus /></Link>;
}
