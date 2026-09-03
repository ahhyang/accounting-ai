"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

type Period = { id: string; startDate: string; endDate: string; isClosed: boolean };
type Overview = {
  kpis: {
    monthEndCompletion: number;
    periodClosed: boolean;
    outstandingAR: number;
    outstandingAP: number;
    documentsInReview: number;
  };
  period: Period | null;
};

export default function ManagerPortalPage() {
  const { data: session } = useSession();
  const companyId = session?.user?.companyId ?? "";
  const [overview, setOverview] = useState<Overview | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!companyId) return;
    const [firm, per] = await Promise.all([
      fetch(`/api/companies/${companyId}/firm`).then((r) => r.json()),
      fetch(`/api/companies/${companyId}/periods`).then((r) => r.json())
    ]);
    if (firm.ok) setOverview(firm);
    if (per.ok) setPeriods(per.periods);
  }

  useEffect(() => {
    load();
  }, [companyId]);

  async function closePeriod(periodId: string, force = false) {
    setLoading(true);
    setError("");
    setMessage("");
    const res = await fetch(`/api/companies/${companyId}/periods`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId, action: "close", force })
    });
    const data = await res.json();
    setLoading(false);
    if (!data.ok) {
      setError(String(data.error));
      return;
    }
    setMessage(`Period closed. Month-end score ${data.completionScore}%.`);
    await load();
  }

  async function reopenPeriod(periodId: string) {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/companies/${companyId}/periods`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId, action: "reopen" })
    });
    const data = await res.json();
    setLoading(false);
    if (!data.ok) {
      setError(String(data.error));
      return;
    }
    setMessage("Period reopened.");
    await load();
  }

  return (
    <main className="container grid">
      <section className="card">
        <h1>Manager workspace</h1>
        <p className="muted">
          Finance manager / engagement manager — review month-end, sign off trial balance, and
          close the period so no further journals can post.
        </p>
        <p className="muted">{session?.user?.companyName}</p>
      </section>

      {overview && (
        <section className="grid metrics">
          <div className="card">
            <h3>Month-end</h3>
            <p>{overview.kpis.monthEndCompletion}%</p>
          </div>
          <div className="card">
            <h3>Period</h3>
            <p>{overview.kpis.periodClosed ? "Closed" : "Open"}</p>
          </div>
          <div className="card">
            <h3>AR outstanding</h3>
            <p>RM{overview.kpis.outstandingAR.toFixed(2)}</p>
          </div>
          <div className="card">
            <h3>AP outstanding</h3>
            <p>RM{overview.kpis.outstandingAP.toFixed(2)}</p>
          </div>
        </section>
      )}

      <section className="card">
        <h2>Close / reopen periods</h2>
        <p className="muted">Requires 100% month-end checklist and a balanced trial balance.</p>
        <table className="table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.id}>
                <td>
                  {new Date(p.startDate).toLocaleDateString()} –{" "}
                  {new Date(p.endDate).toLocaleDateString()}
                </td>
                <td>{p.isClosed ? "Closed" : "Open"}</td>
                <td>
                  {!p.isClosed ? (
                    <button
                      type="button"
                      className="btn small"
                      disabled={loading}
                      onClick={() => closePeriod(p.id)}
                    >
                      Close period
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn small secondary"
                      disabled={loading}
                      onClick={() => reopenPeriod(p.id)}
                    >
                      Reopen
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {message && <p className="message">{message}</p>}
      {error && <p className="message error">{error}</p>}

      <section className="card links">
        <Link href={`/month-end?companyId=${companyId}`}>Month-end checklist →</Link>
        <Link href="/accountant/inbox">Accountant inbox →</Link>
        <Link href="/tax">Tax pack →</Link>
      </section>
    </main>
  );
}
