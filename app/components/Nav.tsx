"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import type { AppPortal } from "@/lib/permissions/constants";

const publicLinks = [
  { href: "/" as const, label: "Home" },
  { href: "/login" as const, label: "Login" }
];

function linksForPortal(portal: AppPortal | undefined) {
  switch (portal) {
    case "client":
      return [
        { href: "/client" as const, label: "Checklist" },
        { href: "/scan" as const, label: "Scan Bill" },
        { href: "/client/uploads" as const, label: "Upload" },
        { href: "/client/messages" as const, label: "Messages" },
        { href: "/client/reports" as const, label: "Reports" }
      ];
    case "tax":
      return [
        { href: "/tax" as const, label: "Tax pack" },
        { href: "/sales" as const, label: "Sales" },
        { href: "/purchases" as const, label: "Purchases" }
      ];
    case "audit":
      return [
        { href: "/auditor" as const, label: "Audit" },
        { href: "/accountant/audit" as const, label: "Activity log" }
      ];
    case "manager":
      return [
        { href: "/manager" as const, label: "Close" },
        { href: "/month-end" as const, label: "Month-end" },
        { href: "/accountant/inbox" as const, label: "Inbox" },
        { href: "/tax" as const, label: "Tax" },
        { href: "/sales" as const, label: "Sales" },
        { href: "/purchases" as const, label: "Purchases" }
      ];
    case "boss":
      return [
        { href: "/boss" as const, label: "Oversight" },
        { href: "/manager" as const, label: "Manager" },
        { href: "/accountant" as const, label: "Accountant" },
        { href: "/tax" as const, label: "Tax" },
        { href: "/auditor" as const, label: "Audit" },
        { href: "/client" as const, label: "Client" }
      ];
    case "accountant":
      return [
        { href: "/accountant" as const, label: "Dashboard" },
        { href: "/accountant/inbox" as const, label: "Inbox" },
        { href: "/scan" as const, label: "Scan Bill" },
        { href: "/sales" as const, label: "Sales" },
        { href: "/purchases" as const, label: "Purchases" },
        { href: "/banking" as const, label: "Banking" },
        { href: "/month-end" as const, label: "Month-End" },
        { href: "/accountant/audit" as const, label: "Audit log" }
      ];
    default:
      return publicLinks;
  }
}

export function Nav() {
  const { data } = useSession();
  const portal = data?.user?.portal;
  const links = data?.user ? linksForPortal(portal) : publicLinks;

  return (
    <nav className="nav">
      <strong>AI Finance OS</strong>
      <div className="nav-links">
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
        {data?.user ? (
          <>
            <span className="muted" style={{ fontSize: 12 }}>
              {data.user.name} · {data.user.roleName}
            </span>
            <button type="button" className="btn small secondary" onClick={() => signOut({ callbackUrl: "/login" })}>
              Sign out
            </button>
          </>
        ) : (
          <Link href="/login">Login</Link>
        )}
      </div>
    </nav>
  );
}
