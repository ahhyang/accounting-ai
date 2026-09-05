"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
        <h1>Accountant workspace</h1>
        <p className="muted">
          Full-set bookkeeping for Malaysian SME clients: review AI proposals, post AR/AP, bank
          reconcile. Tax / Audit / Manager / Boss have their own portals after you.
        </p>
      </section>
      <section className="grid metrics">
        <div className="card">
          <h3>Ready to approve</h3>
          <p>{inbox?.groups.readyToApprove.length ?? 0}</p>
        </div>
        <div className="card">
          <h3>Needs manual</h3>
          <p>{inbox?.groups.needsManual.length ?? 0}</p>
        </div>
        <div className="card">
          <h3>Waiting on client</h3>
          <p>{inbox?.groups.waitingOnClient.length ?? 0}</p>
        </div>
      </section>
      <section className="card links">
        <Link href="/accountant/inbox">Open sorted inbox →</Link>
        <Link href="/accountant/clients">Manage clients →</Link>
        <Link href="/sales">Sales (AR) →</Link>
        <Link href="/purchases">Purchases (AP) →</Link>
        <Link href="/banking">Banking →</Link>
        <Link href="/month-end">Month-end checklist →</Link>
        <Link href="/accountant/audit">Activity log →</Link>
      </section>
    </main>
  );
}
