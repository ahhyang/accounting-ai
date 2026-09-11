"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";

export default function AccountantDashboard() {
  const [inbox, setInbox] = useState<{
    groups: {
      readyToApprove: unknown[];
      needsManual: unknown[];
      waitingOnClient: unknown[];
    };
  } | null>(null);

  useEffect(() => {
    fetch("/api/accountant/inbox")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setInbox(data);
      });
  }, []);

  return (
    <main className="container grid">
      <section className="card">
        <div className="page-header">
          <h1>Accountant workspace</h1>
          <p className="muted">
            Review AI proposals, tidy documents, post AR/AP, and keep Malaysian SME books clean.
          </p>
        </div>
      </section>

      <section className="grid metrics">
        <div className="card">
          <h3>Ready to approve</h3>
          <p className="metric-value">{inbox?.groups.readyToApprove.length ?? 0}</p>
        </div>
        <div className="card">
          <h3>Needs manual</h3>
          <p className="metric-value">{inbox?.groups.needsManual.length ?? 0}</p>
        </div>
        <div className="card">
          <h3>Waiting on client</h3>
          <p className="metric-value">{inbox?.groups.waitingOnClient.length ?? 0}</p>
        </div>
      </section>

      <section className="card">
        <h2>Shortcuts</h2>
        <div className="links">
          <Link href={"/accountant/tidy" as Route}>AI tidy · classify, rename, count, book</Link>
          <Link href={"/accountant/inbox" as Route}>Open sorted inbox</Link>
          <Link href={"/accountant/books" as Route}>Books &amp; balance · trial balance check</Link>
          <Link href={"/tax" as Route}>Tax AI · count, reduce, audit</Link>
          <Link href={"/accountant/clients" as Route}>Manage clients</Link>
          <Link href={"/sales" as Route}>Sales (AR)</Link>
          <Link href={"/purchases" as Route}>Purchases (AP)</Link>
          <Link href={"/banking" as Route}>Banking</Link>
          <Link href={"/month-end" as Route}>Month-end checklist</Link>
          <Link href={"/accountant/audit" as Route}>Activity log</Link>
        </div>
      </section>
    </main>
  );
}
