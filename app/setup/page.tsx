"use client";

import { useState } from "react";

type Company = {
  id: string;
  name: string;
  registrationNumber: string | null;
  industry: string | null;
};

export default function SetupPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    registrationNumber: "",
    businessType: "Sdn Bhd",
    industry: "",
    ownerEmail: "",
    ownerName: ""
  });

  async function loadCompanies() {
    const res = await fetch("/api/companies");
    const data = await res.json();
    if (data.ok) setCompanies(data.companies);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const data = await res.json();

    if (data.ok) {
      setMessage(`Company "${data.company.name}" created with default COA, roles, and month-end checklist.`);
      setForm({
        name: "",
        registrationNumber: "",
        businessType: "Sdn Bhd",
        industry: "",
        ownerEmail: "",
        ownerName: ""
      });
      await loadCompanies();
    } else {
      setMessage(data.error ?? "Failed to create company.");
    }

    setLoading(false);
  }

  return (
    <main className="container grid">
      <section className="card">
        <h1>Company Setup</h1>
        <p className="muted">
          Create a company with profile, default chart of accounts, system roles, and accounting period.
        </p>
        <button type="button" className="btn secondary" onClick={loadCompanies}>
          Load Companies
        </button>
      </section>

      <section className="card">
        <h2>New Company</h2>
        <form className="form grid" onSubmit={handleSubmit}>
          <label>
            Company name
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Registration number
            <input
              value={form.registrationNumber}
              onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
            />
          </label>
          <label>
            Business type
            <input
              value={form.businessType}
              onChange={(e) => setForm({ ...form, businessType: e.target.value })}
            />
          </label>
          <label>
            Industry
            <input
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
            />
          </label>
          <label>
            Owner name
            <input
              required
              value={form.ownerName}
              onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
            />
          </label>
          <label>
            Owner email
            <input
              required
              type="email"
              value={form.ownerEmail}
              onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
            />
          </label>
          <button type="submit" className="btn" disabled={loading}>
            {loading ? "Creating..." : "Create Company"}
          </button>
        </form>
        {message && <p className="message">{message}</p>}
      </section>

      {companies.length > 0 && (
        <section className="card">
          <h2>Companies</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Registration</th>
                <th>Industry</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.registrationNumber ?? "-"}</td>
                  <td>{c.industry ?? "-"}</td>
                  <td className="mono">{c.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
