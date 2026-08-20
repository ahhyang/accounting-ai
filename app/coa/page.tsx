"use client";

import { useState } from "react";

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  parentCode: string | null;
  allowPosting: boolean;
};

export default function CoaPage() {
  const [companyId, setCompanyId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    code: "",
    name: "",
    type: "EXPENSE",
    parentCode: ""
  });

  async function loadAccounts() {
    if (!companyId) {
      setMessage("Enter a company ID first.");
      return;
    }

    const res = await fetch(`/api/companies/${companyId}/accounts`);
    const data = await res.json();
    if (data.ok) {
      setAccounts(data.accounts);
      setMessage(`Loaded ${data.accounts.length} accounts.`);
    } else {
      setMessage(data.error ?? "Failed to load accounts.");
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;

    const res = await fetch(`/api/companies/${companyId}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        parentCode: form.parentCode || undefined
      })
    });
    const data = await res.json();

    if (data.ok) {
      setMessage(`Account ${data.account.code} created.`);
      setForm({ code: "", name: "", type: "EXPENSE", parentCode: "" });
      await loadAccounts();
    } else {
      setMessage(typeof data.error === "string" ? data.error : "Failed to create account.");
    }
  }

  return (
    <main className="container grid">
      <section className="card">
        <h1>Chart of Accounts</h1>
        <p className="muted">View and customize the company chart of accounts.</p>
        <div className="row">
          <input
            placeholder="Company ID"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          />
          <button type="button" className="btn" onClick={loadAccounts}>
            Load COA
          </button>
        </div>
        {message && <p className="message">{message}</p>}
      </section>

      <section className="card">
        <h2>Add Account</h2>
        <form className="form grid" onSubmit={handleAdd}>
          <label>
            Code
            <input
              required
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </label>
          <label>
            Name
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="ASSET">Asset</option>
              <option value="LIABILITY">Liability</option>
              <option value="EQUITY">Equity</option>
              <option value="REVENUE">Revenue</option>
              <option value="EXPENSE">Expense</option>
            </select>
          </label>
          <label>
            Parent code (optional)
            <input
              value={form.parentCode}
              onChange={(e) => setForm({ ...form, parentCode: e.target.value })}
            />
          </label>
          <button type="submit" className="btn">Add Account</button>
        </form>
      </section>

      {accounts.length > 0 && (
        <section className="card">
          <h2>Accounts ({accounts.length})</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Parent</th>
                <th>Posting</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.code}</td>
                  <td>{a.name}</td>
                  <td>{a.type}</td>
                  <td>{a.parentCode ?? "-"}</td>
                  <td>{a.allowPosting ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
