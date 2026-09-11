"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";

type SubmitResult = {
  documentCount: number;
  tidy: {
    summary: {
      documentCount: number;
      renamedCount: number;
      recategorizedCount: number;
      counts: Record<string, number>;
      readyToApprove: number;
    };
  } | null;
  tidyError?: string | null;
};

export default function ClientHomePage() {
  const [progress, setProgress] = useState(0);
  const [companyName, setCompanyName] = useState("");
  const [docHint, setDocHint] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [submitMessage, setSubmitMessage] = useState("");

  useEffect(() => {
    fetch("/api/client/checklist")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) {
          setError(data.error || "Failed to load");
          return;
        }
        setProgress(data.progress);
        setCompanyName(data.company.name);
        const uploaded = (data.checklist as Array<{ status: string }>).filter((c) =>
          ["UPLOADED", "ACCEPTED", "SKIPPED"].includes(c.status)
        ).length;
        setDocHint(`${uploaded} of ${data.checklist.length} areas covered after AI sort`);
      });
  }, [submitResult]);

  async function submitAllDone() {
    setSubmitting(true);
    setError("");
    setSubmitMessage("");
    setSubmitResult(null);
    try {
      const res = await fetch("/api/client/submit-complete", { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setError(String(data.error || "Submit failed"));
        return;
      }
      setSubmitMessage(String(data.message || "Submitted."));
      setSubmitResult({
        documentCount: data.documentCount,
        tidy: data.tidy,
        tidyError: data.tidyError
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="container grid">
      <section className="card">
        <div className="page-header">
          <h1>Send this month’s documents</h1>
          <p className="muted">
            {companyName || "Your company"} — just give us everything. No need to sort bank vs
            bills vs payroll. AI will categorize and tidy for your accountant.
          </p>
        </div>
        <div className="score-card" style={{ marginTop: 12 }}>
          <h2>{progress}% covered</h2>
          <div className="progress">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
          {docHint && <p className="muted">{docHint}</p>}
        </div>
        {error && <p className="message error">{error}</p>}
        <div className="btn-row" style={{ marginTop: 16 }}>
          <Link className="btn" href={"/client/uploads" as Route}>
            Drop all files / scan photos
          </Link>
          <Link className="btn secondary" href={"/client/messages" as Route}>
            Messages
          </Link>
        </div>
      </section>

      <section className="card">
        <h2>What to include (all together is OK)</h2>
        <ul className="muted" style={{ lineHeight: 1.7 }}>
          <li>Bank statements / CSV exports</li>
          <li>Sales invoices & customer receipts</li>
          <li>Purchase bills, Grab, petrol, office expenses</li>
          <li>Payroll summary (if any)</li>
          <li>SST / tax papers (if any)</li>
        </ul>
      </section>

      <section className="card">
        <h2>Done for this month?</h2>
        <p className="muted">
          After you’ve dumped everything, click below. AI does a final tidy pass and notifies your
          accountant.
        </p>
        <button className="btn" type="button" disabled={submitting} onClick={submitAllDone}>
          {submitting ? "AI final tidy…" : "I've sent everything"}
        </button>
        {submitMessage && <p className="message success">{submitMessage}</p>}
        {submitResult?.tidy && (
          <div style={{ marginTop: "1rem" }}>
            <p>
              Organized <strong>{submitResult.tidy.summary.documentCount}</strong> files · renamed{" "}
              <strong>{submitResult.tidy.summary.renamedCount}</strong> · sorted{" "}
              <strong>{submitResult.tidy.summary.recategorizedCount}</strong>
            </p>
            <ul>
              {Object.entries(submitResult.tidy.summary.counts).map(([cat, n]) => (
                <li key={cat}>
                  {cat}: {n}
                </li>
              ))}
            </ul>
          </div>
        )}
        {submitResult?.tidyError && (
          <p className="message error">
            Submitted, but AI tidy had an issue: {submitResult.tidyError}. Accountant can re-run.
          </p>
        )}
        <p style={{ marginTop: "1rem" }}>
          <Link href={"/client/reports" as Route}>View reports →</Link>
        </p>
      </section>
    </main>
  );
}
