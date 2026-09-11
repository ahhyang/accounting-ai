"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import type { Route } from "next";

type TaxPack = {
  settings: { sstRegistered: boolean; sstNumber: string | null };
  period: { id: string; startDate: string; endDate: string } | null;
  sst: { outputTax: number; inputTax: number; netPayable: number; status: string };
  schedules: {
    taxableSales: { count: number; tax: number; total: number };
    taxablePurchases: { count: number; tax: number; total: number };
  };
  checklist: Array<{ key: string; label: string; done: boolean }>;
};

type TaxBand = { label: string; ratePct: number; taxable: number; tax: number };

type TaxAdvise = {
  counted: {
    sstOutput: number;
    sstInput: number;
    sstNet: number;
    taxableSales: number;
    taxablePurchases: number;
    estimatedProfit: number;
    estimatedCorporateTax: number;
    corporateTaxRatePct: number;
    taxBands: TaxBand[];
    smeRateApplied: boolean;
    effectiveRatePct: number;
    cp204SafeEstimate: number;
  };
  audit: {
    score: number;
    findings: Array<{
      severity: "high" | "medium" | "low" | "info";
      code: string;
      title: string;
      detail: string;
    }>;
  };
  reductionIdeas: Array<{
    title: string;
    how: string;
    estimatedSavingRm: number | null;
    risk: "low" | "medium" | "high";
    legalNote: string;
  }>;
  minimumTaxPlan: {
    summary: string;
    targetEstimatedTax: number;
    strategies: Array<{
      title: string;
      action: string;
      legalBasis: string;
      estimatedSavingRm: number | null;
      risk: "low" | "medium" | "high";
    }>;
    doubleDeductions: Array<{ title: string; basis: string; how: string }>;
    capitalAllowanceRates: Array<{ assetClass: string; initialPct: number; annualPct: number }>;
    disallowanceRisks: Array<{
      severity: "high" | "medium" | "low" | "info";
      code: string;
      title: string;
      detail: string;
      estimatedAddBackRm?: number;
      legalBasis: string;
    }>;
    cp204: {
      minSafeEstimate: number;
      recommendedEstimate: number;
      monthlyInstalment: number;
      penaltyThreshold: number;
      notes: string[];
    };
  };
  recommendations: string[];
  summary: string;
  disclaimer: string;
  aiUsed: boolean;
};

function severityClass(severity: string) {
  if (severity === "high") return "message error";
  if (severity === "medium") return "muted";
  return "muted";
}

export default function TaxPortalPage() {
  const { data: session } = useSession();
  const companyId = session?.user?.companyId ?? "";
  const [pack, setPack] = useState<TaxPack | null>(null);
  const [advise, setAdvise] = useState<TaxAdvise | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/companies/${companyId}/tax`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setPack(data);
        else setError(String(data.error));
      });
  }, [companyId]);

  async function runAiTax() {
    if (!companyId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/companies/${companyId}/tax/advise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId: pack?.period?.id })
      });
      const data = await res.json();
      if (!data.ok) {
        setError(String(data.error || "AI tax advise failed"));
        return;
      }
      setAdvise(data.advise);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI tax advise failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container grid">
      <section className="card">
        <div className="page-header">
          <h1>Tax workspace</h1>
          <p className="muted">
            Count SST & company tax, audit the pack, then get legal ways to reduce tax — with clear
            recommendations.
          </p>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          {session?.user?.companyName}
        </p>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn" type="button" disabled={!companyId || busy} onClick={runAiTax}>
            {busy ? "AI counting & auditing…" : "AI: count tax · reduce · audit"}
          </button>
        </div>
      </section>

      {error && <p className="message error">{error}</p>}

      {pack && (
        <>
          <section className="grid metrics">
            <div className="card">
              <h3>SST output</h3>
              <p className="metric-value">RM{pack.sst.outputTax.toFixed(2)}</p>
            </div>
            <div className="card">
              <h3>SST input</h3>
              <p className="metric-value">RM{pack.sst.inputTax.toFixed(2)}</p>
            </div>
            <div className="card">
              <h3>Net {pack.sst.netPayable >= 0 ? "payable" : "refund"}</h3>
              <p className="metric-value">RM{Math.abs(pack.sst.netPayable).toFixed(2)}</p>
            </div>
          </section>

          <section className="card">
            <h2>Registration</h2>
            <p>
              SST registered:{" "}
              <strong>{pack.settings.sstRegistered ? "Yes" : "No"}</strong>
              {pack.settings.sstNumber ? ` · ${pack.settings.sstNumber}` : ""}
            </p>
            <p className="muted">
              Period:{" "}
              {pack.period
                ? `${new Date(pack.period.startDate).toLocaleDateString()} – ${new Date(pack.period.endDate).toLocaleDateString()}`
                : "Latest"}
            </p>
          </section>

          <section className="card">
            <h2>Taxable schedules</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Schedule</th>
                  <th>Count</th>
                  <th>Tax</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Taxable sales</td>
                  <td>{pack.schedules.taxableSales.count}</td>
                  <td>RM{pack.schedules.taxableSales.tax.toFixed(2)}</td>
                  <td>RM{pack.schedules.taxableSales.total.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Taxable purchases</td>
                  <td>{pack.schedules.taxablePurchases.count}</td>
                  <td>RM{pack.schedules.taxablePurchases.tax.toFixed(2)}</td>
                  <td>RM{pack.schedules.taxablePurchases.total.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </>
      )}

      {advise && (
        <>
          <section className="card">
            <h2>1. Tax counted</h2>
            <p>{advise.summary}</p>
            <div className="grid metrics">
              <div>
                <h3>SST net</h3>
                <p>
                  RM{Math.abs(advise.counted.sstNet).toFixed(2)}{" "}
                  <span className="muted">
                    ({advise.counted.sstNet >= 0 ? "payable" : "refund"})
                  </span>
                </p>
              </div>
              <div>
                <h3>Est. profit</h3>
                <p>RM{advise.counted.estimatedProfit.toFixed(2)}</p>
              </div>
              <div>
                <h3>Est. company tax</h3>
                <p>
                  RM{advise.counted.estimatedCorporateTax.toFixed(2)}{" "}
                  <span className="muted">(~{advise.counted.corporateTaxRatePct}%)</span>
                </p>
              </div>
            </div>
            {advise.counted.taxBands?.length ? (
              <>
                <h3>
                  Corporate tax by band {advise.counted.smeRateApplied ? "(SME rate)" : "(standard rate)"}
                </h3>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Band</th>
                      <th>Rate</th>
                      <th>Taxable</th>
                      <th>Tax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {advise.counted.taxBands.map((band) => (
                      <tr key={band.label}>
                        <td>{band.label}</td>
                        <td>{band.ratePct}%</td>
                        <td>RM{band.taxable.toFixed(2)}</td>
                        <td>RM{band.tax.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted">
                  Effective rate {advise.counted.effectiveRatePct}% · CP204 penalty-safe estimate RM
                  {advise.counted.cp204SafeEstimate.toFixed(2)}
                </p>
              </>
            ) : null}
            <p className="muted">
              {advise.aiUsed ? "AI enrichment applied." : "Rule-based fallback (AI unavailable)."}
            </p>
          </section>

          {advise.minimumTaxPlan && (
            <section className="card">
              <h2>2. Minimum-tax plan (legally pay the least)</h2>
              <p>{advise.minimumTaxPlan.summary}</p>

              <h3>CP204 cash-tax timing</h3>
              <div className="grid metrics">
                <div>
                  <h4>Penalty-safe estimate</h4>
                  <p>RM{advise.minimumTaxPlan.cp204.minSafeEstimate.toFixed(2)}</p>
                </div>
                <div>
                  <h4>Monthly instalment</h4>
                  <p>RM{advise.minimumTaxPlan.cp204.monthlyInstalment.toFixed(2)}</p>
                </div>
                <div>
                  <h4>Penalty-free shortfall</h4>
                  <p>RM{advise.minimumTaxPlan.cp204.penaltyThreshold.toFixed(2)}</p>
                </div>
              </div>
              <ul className="muted">
                {advise.minimumTaxPlan.cp204.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>

              <h3>Strategies ranked by saving</h3>
              {advise.minimumTaxPlan.strategies.map((s) => (
                <div key={s.title} style={{ marginBottom: "1rem" }}>
                  <strong>{s.title}</strong>{" "}
                  <span className="muted">
                    [{s.risk} risk]
                    {s.estimatedSavingRm != null
                      ? ` · est. saving ~RM${s.estimatedSavingRm.toFixed(2)}`
                      : ""}
                  </span>
                  <p style={{ margin: "0.25rem 0" }}>{s.action}</p>
                  <p className="muted" style={{ margin: 0 }}>
                    Legal basis: {s.legalBasis}
                  </p>
                </div>
              ))}

              {advise.minimumTaxPlan.disallowanceRisks.length > 0 && (
                <>
                  <h3>Add-back risks to clear</h3>
                  <ul>
                    {advise.minimumTaxPlan.disallowanceRisks.map((r) => (
                      <li key={r.code}>
                        <strong>{r.title}</strong>
                        {r.estimatedAddBackRm != null
                          ? ` (~RM${r.estimatedAddBackRm.toFixed(2)} added back)`
                          : ""}
                        <p className="muted" style={{ margin: "0.2rem 0" }}>
                          {r.detail} <em>({r.legalBasis})</em>
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <h3>Double-deduction opportunities</h3>
              <ul>
                {advise.minimumTaxPlan.doubleDeductions.map((d) => (
                  <li key={d.title}>
                    <strong>{d.title}</strong> <span className="muted">({d.basis})</span>
                    <p className="muted" style={{ margin: "0.2rem 0" }}>
                      {d.how}
                    </p>
                  </li>
                ))}
              </ul>

              <h3>Capital allowance rates</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Asset class</th>
                    <th>Initial</th>
                    <th>Annual</th>
                  </tr>
                </thead>
                <tbody>
                  {advise.minimumTaxPlan.capitalAllowanceRates.map((ca) => (
                    <tr key={ca.assetClass}>
                      <td>{ca.assetClass}</td>
                      <td>{ca.initialPct}%</td>
                      <td>{ca.annualPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="card">
            <h2>3. Ways to reduce tax (legal)</h2>
            <ol>
              {advise.reductionIdeas.map((idea) => (
                <li key={idea.title} style={{ marginBottom: "1rem" }}>
                  <strong>{idea.title}</strong>
                  <p>{idea.how}</p>
                  <p className="muted">
                    Risk: {idea.risk}
                    {idea.estimatedSavingRm != null
                      ? ` · Est. saving ~RM${idea.estimatedSavingRm.toFixed(2)}`
                      : ""}
                    {" · "}
                    {idea.legalNote}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section className="card">
            <h2>4. Tax audit · score {advise.audit.score}/100</h2>
            <ul>
              {advise.audit.findings.map((f) => (
                <li key={f.code} className={severityClass(f.severity)} style={{ marginBottom: "0.75rem" }}>
                  <strong>
                    [{f.severity}] {f.title}
                  </strong>
                  <p>{f.detail}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h2>5. Recommendations</h2>
            <ol>
              {advise.recommendations.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
            <p className="muted">{advise.disclaimer}</p>
          </section>
        </>
      )}

      {pack && (
        <section className="card">
          <h2>Tax pack checklist</h2>
          <ul>
            {pack.checklist.map((item) => (
              <li key={item.key}>
                {item.done ? "✓" : "○"} {item.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card links">
        <Link href={"/sales" as Route}>Sales (AR) →</Link>
        <Link href={"/purchases" as Route}>Purchases (AP) →</Link>
        <Link href={"/accountant/tidy" as Route}>AI tidy documents →</Link>
      </section>
    </main>
  );
}
