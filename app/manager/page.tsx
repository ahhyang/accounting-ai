"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import type { Route } from "next";
import { useCompanyId } from "@/app/components/useCompanyId";

type ClientRow = {
  companyId: string;
  name: string;
  engagement: {
    status: string;
    billingStatus: string;
    amountDue: number | null;
    invoiceNumber: string | null;
    dueDate: string | null;
    notes: string | null;
  };
  progress: {
    periodLabel: string;
    periodClosed: boolean;
    documentsTotal: number;
    documentsPosted: number;
    documentsPending: number;
    monthEndCompletion: number;
    tbBalanced: boolean;
  };
};

type Period = { id: string; startDate: string; endDate: string; isClosed: boolean };

const money = (n: number | null | undefined) => (n == null ? "—" : `RM ${Number(n).toFixed(2)}`);

type EditState = { billingStatus: string; engagementStatus: string; amountDue: string };

function ManagerInner() {
  const { data: session } = useSession();
  const { companyId: queryCompanyId } = useCompanyId();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [selected, setSelected] = useState("");
  const [periods, setPeriods] = useState<Period[]>([]);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadPortfolio = useCallback(async () => {
    setError("");
    const res = await fetch("/api/firm/portfolio");
    const json = await res.json();
    if (!json.ok) {
      setError(String(json.error || "Failed to load clients"));
      return;
    }
    const rows = (json.clients ?? []) as ClientRow[];
    setClients(rows);
    setEdits((prev) => {
      const next = { ...prev };
      for (const c of rows) {
        if (!next[c.companyId]) {
          next[c.companyId] = {
            billingStatus: c.engagement.billingStatus,
            engagementStatus: c.engagement.status,
            amountDue: c.engagement.amountDue != null ? String(c.engagement.amountDue) : ""
          };
        }
      }
      return next;
    });
    if (!selected && rows[0]) setSelected(queryCompanyId || rows[0].companyId);
  }, [selected, queryCompanyId]);

  const loadPeriods = useCallback(async (cid: string) => {
    if (!cid) return;
    const res = await fetch(`/api/companies/${cid}/periods`);
    const json = await res.json();
    if (json.ok) setPeriods(json.periods ?? []);
  }, []);

  useEffect(() => {
    void loadPortfolio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selected) void loadPeriods(selected);
  }, [selected, loadPeriods]);

  async function saveBilling(companyId: string) {
    const edit = edits[companyId];
    if (!edit) return;
    setBusy(true);
    setMessage("");
    setError("");
    const res = await fetch(`/api/companies/${companyId}/engagement`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        billingStatus: edit.billingStatus,
        engagementStatus: edit.engagementStatus,
        amountDue: edit.amountDue === "" ? null : Number(edit.amountDue)
      })
    });
    const json = await res.json();
    setBusy(false);
    if (!json.ok) {
      setError(String(json.error || "Update failed"));
      return;
    }
    setMessage("Billing updated.");
    await loadPortfolio();
  }

  async function periodAction(periodId: string, action: "close" | "reopen", force = false) {
    if (!selected) return;
    setBusy(true);
    setError("");
    setMessage("");
    const res = await fetch(`/api/companies/${selected}/periods`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId, action, force })
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setError(String(data.error));
      return;
    }
    setMessage(action === "close" ? `Period closed (${data.completionScore}% checklist).` : "Period reopened.");
    await loadPeriods(selected);
    await loadPortfolio();
  }

  return (
    <main className="container grid">
      <section className="card">
        <h1>Manager workspace</h1>
        <p className="muted">
          Engagement manager — track every client&apos;s progress and billing, and sign off
          month-end. Only close a period with a 100% checklist and a balanced trial balance.
        </p>
        <p className="muted">{session?.user?.companyName}</p>
      </section>

      {error && <p className="message error">{error}</p>}
      {message && <p className="message success">{message}</p>}

      <section className="card">
        <h2>Clients, progress &amp; billing</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Period</th>
                <th>Progress</th>
                <th>Engagement</th>
                <th>Billing</th>
                <th>Amount due</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const edit = edits[c.companyId] ?? {
                  billingStatus: c.engagement.billingStatus,
                  engagementStatus: c.engagement.status,
                  amountDue: ""
                };
                return (
                  <tr key={c.companyId}>
                    <td>
                      <strong>{c.name}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {c.progress.documentsPosted}/{c.progress.documentsTotal} docs ·{" "}
                        {c.progress.monthEndCompletion}% month-end
                      </div>
                    </td>
                    <td>
                      {c.progress.periodLabel}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {c.progress.periodClosed ? "closed" : "open"} ·{" "}
                        {c.progress.tbBalanced ? "balanced" : "not balanced"}
                      </div>
                    </td>
                    <td>
                      <div className="progress" style={{ minWidth: 80 }}>
                        <div
                          className="progress-bar"
                          style={{ width: `${c.progress.monthEndCompletion}%` }}
                        />
                      </div>
                    </td>
                    <td>
                      <select
                        value={edit.engagementStatus}
                        onChange={(e) =>
                          setEdits((p) => ({
                            ...p,
                            [c.companyId]: { ...edit, engagementStatus: e.target.value }
                          }))
                        }
                      >
                        {["ONBOARDING", "ACTIVE", "ON_HOLD", "COMPLETED"].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={edit.billingStatus}
                        onChange={(e) =>
                          setEdits((p) => ({
                            ...p,
                            [c.companyId]: { ...edit, billingStatus: e.target.value }
                          }))
                        }
                      >
                        {["NOT_BILLED", "INVOICED", "PAID", "OVERDUE"].map((s) => (
                          <option key={s} value={s}>
                            {s.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        style={{ width: 100 }}
                        value={edit.amountDue}
                        onChange={(e) =>
                          setEdits((p) => ({
                            ...p,
                            [c.companyId]: { ...edit, amountDue: e.target.value }
                          }))
                        }
                      />
                    </td>
                    <td>
                      <div className="btn-row">
                        <button
                          type="button"
                          className="btn small"
                          disabled={busy}
                          onClick={() => saveBilling(c.companyId)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn small secondary"
                          onClick={() => setSelected(c.companyId)}
                        >
                          Periods
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    No clients found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>
          Close / reopen periods
          {selected ? ` · ${clients.find((c) => c.companyId === selected)?.name ?? ""}` : ""}
        </h2>
        <div className="row">
          <label>
            Client
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              {clients.map((c) => (
                <option key={c.companyId} value={c.companyId}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
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
                      disabled={busy}
                      onClick={() => periodAction(p.id, "close")}
                    >
                      Close period
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn small secondary"
                      disabled={busy}
                      onClick={() => periodAction(p.id, "reopen")}
                    >
                      Reopen
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {periods.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No periods.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="muted">Total outstanding fees: {money(null)} — see client billing above.</p>
      </section>

      <section className="card links">
        <Link href={"/boss" as Route}>Boss control room →</Link>
        <Link href={`/month-end?companyId=${selected}` as Route}>Month-end checklist →</Link>
        <Link href={"/accountant/inbox" as Route}>Accountant inbox →</Link>
        <Link href={"/tax" as Route}>Tax pack →</Link>
      </section>
    </main>
  );
}

export default function ManagerPortalPage() {
  return (
    <Suspense
      fallback={
        <main className="container">
          <p className="muted">Loading manager workspace…</p>
        </main>
      }
    >
      <ManagerInner />
    </Suspense>
  );
}
