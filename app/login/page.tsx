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

  return (
    <main className="container grid" style={{ maxWidth: 640, marginTop: 48 }}>
      <section className="card">
        <h1>Sign in</h1>
        <p className="muted">
          Malaysian firm roles: Client → Accountant → Tax → Audit → Manager → Boss
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
        <h2>Demo logins</h2>
        <p className="muted">Password for all: demo1234</p>
        <div className="grid" style={{ gap: 10 }}>
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.email}
              type="button"
              className="btn secondary"
              style={{ textAlign: "left" }}
              disabled={loading}
              onClick={() => loginAs(acc.email, acc.password)}
            >
              <strong>{acc.label}</strong> — {acc.email}
              <br />
              <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>
                {acc.blurb}
              </span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
