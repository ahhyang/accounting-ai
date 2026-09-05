"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { DEMO_ACCOUNTS, portalHomePath, type AppPortal } from "@/lib/permissions/constants";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("client@demo.my");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loginAs(loginEmail: string, loginPassword: string) {
    setLoading(true);
    setError("");
    setEmail(loginEmail);
    setPassword(loginPassword);
    const res = await signIn("credentials", {
      email: loginEmail,
      password: loginPassword,
      redirect: false
    });
    setLoading(false);
    if (res?.error) {
      setError("Login failed. Run npm run db:seed:portal if demo users are missing.");
      return;
    }
    const me = await fetch("/api/auth/session").then((r) => r.json());
    const portal = (me?.user?.portal as AppPortal) ?? "accountant";
    router.push(portalHomePath(portal) as Route);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await loginAs(email, password);
  }

  function fillAccount(loginEmail: string, loginPassword: string) {
    setEmail(loginEmail);
    setPassword(loginPassword);
    setError("");
  }

  return (
    <main className="container grid" style={{ maxWidth: 720, marginTop: 48 }}>
      <section className="card">
        <h1>Sign in</h1>
        <p className="muted">
          Demo firm roles: Client → Accountant → Tax → Audit → Manager → Boss
        </p>
        <form className="form grid" onSubmit={onSubmit}>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        {error && <p className="message error">{error}</p>}
      </section>

      <section className="card">
        <h2>Demo accounts</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Password for every account: <strong style={{ color: "#eef2ff" }}>demo1234</strong>
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Email</th>
              <th>What they do</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {DEMO_ACCOUNTS.map((acc) => (
              <tr key={acc.email}>
                <td>
                  <strong>{acc.label}</strong>
                </td>
                <td>
                  <code style={{ fontSize: 13 }}>{acc.email}</code>
                </td>
                <td className="muted" style={{ fontSize: 13 }}>
                  {acc.blurb}
                </td>
                <td>
                  <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <button
                      type="button"
                      className="btn small secondary"
                      disabled={loading}
                      onClick={() => fillAccount(acc.email, acc.password)}
                    >
                      Fill
                    </button>
                    <button
                      type="button"
                      className="btn small"
                      disabled={loading}
                      onClick={() => loginAs(acc.email, acc.password)}
                    >
                      Login
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="muted" style={{ marginTop: 16, fontSize: 13, lineHeight: 1.7 }}>
          {DEMO_ACCOUNTS.map((acc) => (
            <li key={`list-${acc.email}`}>
              <strong>{acc.label}:</strong> {acc.email} / demo1234
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
