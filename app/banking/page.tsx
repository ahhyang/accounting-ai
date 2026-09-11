"use client";

import { Suspense, useEffect, useState } from "react";
import { EmptyState } from "@/app/components/EmptyState";
import { useCompanyId } from "@/app/components/useCompanyId";
import { statusLabel } from "@/lib/ux/labels";

type BankAccount = { id: string; name: string; bankName: string | null };
type Txn = {
  id: string;
  txnDate: string;
  amount: number | string;
  type: string;
  description: string | null;
  matchStatus: string;
};

function BankingPageInner() {
  const { companyId, companyName, ready, loadingSession } = useCompanyId();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [transactions, setTransactions] = useState<Txn[]>([]);
  const [summary, setSummary] = useState<{
    matched: number;
    suggested: number;
    unmatched: number;
    total: number;
  } | null>(null);
  const [matchMessage, setMatchMessage] = useState("");
  const [importText, setImportText] = useState(
    JSON.stringify(
      [
        { txnDate: new Date().toISOString().slice(0, 10), amount: 1000, description: "Customer receipt" },
        { txnDate: new Date().toISOString().slice(0, 10), amount: -500, description: "Supplier payment" }
      ],
      null,
      2
    )
  );

  async function loadAccounts() {
    if (!companyId) return;
    const res = await fetch(`/api/companies/${companyId}/banking`);
    const data = await res.json();
    if (data.ok) {
      setAccounts(data.accounts);
      if (data.accounts[0]) setBankAccountId((prev) => prev || data.accounts[0].id);
    }
  }

  async function loadSummary(accountId = bankAccountId) {
    if (!companyId || !accountId) return;
    const res = await fetch(`/api/companies/${companyId}/banking?bankAccountId=${accountId}`);
    const data = await res.json();
    if (data.ok) {
      setSummary({
        matched: data.matched,
        suggested: data.suggested,
        unmatched: data.unmatched,
        total: data.total
      });
      setTransactions(data.account.transactions);
    }
  }

  useEffect(() => {
    if (ready) void loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, companyId]);

  useEffect(() => {
    if (bankAccountId) void loadSummary(bankAccountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankAccountId]);

  async function importAndMatch() {
    if (!companyId || !bankAccountId) return;
    try {
      const transactionsPayload = JSON.parse(importText);
      const res = await fetch(`/api/companies/${companyId}/banking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankAccountId, transactions: transactionsPayload })
      });
      const data = await res.json();
      if (data.ok) {
        setMatchMessage(data.match.summary);
        await loadSummary();
      } else {
        setMatchMessage(String(data.error));
      }
    } catch {
      setMatchMessage("Invalid JSON for import.");
    }
  }

  async function rematch() {
    if (!companyId || !bankAccountId) return;
    const res = await fetch(`/api/companies/${companyId}/banking`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "match", bankAccountId })
    });
    const data = await res.json();
    if (data.ok) {
      setMatchMessage(data.summary);
      await loadSummary();
    } else {
      setMatchMessage(String(data.error));
    }
  }

  if (loadingSession) {
    return (
      <main className="container">
        <p className="muted">Loading company…</p>
      </main>
    );
  }

  if (!companyId) {
    return (
      <main className="container">
        <EmptyState title="Sign in required" hint="Log in to open Banking for your company." />
      </main>
    );
  }

  return (
    <main className="container grid">
      <section className="card">
        <h1>Banking & reconciliation</h1>
        <p className="muted">
          {companyName || "Your company"} — import bank lines and auto-match to invoices / bills.
        </p>
        {accounts.length === 0 ? (
          <EmptyState title="No bank accounts" hint="Set up a company bank account first." />
        ) : (
          <div className="row">
            <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.bankName ? ` (${a.bankName})` : ""}
                </option>
              ))}
            </select>
            <button type="button" className="btn secondary" onClick={() => loadSummary()}>
              Refresh
            </button>
          </div>
        )}
        {matchMessage && <p className="message">{matchMessage}</p>}
      </section>

      {summary && (
        <section className="grid metrics">
          <div className="card">
            <h3>Total</h3>
            <p>{summary.total}</p>
          </div>
          <div className="card">
            <h3>Matched</h3>
            <p>{summary.matched}</p>
          </div>
          <div className="card">
            <h3>Suggested</h3>
            <p>{summary.suggested}</p>
          </div>
          <div className="card">
            <h3>Unmatched</h3>
            <p>{summary.unmatched}</p>
          </div>
        </section>
      )}

      <section className="card">
        <h2>Import transactions</h2>
        <p className="muted">Positive = deposit, negative = withdrawal. Matching runs after import.</p>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={8}
          className="mono"
        />
        <div className="row">
          <button type="button" className="btn" onClick={importAndMatch}>
            Import & auto-match
          </button>
          <button type="button" className="btn secondary" onClick={rematch}>
            Re-run matching
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Transactions</h2>
        {transactions.length === 0 ? (
          <EmptyState title="No transactions yet" hint="Import bank lines above." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Description</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.txnDate).toISOString().slice(0, 10)}</td>
                  <td>{t.type}</td>
                  <td>RM{Number(t.amount).toFixed(2)}</td>
                  <td>{t.description ?? "—"}</td>
                  <td>{statusLabel(t.matchStatus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

export default function BankingPage() {
  return (
    <Suspense
      fallback={
        <main className="container">
          <p>Loading banking…</p>
        </main>
      }
    >
      <BankingPageInner />
    </Suspense>
  );
}
