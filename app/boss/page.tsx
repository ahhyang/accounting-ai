"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import type { Route } from "next";

type ClientRow = {
  companyId: string;
  name: string;
  registrationNumber: string | null;
  industry: string | null;
  engagement: {
    status: string;
    billingStatus: string;
    accountingFee: number | null;
    amountDue: number | null;
    dueDate: string | null;
    invoiceNumber: string | null;
    lastPaymentDate: string | null;
    notes: string | null;
  };
  progress: {
    periodLabel: string;
    periodClosed: boolean;
    documentsTotal: number;
    documentsPosted: number;
    documentsPending: number;
    monthEndCompletion: number;
    tbBalanced: boolean;
    postedJournals: number;
    outstandingAR: number;
    outstandingAP: number;
  };
  tax: { sstRegistered: boolean; sstNetPayable: number };
  audit: {
    readinessScore: number;
    goingConcernFlags: number;
    duplicateBillGroups: number;
    bankUnmatched: number;
  };
};

type FirmTotals = {
  clientCount: number;
  documentsTotal: number;
  documentsPending: number;
  documentsPosted: number;
  totalAR: number;
  totalAP: number;
  postedJournals: number;
  billing: { paid: number; invoiced: number; overdue: number; notBilled: number; totalDue: number };
  tax: { sstRegisteredCount: number; sstNetTotal: number };
  audit: {
    balancedClients: number;
    unbalancedClients: number;
    goingConcernClients: number;
    duplicateGroups: number;
    clientsWithPendingDocs: number;
  };
  monthEnd: { closedPeriods: number; avgCompletion: number };
};

const money = (n: number | null | undefined) =>
  n == null ? "—" : `RM ${Number(n).toFixed(2)}`;

function billingBadge(status: string) {
  if (status === "PAID") return "badge";
  if (status === "OVERDUE") return "message error";
  return "badge";
}

export default function BossPortalPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<"clients" | "firm">("clients");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [firm, setFirm] = useState<FirmTotals | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/firm/portfolio");
      const json = await res.json();
      if (!json.ok) {
        setError(String(json.error || "Failed to load portfolio"));
        return;
      }
      setClients(json.clients ?? []);
      setFirm(json.firm ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load portfolio");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="container grid">
      <section className="card">
        <div className="page-header">
          <h1>Boss / Partner control room</h1>
          <p className="muted">
            Firm-wide oversight. See every client&apos;s progress and whether their accounting is
            paid, then drill into accounting, tax and audit across the whole practice.
          </p>
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className={`btn ${tab === "clients" ? "" : "secondary"}`}
            onClick={() => setTab("clients")}
          >
            Clients &amp; payments
          </button>
          <button
            type="button"
            className={`btn ${tab === "firm" ? "" : "secondary"}`}
            onClick={() => setTab("firm")}
          >
            Accounting · Tax · Audit
          </button>
          <button type="button" className="btn secondary" onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </section>

      {error && <p className="message error">{error}</p>}

      {tab === "clients" && firm && (
        <>
          <section className="grid metrics">
            <div className="card">
              <h3>Clients</h3>
              <p className="metric-value">{firm.clientCount}</p>
            </div>
            <div className="card">
              <h3>Accounting paid</h3>
              <p className="metric-value">{firm.billing.paid}</p>
              <span className="muted">{firm.billing.overdue} overdue</span>
            </div>
            <div className="card">
              <h3>Outstanding fees</h3>
              <p className="metric-value">{money(firm.billing.totalDue)}</p>
            </div>
            <div className="card">
              <h3>Avg month-end</h3>
              <p className="metric-value">{firm.monthEnd.avgCompletion}%</p>
              <span className="muted">{firm.monthEnd.closedPeriods} periods closed</span>
            </div>
          </section>

          <section className="card">
            <h2>Client status &amp; progress</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Engagement</th>
                    <th>Documents</th>
                    <th>Month-end</th>
                    <th>Books</th>
                    <th>Payment</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.companyId}>
                      <td>
                        <strong>{c.name}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {c.registrationNumber ?? "—"}
                          {c.industry ? ` · ${c.industry}` : ""}
                        </div>
                      </td>
                      <td>
                        <span className="badge">{c.engagement.status}</span>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {c.progress.periodLabel}
                          {c.progress.periodClosed ? " · closed" : ""}
                        </div>
                      </td>
                      <td>
                        {c.progress.documentsPosted}/{c.progress.documentsTotal} posted
                        {c.progress.documentsPending > 0 ? (
                          <div className="muted" style={{ fontSize: 12 }}>
                            {c.progress.documentsPending} pending
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <div className="progress" style={{ minWidth: 90 }}>
                          <div
                            className="progress-bar"
                            style={{ width: `${c.progress.monthEndCompletion}%` }}
                          />
                        </div>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {c.progress.monthEndCompletion}%
                        </span>
                      </td>
                      <td>{c.progress.tbBalanced ? "Balanced ✓" : "Not balanced ✗"}</td>
                      <td>
                        <span className={billingBadge(c.engagement.billingStatus)}>
                          {c.engagement.billingStatus.replace("_", " ")}
                        </span>
                        <div className="muted" style={{ fontSize: 12 }}>
                          due {money(c.engagement.amountDue)}
                          {c.engagement.dueDate ? ` · ${c.engagement.dueDate}` : ""}
                        </div>
                      </td>
                      <td>
                        <Link href={`/manager?companyId=${c.companyId}` as Route}>Manage</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {tab === "firm" && firm && (
        <>
          <section className="card">
            <h2>Accounting</h2>
            <div className="grid metrics">
              <div className="card">
                <h3>Posted journals</h3>
                <p className="metric-value">{firm.postedJournals}</p>
              </div>
              <div className="card">
                <h3>Documents posted</h3>
                <p className="metric-value">{firm.documentsPosted}</p>
                <span className="muted">{firm.documentsPending} pending</span>
              </div>
              <div className="card">
                <h3>Outstanding AR</h3>
                <p className="metric-value">{money(firm.totalAR)}</p>
              </div>
              <div className="card">
                <h3>Outstanding AP</h3>
                <p className="metric-value">{money(firm.totalAP)}</p>
              </div>
            </div>
          </section>

          <section className="card">
            <h2>Tax</h2>
            <div className="grid metrics">
              <div className="card">
                <h3>SST-registered clients</h3>
                <p className="metric-value">
                  {firm.tax.sstRegisteredCount}/{firm.clientCount}
                </p>
              </div>
              <div className="card">
                <h3>Net SST position</h3>
                <p className="metric-value">{money(firm.tax.sstNetTotal)}</p>
                <span className="muted">
                  {firm.tax.sstNetTotal >= 0 ? "payable" : "refund"}
                </span>
              </div>
            </div>
          </section>

          <section className="card">
            <h2>Audit readiness</h2>
            <div className="grid metrics">
              <div className="card">
                <h3>Balanced books</h3>
                <p className="metric-value">
                  {firm.audit.balancedClients}/{firm.clientCount}
                </p>
                <span className="muted">{firm.audit.unbalancedClients} unbalanced</span>
              </div>
              <div className="card">
                <h3>Going-concern flags</h3>
                <p className="metric-value">{firm.audit.goingConcernClients}</p>
              </div>
              <div className="card">
                <h3>Duplicate groups</h3>
                <p className="metric-value">{firm.audit.duplicateGroups}</p>
              </div>
              <div className="card">
                <h3>Clients with pending docs</h3>
                <p className="metric-value">{firm.audit.clientsWithPendingDocs}</p>
              </div>
            </div>
          </section>
        </>
      )}

      <section className="card links">
        <Link href={"/manager" as Route}>Manager workspace →</Link>
        <Link href={"/accountant" as Route}>Accountant →</Link>
        <Link href={"/tax" as Route}>Tax →</Link>
        <Link href={"/auditor" as Route}>Audit →</Link>
        <Link href={"/setup" as Route}>Add company →</Link>
      </section>

      <p className="muted">Signed in as {session?.user?.email}</p>
    </main>
  );
}
