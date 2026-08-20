"use client";

import { useState } from "react";

type BankAccount = { id: string; name: string; bankName: string | null };
type Txn = {
  id: string;
  txnDate: string;
  amount: number | string;
  type: string;
  description: string | null;
  matchStatus: string;
};

export default function BankingPage() {
  const [companyId, setCompanyId] = useState("");
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [transactions, setTransactions] = useState<Txn[]>([]);
  const [summary, setSummary] = useState<{ matched: number; suggested: number; unmatched: number; total: number } | null>(null);
  const [matchMessage, setMatchMessage] = useState("");
  const [importText, setImportText] = useState(
    JSON.stringify(
      [
        { txnDate: "2026-08-18", amount: 1000, description: "Customer receipt" },
        { txnDate: "2026-08-19", amount: -500, description: "Supplier payment" },
        { txnDate: "2026-08-19", amount: -42.5, description: "Unknown fee" }
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
      if (data.accounts[0] && !bankAccountId) setBankAccountId(data.accounts[0].id);
    }
  }

  async function loadSummary() {
    if (!companyId || !bankAccountId) return;
    const res = await fetch(`/api/companies/${companyId}/banking?bankAccountId=${bankAccountId}`);
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

  async function importAndMatch() {
    if (!companyId || !bankAccountId) return;
    try {
      const transactionsPayload = JSON.parse(importText);
      const res = await fetch(`/api/companies/${companyId}/banking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankAccountId,
          transactions: transactionsPayload
        })
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

  return (
    <main className="container grid">
      <section className="card">
        <h1>Banking & Reconciliation</h1>
        <p className="muted">Import bank lines and auto-match to invoices, bills, receipts, and payments.</p>
        <div className="row">
          <input placeholder="Company ID" value={companyId} onChange={(e) => setCompanyId(e.target.value)} />
          <button type="button" className="btn" onClick={loadAccounts}>Load Accounts</button>
        </div>
        {accounts.length > 0 && (
          <div className="row" style={{ marginTop: 12 }}>
            <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}{a.bankName ? ` (${a.bankName})` : ""}</option>
              ))}
            </select>
            <button type="button" className="btn secondary" onClick={loadSummary}>Refresh</button>
          </div>
        )}
        {matchMessage && <p className="message">{matchMessage}</p>}
      </section>

      {summary && (
        <section className="grid metrics">
          <div className="card"><h3>Total</h3><p>{summary.total}</p></div>
          <div className="card"><h3>Matched</h3><p>{summary.matched}</p></div>
          <div className="card"><h3>Suggested</h3><p>{summary.suggested}</p></div>
          <div className="card"><h3>Unmatched</h3><p>{summary.unmatched}</p></div>
        </section>
      )}

      <section className="card">
        <h2>Import Transactions (JSON)</h2>
        <p className="muted">Positive = deposit, negative = withdrawal. Matching runs automatically after import.</p>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={10}
          style={{ width: "100%", background: "#0b1020", color: "#eef2ff", border: "1px solid #273159", borderRadius: 8, padding: 12 }}
        />
        <div className="row">
          <button type="button" className="btn" onClick={importAndMatch}>Import & Auto-Match</button>
          <button type="button" className="btn secondary" onClick={rematch}>Re-run Matching</button>
        </div>
      </section>

      {transactions.length > 0 && (
        <section className="card">
          <h2>Transactions</h2>
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Type</th><th>Amount</th><th>Description</th><th>Status</th></tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.txnDate).toISOString().slice(0, 10)}</td>
                  <td>{t.type}</td>
                  <td>RM{Number(t.amount).toFixed(2)}</td>
                  <td>{t.description ?? "-"}</td>
                  <td>{t.matchStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
