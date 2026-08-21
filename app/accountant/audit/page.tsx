"use client";

import { useEffect, useState } from "react";

export default function AccountantAuditPage() {
  const [events, setEvents] = useState<
    Array<{
      id: string;
      action: string;
      entityType: string;
      entityId: string;
      reason: string | null;
      createdAt: string;
      actor: { name: string } | null;
    }>
  >([]);
  const [exceptions, setExceptions] = useState<{
    duplicateBillGroups: number;
    needsClientDocs: number;
    lowConfidenceDocs: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/accountant/audit")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setEvents(data.events);
          setExceptions(data.exceptions);
        }
      });
  }, []);

  return (
    <main className="container grid">
      <section className="card">
        <h1>Audit trail & exceptions</h1>
        <p className="muted">Every upload, AI approval, manual post, and client request is logged.</p>
      </section>

      {exceptions && (
        <section className="grid metrics">
          <div className="card">
            <h3>Duplicate bill groups</h3>
            <p>{exceptions.duplicateBillGroups}</p>
          </div>
          <div className="card">
            <h3>Needs client</h3>
            <p>{exceptions.needsClientDocs}</p>
          </div>
          <div className="card">
            <h3>Low confidence</h3>
            <p>{exceptions.lowConfidenceDocs}</p>
          </div>
        </section>
      )}

      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Entity</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.createdAt).toLocaleString()}</td>
                <td>{e.actor?.name ?? "System"}</td>
                <td>{e.action}</td>
                <td className="mono">
                  {e.entityType}:{e.entityId.slice(0, 8)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
