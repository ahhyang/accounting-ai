"use client";

import Link from "next/link";
import type { Route } from "next";
import { signOut, useSession } from "next-auth/react";
import type { AppPortal } from "@/lib/permissions/constants";

type NavLink = { href: Route; label: string };

const publicLinks: NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/login", label: "Login" }
];

function linksForPortal(portal: AppPortal | undefined): NavLink[] {
  switch (portal) {
    case "client":
      return [
        { href: "/client" as Route, label: "Checklist" },
        { href: "/client/documents" as Route, label: "Documents" },
        { href: "/client/messages" as Route, label: "Messages" },
        { href: "/client/reports" as Route, label: "Reports" }
      ];
    case "tax":
      return [
        { href: "/tax" as Route, label: "Tax pack" },
        { href: "/sales" as Route, label: "Sales" },
        { href: "/purchases" as Route, label: "Purchases" }
      ];
    case "audit":
      return [
        { href: "/auditor" as Route, label: "Readiness" },
        { href: "/accountant/audit" as Route, label: "Activity" }
      ];
    case "manager":
      return [
        { href: "/manager" as Route, label: "Close" },
        { href: "/month-end" as Route, label: "Month-end" },
        { href: "/accountant/inbox" as Route, label: "Inbox" },
        { href: "/tax" as Route, label: "Tax" }
      ];
    case "boss":
      return [
        { href: "/boss" as Route, label: "Overview" },
        { href: "/manager" as Route, label: "Manager" },
        { href: "/accountant" as Route, label: "Accountant" },
        { href: "/tax" as Route, label: "Tax" },
        { href: "/auditor" as Route, label: "Audit" }
      ];
    case "accountant":
      return [
        { href: "/accountant" as Route, label: "Dashboard" },
        { href: "/accountant/inbox" as Route, label: "Inbox" },
        { href: "/accountant/clients" as Route, label: "Clients" },
        { href: "/scan" as Route, label: "Scan" },
        { href: "/sales" as Route, label: "Sales" },
        { href: "/purchases" as Route, label: "Purchases" },
        { href: "/banking" as Route, label: "Banking" },
        { href: "/month-end" as Route, label: "Month-end" },
        { href: "/accountant/audit" as Route, label: "Activity" }
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
      <strong>
        <Link href={(data?.user ? links[0]?.href : "/") as Route} style={{ color: "inherit" }}>
          AI Finance OS
        </Link>
      </strong>
      <div className="nav-links">
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
        {data?.user ? (
          <button
            type="button"
            className="btn small secondary"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sign out
          </button>
        ) : (
          <Link href="/login">Login</Link>
        )}
      </div>
    </nav>
  );
}
