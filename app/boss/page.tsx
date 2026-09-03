"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

type FirmData = {
  company: { name: string };
  team: Array<{ name: string; email: string; role: string; isOwner: boolean }>;
  kpis: {
    postedJournals: number;
    documentsInReview: number;
    waitingOnClient: number;
    postedDocuments: number;
    outstandingAR: number;
    outstandingAP: number;
    duplicateBillGroups: number;
    monthEndCompletion: number;
    periodClosed: boolean;
  };
  workflow: Array<{ step: string; owner: string; status: string }>;
};

export default function BossPortalPage() {
  const { data: session } = useSession();
  const companyId = session?.user?.companyId ?? "";
  const [data, setData] = useState<FirmData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/companies/${companyId}/firm`)
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) setData(json);
        else setError(String(json.error));
      });
  }, [companyId]);

  return (
    <main className="container grid">
      <section className="card">
        <h1>Boss / Partner oversight</h1>
        <p className="muted">
          Firm principal view — see who is doing what, client health, and whether month-end is
          locked. In Malaysian practice, the partner owns final accountability.
        </p>
        <p className="muted">{data?.company.name ?? session?.user?.companyName}</p>
      </section>

      {error && <p className="message error">{error}</p>}

      {data && (
        <>
          <section className="grid metrics">
            <div className="card">
              <h3>Posted journals</h3>
              <p>{data.kpis.postedJournals}</p>
            </div>
            <div className="card">
              <h3>In review</h3>
              <p>{data.kpis.documentsInReview}</p>
            </div>
            <div className="card">
              <h3>Waiting on client</h3>
              <p>{data.kpis.waitingOnClient}</p>
            </div>
            <div className="card">
              <h3>Month-end</h3>
              <p>
                {data.kpis.monthEndCompletion}%
                {data.kpis.periodClosed ? " · Closed" : ""}
              </p>
            </div>
            <div className="card">
              <h3>AR</h3>
              <p>RM{data.kpis.outstandingAR.toFixed(2)}</p>
            </div>
            <div className="card">
              <h3>AP</h3>
              <p>RM{data.kpis.outstandingAP.toFixed(2)}</p>
            </div>
          </section>

          <section className="card">
            <h2>Firm workflow (MY practice)</h2>
            <ol>
              {data.workflow.map((w) => (
                <li key={w.step}>
                  <strong>{w.step}</strong> — {w.owner} ({w.status})
                </li>
              ))}
            </ol>
          </section>

          <section className="card">
            <h2>Team</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {data.team.map((m) => (
                  <tr key={m.email}>
                    <td>
                      {m.name}
                      {m.isOwner ? " ★" : ""}
                    </td>
                    <td>{m.email}</td>
                    <td>{m.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      <section className="card links">
        <Link href="/manager">Manager close →</Link>
        <Link href="/accountant">Accountant →</Link>
        <Link href="/tax">Tax →</Link>
        <Link href="/auditor">Audit →</Link>
        <Link href="/client">Client portal →</Link>
      </section>
    </main>
  );
}
