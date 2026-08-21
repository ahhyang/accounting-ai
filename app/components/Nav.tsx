"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

const publicLinks = [
  { href: "/" as const, label: "Home" },
  { href: "/login" as const, label: "Login" }
];

export function Nav() {
  const { data } = useSession();
  const portal = data?.user?.portal;

  const links =
    portal === "client"
      ? [
          { href: "/client" as const, label: "Checklist" },
          { href: "/client/uploads" as const, label: "Upload" },
          { href: "/client/messages" as const, label: "Messages" },
          { href: "/client/reports" as const, label: "Reports" }
        ]
      : portal === "accountant"
        ? [
            { href: "/accountant" as const, label: "Dashboard" },
            { href: "/accountant/inbox" as const, label: "Inbox" },
            { href: "/accountant/clients" as const, label: "Clients" },
            { href: "/accountant/audit" as const, label: "Audit" },
            { href: "/sales" as const, label: "Sales" },
            { href: "/purchases" as const, label: "Purchases" },
            { href: "/banking" as const, label: "Banking" },
            { href: "/month-end" as const, label: "Month-End" }
          ]
        : publicLinks;

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
              {data.user.name} ({data.user.roleName})
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
