"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";

type ChecklistItem = {
  id: string;
  title: string;
  instructions: string;
  whyItMatters: string;
  status: string;
  statusLabel: string;
  category: string;
  sortOrder: number;
};

export default function ClientHomePage() {
  const [progress, setProgress] = useState(0);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/client/checklist")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) {
          setError(data.error || "Failed to load checklist");
          return;
        }
        setProgress(data.progress);
        setChecklist(data.checklist);
        setCompanyName(data.company.name);
      });
  }, []);

  return (
    <main className="container grid">
      <section className="card">
        <h1>Your monthly checklist</h1>
        <p className="muted">
          {companyName || "Your company"} — follow each step. No accounting knowledge needed.
        </p>
        <div className="score-card">
          <h2>{progress}% complete</h2>
          <div className="progress">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
        </div>
        {error && <p className="message error">{error}</p>}
      </section>

      {checklist.map((item) => (
        <section key={item.id} className="card">
          <h2>
            Step {item.sortOrder}: {item.title}
          </h2>
          <p>
            <strong>What to do:</strong> {item.instructions}
          </p>
          <p className="muted">
            <strong>Why:</strong> {item.whyItMatters}
          </p>
          <p>
            Status: <strong>{item.statusLabel}</strong>
          </p>
          <Link className="btn" href={`/client/uploads?requestId=${item.id}&category=${item.category}`}>
            Upload for this step
          </Link>{" "}
          <Link className="btn secondary" href={"/client/documents" as Route}>
            Documents hub
          </Link>
        </section>
      ))}

      <section className="card">
        <h2>After you finish</h2>
        <p className="muted">
          Your accountant will review AI suggestions, post the books, and publish your monthly report.
        </p>
        <Link href="/client/reports">View reports →</Link>
      </section>
    </main>
  );
}
