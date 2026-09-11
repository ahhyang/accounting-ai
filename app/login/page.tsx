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
      setError("Login failed. Seed demo users with npm run db:seed:portal, then try again.");
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
    <main className="container grid login-shell">
      <section className="card">
        <div className="page-header">
          <h1>Sign in</h1>
          <p className="muted">
            Pick a demo role or enter credentials. Flow: Client → Accountant → Tax → Audit → Manager
            → Boss.
          </p>
        </div>
        <form className="form grid" onSubmit={onSubmit} style={{ marginTop: 16 }}>
          <label>
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {error && <p className="message error">{error}</p>}
      </section>

      <section className="card">
        <h2>Demo accounts</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Password: <strong>demo1234</strong>
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Email</th>
                <th>Focus</th>
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
                    <code className="mono">{acc.email}</code>
                  </td>
                  <td className="muted">{acc.blurb}</td>
                  <td>
                    <div className="btn-row">
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
        </div>
      </section>
    </main>
  );
}
