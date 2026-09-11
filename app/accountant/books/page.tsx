"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useCompanyId } from "@/app/components/useCompanyId";
import { EmptyState } from "@/app/components/EmptyState";
import { categoryLabel, statusLabel } from "@/lib/ux/labels";

type BooksResponse = {
  ok: boolean;
  error?: string;
  period: { id: string; startDate: string; endDate: string; isClosed: boolean } | null;
  balance: {
    rows: Array<{ code: string; name: string; type: string; debit: number; credit: number }>;
    totalDebit: number;
    totalCredit: number;
    balanced: boolean;
    difference: number;
  };
  documents: {
    total: number;
    byCategory: Record<string, number>;
    byStatus: Record<string, number>;
    pendingReview: number;
    posted: number;
  };
  books: { postedJournals: number; revenue: number; expenses: number; profit: number };
  tax: {
    outputTax: number;
    inputTax: number;
    netPayable: number;
    sstRegistered: boolean;
  };
};

function money(n: number) {
  return `RM ${Number(n ?? 0).toFixed(2)}`;
}

function BooksBalanceInner() {
  const { companyId, companyName, ready, loadingSession } = useCompanyId();
  const [data, setData] = useState<BooksResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (!companyId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/companies/${companyId}/books`);
      const json = (await res.json()) as BooksResponse;
      if (json.ok) setData(json);
      else setError(String(json.error ?? "Failed to load books."));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load books.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ready) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, companyId]);

  if (loadingSession) {
    return (
      <main className="container">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (!companyId) {
    return (
      <main className="container">
        <EmptyState title="Sign in required" hint="Log in to see the books and balance check." />
      </main>
    );
  }

  const balance = data?.balance;
  const docs = data?.documents;
  const books = data?.books;
  const tax = data?.tax;

  return (
    <main className="container grid">
      <section className="card">
        <div className="page-header">
          <h1>Books &amp; balance</h1>
          <p className="muted">
            {companyName || "Company"} — count every posted document, check the trial balance, then
            move to tax and audit.
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn secondary" onClick={load} disabled={loading}>
            {loading ? "Checking…" : "Re-check balance"}
          </button>
          <Link className="btn secondary" href={"/accountant/inbox" as Route}>
            Open inbox
          </Link>
        </div>
        {data?.period && (
          <p className="muted" style={{ marginTop: 8 }}>
            Period {new Date(data.period.startDate).toLocaleDateString()} –{" "}
            {new Date(data.period.endDate).toLocaleDateString()}
            {data.period.isClosed ? " · Closed" : ""}
          </p>
        )}
      </section>

      {error && <p className="message error">{error}</p>}

      {balance && (
        <section className={`card ${balance.balanced ? "" : "message error"}`}>
          <h2>{balance.balanced ? "Books are balanced ✓" : "Books are NOT balanced ✗"}</h2>
          <p className="muted">
            Total debit {money(balance.totalDebit)} · Total credit {money(balance.totalCredit)}
            {!balance.balanced ? ` · Difference ${money(Math.abs(balance.difference))}` : ""}
          </p>
        </section>
      )}

      {docs && books && (
        <section className="grid metrics">
          <div className="card">
            <h3>Documents</h3>
            <p className="metric-value">{docs.total}</p>
            <span className="muted">{docs.pendingReview} awaiting review</span>
          </div>
          <div className="card">
            <h3>Posted</h3>
            <p className="metric-value">{docs.posted}</p>
            <span className="muted">{books.postedJournals} journal entries</span>
          </div>
          <div className="card">
            <h3>Estimated profit</h3>
            <p className="metric-value">{money(books.profit)}</p>
            <span className="muted">Revenue {money(books.revenue)}</span>
          </div>
          <div className="card">
            <h3>SST net</h3>
            <p className="metric-value">{money(Math.abs(tax?.netPayable ?? 0))}</p>
            <span className="muted">
              {(tax?.netPayable ?? 0) >= 0 ? "Payable" : "Refund"} · input {money(tax?.inputTax ?? 0)}
            </span>
          </div>
        </section>
      )}

      {docs && (
        <section className="card">
          <h2>Documents by category</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(docs.byCategory).map(([cat, count]) => (
                <tr key={cat}>
                  <td>{categoryLabel(cat)}</td>
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 style={{ marginTop: 16 }}>Pipeline</h3>
          <ul>
            {Object.entries(docs.byStatus).map(([status, count]) => (
              <li key={status}>
                {statusLabel(status)}: {count}
              </li>
            ))}
          </ul>
        </section>
      )}

      {balance && (
        <section className="card">
          <h2>Trial balance</h2>
          {balance.rows.length === 0 ? (
            <EmptyState
              title="Nothing posted yet"
              hint="Approve AI proposals or post manual journals to build the ledger."
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Account</th>
                    <th>Debit</th>
                    <th>Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {balance.rows.map((row) => (
                    <tr key={row.code}>
                      <td>{row.code}</td>
                      <td>{row.name}</td>
                      <td>{row.debit ? money(row.debit) : ""}</td>
                      <td>{row.credit ? money(row.credit) : ""}</td>
                    </tr>
                  ))}
                  <tr>
                    <td />
                    <td>
                      <strong>Total</strong>
                    </td>
                    <td>
                      <strong>{money(balance.totalDebit)}</strong>
                    </td>
                    <td>
                      <strong>{money(balance.totalCredit)}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="card links">
        <Link href={"/accountant/tidy" as Route}>AI tidy documents →</Link>
        <Link href={"/tax" as Route}>Tax AI · count, reduce, audit →</Link>
        <Link href={"/month-end" as Route}>Month-end close →</Link>
        <Link href={"/accountant/audit" as Route}>Audit trail &amp; exceptions →</Link>
      </section>
    </main>
  );
}

export default function BooksBalancePage() {
  return (
    <Suspense
      fallback={
        <main className="container">
          <p className="muted">Loading books…</p>
        </main>
      }
    >
      <BooksBalanceInner />
    </Suspense>
  );
}
