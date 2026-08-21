"use client";

import { useEffect, useState } from "react";

export default function ClientReportsPage() {
  const [report, setReport] = useState<{
    title: string;
    status: string;
    summaryJson: {
      plainLanguage?: { headline?: string; cashTip?: string };
      profitAndLoss?: { revenue: number; expenses: number; profit: number };
      outstanding?: { receivables: number; payables: number };
      processing?: { documentsTotal: number; posted: number; needsClientAction: number };
    };
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/client/reports")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) {
          setError(data.error || "No report yet");
          return;
        }
        setReport(data.report);
      });
  }, []);

  const summary = report?.summaryJson;

  return (
    <main className="container grid">
      <section className="card">
        <h1>Your monthly report</h1>
        <p className="muted">Simple business summary — not full ledger jargon.</p>
        {error && <p className="message error">{error}</p>}
      </section>

      {report && summary && (
        <>
          <section className="card">
            <h2>{report.title}</h2>
            <p>{summary.plainLanguage?.headline}</p>
            <p className="muted">{summary.plainLanguage?.cashTip}</p>
          </section>
          <section className="grid metrics">
            <div className="card">
              <h3>Revenue</h3>
              <p>RM{Number(summary.profitAndLoss?.revenue ?? 0).toFixed(2)}</p>
            </div>
            <div className="card">
              <h3>Expenses</h3>
              <p>RM{Number(summary.profitAndLoss?.expenses ?? 0).toFixed(2)}</p>
            </div>
            <div className="card">
              <h3>Profit</h3>
              <p>RM{Number(summary.profitAndLoss?.profit ?? 0).toFixed(2)}</p>
            </div>
            <div className="card">
              <h3>Docs posted</h3>
              <p>
                {summary.processing?.posted}/{summary.processing?.documentsTotal}
              </p>
            </div>
          </section>
          <section className="card">
            <h2>Outstanding</h2>
            <p>Customers owe you: RM{Number(summary.outstanding?.receivables ?? 0).toFixed(2)}</p>
            <p>You owe suppliers: RM{Number(summary.outstanding?.payables ?? 0).toFixed(2)}</p>
            {(summary.processing?.needsClientAction ?? 0) > 0 && (
              <p className="message error">
                {summary.processing?.needsClientAction} document(s) still need your action.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
