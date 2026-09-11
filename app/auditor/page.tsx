"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import type { Route } from "next";

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

type AuditAssist = {
  company: { name: string };
  period: { startDate: string; endDate: string; isClosed: boolean } | null;
  financials: {
    revenue: number;
    expenses: number;
    profitBeforeTax: number;
    totalAssets: number;
    totalLiabilities: number;
    netAssets: number;
  };
  materiality: {
    benchmark: string;
    benchmarkPct: number;
    benchmarkAmount: number;
    overallMateriality: number;
    performanceMateriality: number;
    clearlyTrivial: number;
    rationale: string;
  };
  readiness: {
    score: number;
    items: Array<{ key: string; label: string; status: "pass" | "warn" | "fail"; detail: string }>;
  };
  overallRisk: "low" | "medium" | "high";
  summary: string;
  riskAssessment: Array<{
    area: string;
    assertion: string;
    risk: "low" | "medium" | "high";
    reasoning: string;
    response: string;
  }>;
  auditPlan: Array<{ phase: string; procedures: string[] }>;
  findings: Array<{ severity: string; title: string; detail: string; recommendation: string }>;
  keyAuditMatters: Array<{ title: string; why: string; howAddressed: string }>;
  goingConcern: { indicator: boolean; reasons: string[]; conclusion: string };
  inquiries: string[];
  managementLetter: string[];
  draftOpinion: { type: string; basis: string; text: string };
  disclaimer: string;
  aiUsed: boolean;
};

function money(n: number) {
  return `RM ${Number(n ?? 0).toFixed(2)}`;
}

export default function AuditorPortalPage() {
  const { data: session } = useSession();
  const companyId = session?.user?.companyId ?? "";
  const [data, setData] = useState<AuditView | null>(null);
  const [audit, setAudit] = useState<AuditAssist | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/companies/${companyId}/firm?view=audit`)
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) setData(json);
        else setError(String(json.error));
      });
  }, [companyId]);

  async function runAiAudit() {
    if (!companyId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/companies/${companyId}/audit/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const json = await res.json();
      if (!json.ok) {
        setError(String(json.error || "Audit assistant failed"));
        return;
      }
      setAudit(json.audit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audit assistant failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container grid">
      <section className="card">
        <h1>Audit workspace</h1>
        <p className="muted">
          Statutory audit support under the Companies Act 2016 and MASA (ISA). Read-only readiness,
          plus an AI assistant that plans procedures, assesses risk and drafts a management letter.
          AI output is decision support — never the audit opinion.
        </p>
        <p className="muted">{session?.user?.companyName}</p>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn" type="button" disabled={!companyId || busy} onClick={runAiAudit}>
            {busy ? "AI planning & assessing risk…" : "Run AI audit assistant"}
          </button>
        </div>
      </section>

      {error && <p className="message error">{error}</p>}

      {audit && (
        <>
          <section className="grid metrics">
            <div className="card">
              <h3>Readiness</h3>
              <p className="metric-value">{audit.readiness.score}/100</p>
            </div>
            <div className="card">
              <h3>Overall risk</h3>
              <p className="metric-value">{audit.overallRisk}</p>
            </div>
            <div className="card">
              <h3>Overall materiality</h3>
              <p className="metric-value">{money(audit.materiality.overallMateriality)}</p>
              <span className="muted">Performance {money(audit.materiality.performanceMateriality)}</span>
            </div>
            <div className="card">
              <h3>Going concern</h3>
              <p className="metric-value">{audit.goingConcern.indicator ? "Flag" : "Clear"}</p>
            </div>
          </section>

          <section className="card">
            <h2>Audit summary</h2>
            <p>{audit.summary}</p>
            <table className="table">
              <tbody>
                <tr>
                  <td className="muted">Revenue</td>
                  <td>{money(audit.financials.revenue)}</td>
                </tr>
                <tr>
                  <td className="muted">Expenses</td>
                  <td>{money(audit.financials.expenses)}</td>
                </tr>
                <tr>
                  <td className="muted">Profit before tax</td>
                  <td>{money(audit.financials.profitBeforeTax)}</td>
                </tr>
                <tr>
                  <td className="muted">Total assets / liabilities</td>
                  <td>
                    {money(audit.financials.totalAssets)} / {money(audit.financials.totalLiabilities)}
                  </td>
                </tr>
                <tr>
                  <td className="muted">Net assets</td>
                  <td>{money(audit.financials.netAssets)}</td>
                </tr>
                <tr>
                  <td className="muted">Materiality basis</td>
                  <td>
                    {audit.materiality.benchmark} ({audit.materiality.benchmarkPct}% of{" "}
                    {money(audit.materiality.benchmarkAmount)}) · clearly trivial{" "}
                    {money(audit.materiality.clearlyTrivial)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="muted">{audit.materiality.rationale}</p>
          </section>

          <section className="card">
            <h2>Audit readiness</h2>
            <ul className="checklist">
              {audit.readiness.items.map((item) => (
                <li key={item.key} className={item.status === "pass" ? "done" : ""}>
                  <span>
                    {item.status === "pass" ? "✓" : item.status === "warn" ? "!" : "✗"} {item.label}
                  </span>
                  <span className="muted">{item.detail}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h2>Risk assessment (ISA 315)</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Area</th>
                    <th>Assertion</th>
                    <th>Risk</th>
                    <th>Why</th>
                    <th>Response</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.riskAssessment.map((r) => (
                    <tr key={r.area}>
                      <td>{r.area}</td>
                      <td>{r.assertion}</td>
                      <td>
                        <span className={r.risk === "high" ? "message error" : "badge"}>{r.risk}</span>
                      </td>
                      <td>{r.reasoning}</td>
                      <td>{r.response}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h2>Audit plan / programme</h2>
            {audit.auditPlan.map((phase) => (
              <div key={phase.phase} style={{ marginBottom: "1rem" }}>
                <strong>{phase.phase}</strong>
                <ul>
                  {phase.procedures.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section className="card">
            <h2>Findings &amp; proposed adjustments</h2>
            {audit.findings.length === 0 ? (
              <p className="muted">No exceptions raised.</p>
            ) : (
              <ul>
                {audit.findings.map((f) => (
                  <li key={f.title} className={f.severity === "high" ? "message error" : ""}>
                    <strong>
                      [{f.severity}] {f.title}
                    </strong>
                    <p>{f.detail}</p>
                    <p className="muted">Recommendation: {f.recommendation}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {audit.keyAuditMatters.length > 0 && (
            <section className="card">
              <h2>Key audit matters (ISA 701)</h2>
              <ul>
                {audit.keyAuditMatters.map((k) => (
                  <li key={k.title} style={{ marginBottom: "0.75rem" }}>
                    <strong>{k.title}</strong>
                    <p>{k.why}</p>
                    <p className="muted">Addressed: {k.howAddressed}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h2>Going concern (ISA 570)</h2>
            <p>{audit.goingConcern.conclusion}</p>
            {audit.goingConcern.reasons.length > 0 && (
              <ul>
                {audit.goingConcern.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2>Management inquiries / requested evidence</h2>
            <ul>
              {audit.inquiries.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
            {audit.managementLetter.length > 0 && (
              <>
                <h3>Management letter points</h3>
                <ul>
                  {audit.managementLetter.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="card">
            <h2>Draft opinion (not final)</h2>
            <p>
              <strong>{audit.draftOpinion.type}</strong>
            </p>
            <p>{audit.draftOpinion.text}</p>
            <p className="muted">Basis: {audit.draftOpinion.basis}</p>
            <p className="message">{audit.disclaimer}</p>
            <p className="muted">
              {audit.aiUsed ? "AI enrichment applied." : "Rule-based fallback (AI unavailable)."}
            </p>
          </section>
        </>
      )}

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
            <div className="table-wrap">
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
            </div>
          </section>

          <section className="card">
            <h2>Recent audit trail</h2>
            <ul>
              {data.auditTrail.slice(0, 15).map((e) => (
                <li key={e.id}>
                  {e.action} · {e.entityType} · {new Date(e.createdAt).toLocaleString()}
                </li>
              ))}
            </ul>
            <Link href={"/accountant/audit" as Route}>Full activity log →</Link>
          </section>
        </>
      )}
    </main>
  );
}
