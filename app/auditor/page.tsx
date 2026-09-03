"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

type AuditView = {
  trialBalance: {
    rows: Array<{ code: string; name: string; debit: number; credit: number }>;
    totalDebit: number;
    totalCredit: number;
    balanced: boolean;
  };
  exceptions: {
    duplicateBills: number;
    waitingOnClient: number;
    lowConfidenceDocs: Array<{ id: string; fileName: string | null; aiConfidence: number | string | null }>;
  };
  auditTrail: Array<{ id: string; action: string; entityType: string; createdAt: string }>;
};

export default function AuditorPortalPage() {
  const { data: session } = useSession();
  const companyId = session?.user?.companyId ?? "";
  const [data, setData] = useState<AuditView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/companies/${companyId}/firm?view=audit`)
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) setData(json);
        else setError(String(json.error));
      });
  }, [companyId]);

  return (
    <main className="container grid">
      <section className="card">
        <h1>Audit workspace</h1>
        <p className="muted">
          Read-only audit readiness — trial balance, exceptions, and activity trail.
          No posting rights (Malaysian licensed auditor / engagement reviewer view).
        </p>
        <p className="muted">{session?.user?.companyName}</p>
      </section>

      {error && <p className="message error">{error}</p>}

      {data && (
        <>
          <section className="grid metrics">
            <div className="card">
              <h3>TB balanced</h3>
              <p>{data.trialBalance.balanced ? "Yes" : "No"}</p>
            </div>
            <div className="card">
              <h3>Duplicate bills</h3>
              <p>{data.exceptions.duplicateBills}</p>
            </div>
            <div className="card">
              <h3>Waiting on client</h3>
              <p>{data.exceptions.waitingOnClient}</p>
            </div>
            <div className="card">
              <h3>Low-confidence docs</h3>
              <p>{data.exceptions.lowConfidenceDocs.length}</p>
            </div>
          </section>

          <section className="card">
            <h2>Trial balance</h2>
            <p className="muted">
              Dr RM{data.trialBalance.totalDebit.toFixed(2)} · Cr RM
              {data.trialBalance.totalCredit.toFixed(2)}
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account</th>
                  <th>Debit</th>
                  <th>Credit</th>
                </tr>
              </thead>
              <tbody>
                {data.trialBalance.rows.slice(0, 40).map((row) => (
                  <tr key={row.code}>
                    <td>{row.code}</td>
                    <td>{row.name}</td>
                    <td>{row.debit ? `RM${row.debit.toFixed(2)}` : ""}</td>
                    <td>{row.credit ? `RM${row.credit.toFixed(2)}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {data.exceptions.lowConfidenceDocs.length > 0 && (
            <section className="card">
              <h2>Documents needing attention</h2>
              <ul>
                {data.exceptions.lowConfidenceDocs.map((d) => (
                  <li key={d.id}>
                    {d.fileName ?? d.id} — AI {Number(d.aiConfidence ?? 0).toFixed(0)}%
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h2>Recent audit trail</h2>
            <ul>
              {data.auditTrail.slice(0, 15).map((e) => (
                <li key={e.id}>
                  {e.action} · {e.entityType} · {new Date(e.createdAt).toLocaleString()}
                </li>
              ))}
            </ul>
            <Link href="/accountant/audit">Full activity log →</Link>
          </section>
        </>
      )}
    </main>
  );
}
