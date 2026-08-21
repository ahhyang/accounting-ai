"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("client@demo.my");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false
    });
    setLoading(false);
    if (res?.error) {
      setError("Login failed. Check email/password.");
      return;
    }
    // Route by role after login
    const me = await fetch("/api/auth/session").then((r) => r.json());
    if (me?.user?.portal === "client") router.push("/client");
    else router.push("/accountant");
  }

  return (
    <main className="container grid" style={{ maxWidth: 480, marginTop: 48 }}>
      <section className="card">
        <h1>Sign in</h1>
        <p className="muted">Client Portal or Accountant Workspace</p>
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
        <div className="muted" style={{ marginTop: 16, fontSize: 13 }}>
          <p>Demo accounts:</p>
          <p>Client: client@demo.my / demo1234</p>
          <p>Accountant: accountant@demo.my / demo1234</p>
        </div>
      </section>
    </main>
  );
}
