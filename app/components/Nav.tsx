import Link from "next/link";

const links = [
  { href: "/" as const, label: "Dashboard" },
  { href: "/setup" as const, label: "Setup" },
  { href: "/coa" as const, label: "COA" },
  { href: "/sales" as const, label: "Sales" },
  { href: "/purchases" as const, label: "Purchases" },
  { href: "/banking" as const, label: "Banking" },
  { href: "/month-end" as const, label: "Month-End" }
];

export function Nav() {
  return (
    <nav className="nav">
      <strong>AI Finance OS</strong>
      <div className="nav-links">
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
