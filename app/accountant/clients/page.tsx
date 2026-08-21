"use client";

import { useEffect, useState } from "react";

export default function AccountantClientsPage() {
  const [companies, setCompanies] = useState<
    Array<{ id: string; name: string; members: Array<{ email: string; name: string; role: string }> }>
  >([]);
  const [form, setForm] = useState({
    companyId: "",
    email: "",
    name: "",
    password: "demo1234"
  });
  const [message, setMessage] = useState("");

  async function load() {
    const data = await fetch("/api/accountant/clients").then((r) => r.json());
    if (data.ok) {
      setCompanies(data.companies);
      if (!form.companyId && data.companies[0]) {
        setForm((f) => ({ ...f, companyId: data.companies[0].id }));
      }
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/accountant/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const data = await res.json();
    setMessage(data.ok ? `Invited ${data.user.email}` : String(data.error));
    await load();
  }

  return (
    <main className="container grid">
      <section className="card">
        <h1>Clients</h1>
        <p className="muted">Invite SME owners to the Client Portal.</p>
      </section>

      <section className="card">
        <h2>Invite client user</h2>
        <form className="form grid" onSubmit={invite}>
          <label>
            Company
            <select
              value={form.companyId}
              onChange={(e) => setForm({ ...form, companyId: e.target.value })}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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
            Email
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Temp password
            <input
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <button className="btn" type="submit">
            Invite
          </button>
        </form>
        {message && <p className="message">{message}</p>}
      </section>

      {companies.map((c) => (
        <section key={c.id} className="card">
          <h2>{c.name}</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {c.members.map((m) => (
                <tr key={m.email}>
                  <td>{m.name}</td>
                  <td>{m.email}</td>
                  <td>{m.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </main>
  );
}
