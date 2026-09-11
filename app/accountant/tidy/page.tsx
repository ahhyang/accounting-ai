"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";

type TidyDoc = {
  id: string;
  originalFileName: string | null;
  newFileName: string;
  category: string;
  previousCategory: string;
  merchant: string;
  date: string | null;
  total: number | null;
  confidence: number;
  renamed: boolean;
  recategorized: boolean;
};

type TidySummary = {
  documentCount: number;
  renamedCount: number;
  recategorizedCount: number;
  counts: Record<string, number>;
  totalsByCategory: Record<string, number>;
  postedCount: number;
  readyToApprove: number;
  trialBalance?: {
    balanced: boolean;
    totalDebit: number;
    totalCredit: number;
  };
};

export default function AccountantTidyPage() {
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [companyId, setCompanyId] = useState("");
  const [reRunAi, setReRunAi] = useState(true);
  const [autoPostReady, setAutoPostReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<TidySummary | null>(null);
  const [documents, setDocuments] = useState<TidyDoc[]>([]);

  useEffect(() => {
    fetch("/api/accountant/clients")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) return;
        const list = (data.companies as Array<{ id: string; name: string }>) ?? [];
        setCompanies(list);
        if (list[0]) setCompanyId(list[0].id);
      });
  }, []);

  async function runTidy(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    setBusy(true);
    setError("");
    setSummary(null);
    setDocuments([]);

    try {
      const res = await fetch("/api/accountant/tidy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, reRunAi, autoPostReady })
      });
      const data = await res.json();
      if (!data.ok) {
        setError(String(data.error || "Tidy failed"));
        return;
      }
      setSummary(data.summary);
      setDocuments(data.documents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tidy failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container grid">
      <section className="card">
        <h1>AI tidy documents</h1>
        <p className="muted">
          After the client uploads all bills and receipts: classify by category, rename to a standard
          format, count totals, then prepare / post bookkeeping.
        </p>
        <p className="muted">
          Name format: <code>YYYY-MM-DD_Merchant_RM28.50_PURCHASE.jpg</code>
        </p>
      </section>

      <section className="card">
        <form className="form grid" onSubmit={runTidy}>
          <label>
            Client company
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} required>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={reRunAi}
              onChange={(e) => setReRunAi(e.target.checked)}
            />
            Re-run AI extraction on documents
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={autoPostReady}
              onChange={(e) => setAutoPostReady(e.target.checked)}
            />
            Auto-post high-confidence proposals (≥85%) — otherwise leave in inbox for review
          </label>
          <button className="btn" type="submit" disabled={busy || !companyId}>
            {busy ? "Tidying…" : "Run AI tidy & count"}
          </button>
        </form>
        {error && <p className="message error">{error}</p>}
      </section>

      {summary && (
        <section className="card">
          <h2>Summary</h2>
          <div className="grid metrics">
            <div>
              <h3>Documents</h3>
              <p>{summary.documentCount}</p>
            </div>
            <div>
              <h3>Renamed</h3>
              <p>{summary.renamedCount}</p>
            </div>
            <div>
              <h3>Recategorized</h3>
              <p>{summary.recategorizedCount}</p>
            </div>
            <div>
              <h3>Posted</h3>
              <p>{summary.postedCount}</p>
            </div>
            <div>
              <h3>Ready to approve</h3>
              <p>{summary.readyToApprove}</p>
            </div>
          </div>
          <h3>Count by category</h3>
          <ul>
            {Object.entries(summary.counts).map(([cat, n]) => (
              <li key={cat}>
                {cat}: {n}
                {summary.totalsByCategory[cat] != null
                  ? ` · RM ${summary.totalsByCategory[cat].toFixed(2)}`
                  : ""}
              </li>
            ))}
          </ul>
          {summary.trialBalance && (
            <p className={summary.trialBalance.balanced ? "message success" : "message error"}>
              Trial balance: Dr RM{summary.trialBalance.totalDebit.toFixed(2)} · Cr RM
              {summary.trialBalance.totalCredit.toFixed(2)} ·{" "}
              {summary.trialBalance.balanced ? "Balanced ✓" : "Not balanced ✗"}
            </p>
          )}
          <p>
            <Link href={"/accountant/inbox" as Route}>Open inbox to review / post →</Link>
            {" · "}
            <Link href={"/accountant/books" as Route}>Books &amp; balance →</Link>
          </p>
        </section>
      )}

      {documents.length > 0 && (
        <section className="card">
          <h2>Renamed files</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Was</th>
                  <th>Now</th>
                  <th>Merchant</th>
                  <th>Amount</th>
                  <th>AI %</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id}>
                    <td>
                      {d.category}
                      {d.recategorized ? (
                        <span className="muted"> (from {d.previousCategory})</span>
                      ) : null}
                    </td>
                    <td className="muted">{d.originalFileName ?? "—"}</td>
                    <td>{d.newFileName}</td>
                    <td>{d.merchant}</td>
                    <td>{d.total != null ? `RM ${d.total.toFixed(2)}` : "—"}</td>
                    <td>{d.confidence}</td>
                    <td>
                      <Link href={`/accountant/review/${d.id}`}>Review</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
