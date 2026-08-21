"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Doc = {
  id: string;
  fileName: string | null;
  category: string;
  status: string;
  aiConfidence: number | string | null;
  company: { name: string };
  suggestions: Array<{ id: string; confidence: number | string }>;
};

export default function AccountantInboxPage() {
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch("/api/accountant/inbox")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setDocuments(data.documents);
      });
  }, []);

  const filtered = documents.filter((d) => {
    if (filter === "ready") return d.status === "IN_REVIEW" && Number(d.aiConfidence ?? 0) >= 70;
    if (filter === "manual") return d.status === "IN_REVIEW" && Number(d.aiConfidence ?? 0) < 70;
    if (filter === "client") return d.status === "NEEDS_CLIENT";
    return true;
  });

  return (
    <main className="container grid">
      <section className="card">
        <h1>Document inbox</h1>
        <p className="muted">Sorted by company, category, status, and AI confidence.</p>
        <div className="row">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="ready">Ready to approve</option>
            <option value="manual">Needs manual</option>
            <option value="client">Waiting on client</option>
          </select>
        </div>
      </section>
      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Company</th>
              <th>File</th>
              <th>Category</th>
              <th>Status</th>
              <th>AI %</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id}>
                <td>{d.company.name}</td>
                <td>{d.fileName ?? d.id.slice(0, 8)}</td>
                <td>{d.category}</td>
                <td>{d.status}</td>
                <td>{d.aiConfidence != null ? Number(d.aiConfidence).toFixed(0) : "-"}</td>
                <td>
                  <Link href={`/accountant/review/${d.id}`}>Review</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
