import { db } from "@/lib/db";
import { round2 } from "@/lib/accounting/helpers";
import { callOpenRouter } from "@/lib/ai/openrouter";
import { writeAuditEvent } from "@/lib/audit/log";
import { getTrialBalance } from "@/lib/accounting/trial-balance";
import { getArAging } from "@/lib/ar/service";
import { getApAging, findDuplicateBills } from "@/lib/ap/service";
import {
  computeMateriality,
  computeAuditReadiness,
  AUDIT_PHASES,
  AUDIT_KNOWLEDGE_TEXT,
  type MaterialityResult,
  type AuditReadiness
} from "@/lib/audit/knowledge";

export type AuditRisk = {
  area: string;
  assertion: string;
  risk: "low" | "medium" | "high";
  reasoning: string;
  response: string;
};

export type AuditFinding = {
  severity: "high" | "medium" | "low" | "info";
  title: string;
  detail: string;
  recommendation: string;
};

export type AuditAssistResult = {
  company: { id: string; name: string };
  period: { id: string; startDate: string; endDate: string; isClosed: boolean } | null;
  financials: {
    revenue: number;
    expenses: number;
    profitBeforeTax: number;
    totalAssets: number;
    totalLiabilities: number;
    netAssets: number;
    currentRatioProxy: number | null;
  };
  materiality: MaterialityResult;
  readiness: AuditReadiness;
  goingConcernFlags: string[];
  exceptions: {
    docsPending: number;
    lowConfidenceDocs: number;
    duplicateBillGroups: number;
    bankUnmatched: number;
    arOverdue: number;
    apOverdue: number;
    futureJournals: number;
  };
  overallRisk: "low" | "medium" | "high";
  summary: string;
  riskAssessment: AuditRisk[];
  auditPlan: Array<{ phase: string; procedures: string[] }>;
  findings: AuditFinding[];
  keyAuditMatters: Array<{ title: string; why: string; howAddressed: string }>;
  goingConcern: { indicator: boolean; reasons: string[]; conclusion: string };
  inquiries: string[];
  managementLetter: string[];
  draftOpinion: { type: string; basis: string; text: string };
  disclaimer: string;
  aiUsed: boolean;
};

const DISCLAIMER =
  "Decision support only — NOT an audit opinion. The engagement partner remains responsible for the opinion under the Companies Act 2016 and MASA. Verify every item before relying on it.";

function safeParse(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim()) as Record<string, unknown>;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function risk(v: unknown, fallback: AuditRisk["risk"] = "medium"): AuditRisk["risk"] {
  const s = String(v ?? "").toLowerCase();
  return s === "low" || s === "medium" || s === "high" ? s : fallback;
}

function severity(v: unknown): AuditFinding["severity"] {
  const s = String(v ?? "").toLowerCase();
  return s === "high" || s === "medium" || s === "low" || s === "info" ? s : "info";
}

/** Deterministic fallback risk assessment + plan when AI is unavailable. */
function fallbackRisks(input: {
  profitBeforeTax: number;
  netAssets: number;
  docsPending: number;
  duplicateBillGroups: number;
  arOverdue: number;
}): AuditRisk[] {
  const risks: AuditRisk[] = [
    {
      area: "Revenue recognition",
      assertion: "Occurrence / Cut-off",
      risk: "high",
      reasoning: "Revenue is presumed a significant risk under ISA 240/315 for most entities.",
      response:
        "Test sales to invoices/delivery evidence around period end; review credit notes and cut-off; confirm significant receivables."
    },
    {
      area: "Management override of controls",
      assertion: "Occurrence / Accuracy",
      risk: "high",
      reasoning: "ISA 240 requires a mandatory fraud risk from management override of controls.",
      response: "Journal entry testing on unusual/manual entries; review estimates and back-dated postings."
    },
    {
      area: "Completeness of liabilities",
      assertion: "Completeness",
      risk: "medium",
      reasoning: "SMEs may under-record accruals, supplier invoices and tax payable.",
      response: "Search for unrecorded liabilities, review subsequent payments, confirm supplier balances."
    }
  ];
  if (input.duplicateBillGroups > 0) {
    risks.push({
      area: "Duplicate / fictitious purchases",
      assertion: "Occurrence",
      risk: "medium",
      reasoning: `${input.duplicateBillGroups} potential duplicate bill group(s) detected by the system.`,
      response: "Vouch duplicate suppliers/bills to original documents; test for fictitious vendors."
    });
  }
  if (input.arOverdue > 0) {
    risks.push({
      area: "Receivables recoverability",
      assertion: "Valuation",
      risk: "medium",
      reasoning: `${input.arOverdue} overdue receivable(s) — expected credit loss risk.`,
      response: "Review aging, post-year-end receipts and customer correspondence; assess ECL provision."
    });
  }
  if (input.netAssets < 0 || input.profitBeforeTax < 0) {
    risks.push({
      area: "Going concern",
      assertion: "Valuation / Presentation",
      risk: "high",
      reasoning: "Negative net assets and/or a loss indicate a going-concern risk (ISA 570).",
      response: "Obtain cash-flow forecasts, confirm shareholder support, assess ability to meet obligations for 12 months."
    });
  }
  return risks;
}

export async function runAuditAssistant(input: {
  companyId: string;
  periodId?: string;
  actorUserId?: string;
}): Promise<AuditAssistResult> {
  const company = await db.company.findUnique({ where: { id: input.companyId } });
  if (!company) throw new Error("Company not found.");

  const period = input.periodId
    ? await db.accountingPeriod.findFirst({ where: { id: input.periodId, companyId: input.companyId } })
    : await db.accountingPeriod.findFirst({
        where: { companyId: input.companyId },
        orderBy: { startDate: "desc" }
      });

  const tb = await getTrialBalance(input.companyId, { periodId: period?.id });

  let revenue = 0;
  let expenses = 0;
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  for (const row of tb.rows) {
    if (row.type === "REVENUE") revenue += row.credit - row.debit;
    if (row.type === "EXPENSE") expenses += row.debit - row.credit;
    if (row.type === "ASSET") totalAssets += row.debit - row.credit;
    if (row.type === "LIABILITY") totalLiabilities += row.credit - row.debit;
    if (row.type === "EQUITY") totalEquity += row.credit - row.debit;
  }
  revenue = round2(revenue);
  expenses = round2(expenses);
  const profitBeforeTax = round2(revenue - expenses);
  const netAssets = round2(totalAssets - totalLiabilities);
  const currentRatioProxy = totalLiabilities > 0 ? round2(totalAssets / totalLiabilities) : null;

  const [docsPending, lowConfidenceDocs, duplicates, arAging, apAging, bankAccounts, futureJournals] =
    await Promise.all([
      db.sourceDocument.count({
        where: {
          companyId: input.companyId,
          status: { in: ["UPLOADED", "IN_REVIEW", "AI_PROCESSED", "NEEDS_CLIENT"] },
          ...(period ? { periodId: period.id } : {})
        }
      }),
      db.sourceDocument.count({
        where: { companyId: input.companyId, status: "IN_REVIEW", aiConfidence: { lt: 70 } }
      }),
      findDuplicateBills(input.companyId),
      getArAging(input.companyId),
      getApAging(input.companyId),
      db.bankAccount.findMany({
        where: { companyId: input.companyId },
        include: { transactions: true }
      }),
      period
        ? db.journalEntry.count({
            where: {
              companyId: input.companyId,
              status: "POSTED",
              journalDate: { gt: period.endDate }
            }
          })
        : Promise.resolve(0)
    ]);

  const bankUnmatched = bankAccounts.reduce(
    (s, a) => s + a.transactions.filter((t) => t.matchStatus === "UNMATCHED").length,
    0
  );
  const arOverdue = arAging.filter((r) => r.daysOverdue > 0).length;
  const apOverdue = apAging.filter((r) => r.daysOverdue > 0).length;

  const goingConcernFlags: string[] = [];
  if (netAssets < 0) goingConcernFlags.push("Negative net assets (shareholders' equity)");
  if (profitBeforeTax < 0) goingConcernFlags.push("Loss for the period");
  if (currentRatioProxy != null && currentRatioProxy < 1)
    goingConcernFlags.push("Liabilities exceed assets (current-ratio proxy < 1)");

  const materiality = computeMateriality({
    revenue,
    totalAssets,
    netAssets,
    profitBeforeTax
  });

  const readiness = computeAuditReadiness({
    tbBalanced: tb.balanced,
    docsPending,
    lowConfidenceDocs,
    duplicateBillGroups: duplicates.length,
    bankUnmatched,
    periodClosed: period?.isClosed ?? false,
    postPeriodJournals: futureJournals,
    goingConcernFlags: goingConcernFlags.length
  });

  let overallRisk: AuditRisk["risk"] =
    tb.balanced && goingConcernFlags.length === 0 && docsPending <= 3 ? "medium" : "high";

  const financials = {
    revenue,
    expenses,
    profitBeforeTax,
    totalAssets: round2(totalAssets),
    totalLiabilities: round2(totalLiabilities),
    netAssets,
    currentRatioProxy
  };

  const exceptions = {
    docsPending,
    lowConfidenceDocs,
    duplicateBillGroups: duplicates.length,
    bankUnmatched,
    arOverdue,
    apOverdue,
    futureJournals
  };

  let riskAssessment = fallbackRisks({
    profitBeforeTax,
    netAssets,
    docsPending,
    duplicateBillGroups: duplicates.length,
    arOverdue
  });
  let findings: AuditFinding[] = readiness.items
    .filter((i) => i.status !== "pass")
    .map((i) => ({
      severity: i.status === "fail" ? "high" : "medium",
      title: i.label,
      detail: i.detail,
      recommendation: "Resolve before field work / report issuance."
    }));
  let auditPlan: Array<{ phase: string; procedures: string[] }> = AUDIT_PHASES.map((p) => ({
    phase: p.phase,
    procedures: p.tasks
  }));
  let keyAuditMatters: Array<{ title: string; why: string; howAddressed: string }> = [];
  let goingConcern = {
    indicator: goingConcernFlags.length > 0,
    reasons: goingConcernFlags,
    conclusion:
      goingConcernFlags.length > 0
        ? "Apply ISA 570 procedures: obtain management's assessment and mitigate with supporting evidence."
        : "No automated going-concern red flags. Still obtain management's assessment per ISA 570."
  };
  let inquiries: string[] = [
    "Provide the latest management accounts, board minutes and bank statements.",
    "Confirm all related-party transactions and balances for the period.",
    "Provide the fixed asset register and depreciation workings.",
    "Confirm subsequent events up to the date of the audit report."
  ];
  let managementLetter: string[] = [];
  let summary = `Audit readiness score ${readiness.score}/100. Overall risk assessed ${overallRisk}. Overall materiality RM${materiality.overallMateriality.toFixed(2)} (performance RM${materiality.performanceMateriality.toFixed(2)}).`;
  let draftOpinion = {
    type: overallRisk === "high" ? "Further procedures required before opinion" : "Unmodified (proposed)",
    basis:
      "Proposed based on the ledger data available. Not an opinion — dependent on sufficient appropriate audit evidence.",
    text:
      "In our opinion, subject to completion of the procedures above, the financial statements give a true and fair view of the financial position of the company in accordance with the applicable reporting framework and the Companies Act 2016."
  };
  let aiUsed = false;

  const systemPrompt = `You are a Malaysian statutory audit assistant for an audit firm. You support — never replace — the engagement partner.
${AUDIT_KNOWLEDGE_TEXT}

Return JSON only:
{
  "overallRisk": "low"|"medium"|"high",
  "summary": "3-4 sentences on the engagement",
  "riskAssessment": [{ "area": string, "assertion": string, "risk": "low"|"medium"|"high", "reasoning": string, "response": string }],
  "auditPlan": [{ "phase": string, "procedures": [string] }],
  "findings": [{ "severity": "high"|"medium"|"low"|"info", "title": string, "detail": string, "recommendation": string }],
  "keyAuditMatters": [{ "title": string, "why": string, "howAddressed": string }],
  "goingConcern": { "indicator": boolean, "reasons": [string], "conclusion": string },
  "inquiries": [string],
  "managementLetter": [string],
  "draftOpinion": { "type": string, "basis": string, "text": string }
}
Rules:
- Give 4 to 6 risk areas tied to specific ISA references and assertions.
- Reference the actual RM amounts, balances and exceptions supplied.
- findings must include every readiness fail/warn and any exception.
- No evasion support; maintain independence and professional scepticism.`;

  const userPrompt = `
Client: ${company.name}${company.industry ? ` (${company.industry})` : ""}
Period: ${period ? `${period.startDate.toISOString().slice(0, 10)} to ${period.endDate.toISOString().slice(0, 10)} (${period.isClosed ? "closed" : "open"})` : "latest"}
Financials: ${JSON.stringify(financials)}
Materiality: ${JSON.stringify({
    benchmark: materiality.benchmark,
    benchmarkPct: materiality.benchmarkPct,
    overall: materiality.overallMateriality,
    performance: materiality.performanceMateriality,
    clearlyTrivial: materiality.clearlyTrivial
  })}
Exceptions: ${JSON.stringify(exceptions)}
Readiness: ${JSON.stringify(readiness.items)}
Going-concern flags: ${JSON.stringify(goingConcernFlags)}
`.trim();

  try {
    const raw = await Promise.race([
      callOpenRouter(systemPrompt, userPrompt, {
        timeoutMs: 45_000,
        maxTokens: 6_000,
        reasoningEffort: "low"
      }),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("AI audit timed out")), 52_000)
      )
    ]);
    const parsed = safeParse(raw);
    if (parsed) {
      aiUsed = true;
      if (parsed.summary) summary = String(parsed.summary);
      if (Array.isArray(parsed.riskAssessment) && parsed.riskAssessment.length > 0) {
        riskAssessment = (parsed.riskAssessment as Array<Record<string, unknown>>).map((r) => ({
          area: String(r.area ?? "Area"),
          assertion: String(r.assertion ?? "Assertion"),
          risk: risk(r.risk),
          reasoning: String(r.reasoning ?? ""),
          response: String(r.response ?? "")
        }));
      }
      if (Array.isArray(parsed.auditPlan) && parsed.auditPlan.length > 0) {
        auditPlan = (parsed.auditPlan as Array<Record<string, unknown>>).map((p) => ({
          phase: String(p.phase ?? "Phase"),
          procedures: Array.isArray(p.procedures) ? p.procedures.map(String) : []
        }));
      }
      if (Array.isArray(parsed.findings) && parsed.findings.length > 0) {
        findings = (parsed.findings as Array<Record<string, unknown>>).map((f) => ({
          severity: severity(f.severity),
          title: String(f.title ?? "Finding"),
          detail: String(f.detail ?? ""),
          recommendation: String(f.recommendation ?? "")
        }));
      }
      if (Array.isArray(parsed.keyAuditMatters)) {
        keyAuditMatters = (parsed.keyAuditMatters as Array<Record<string, unknown>>).map((k) => ({
          title: String(k.title ?? "Matter"),
          why: String(k.why ?? ""),
          howAddressed: String(k.howAddressed ?? "")
        }));
      }
      if (parsed.goingConcern && typeof parsed.goingConcern === "object") {
        const gc = parsed.goingConcern as Record<string, unknown>;
        goingConcern = {
          indicator: Boolean(gc.indicator),
          reasons: Array.isArray(gc.reasons) ? gc.reasons.map(String) : goingConcernFlags,
          conclusion: String(gc.conclusion ?? goingConcern.conclusion)
        };
      }
      if (Array.isArray(parsed.inquiries) && parsed.inquiries.length > 0) {
        inquiries = parsed.inquiries.map(String).slice(0, 10);
      }
      if (Array.isArray(parsed.managementLetter)) {
        managementLetter = parsed.managementLetter.map(String).slice(0, 12);
      }
      if (parsed.draftOpinion && typeof parsed.draftOpinion === "object") {
        const o = parsed.draftOpinion as Record<string, unknown>;
        draftOpinion = {
          type: String(o.type ?? draftOpinion.type),
          basis: String(o.basis ?? draftOpinion.basis),
          text: String(o.text ?? draftOpinion.text)
        };
      }
      if (parsed.overallRisk) overallRisk = risk(parsed.overallRisk, overallRisk);
    }
  } catch {
    /* keep deterministic fallbacks */
  }

  const result: AuditAssistResult = {
    company: { id: company.id, name: company.name },
    period: period
      ? {
          id: period.id,
          startDate: period.startDate.toISOString().slice(0, 10),
          endDate: period.endDate.toISOString().slice(0, 10),
          isClosed: period.isClosed
        }
      : null,
    financials,
    materiality,
    readiness,
    goingConcernFlags,
    exceptions,
    overallRisk,
    summary,
    riskAssessment,
    auditPlan,
    findings,
    keyAuditMatters,
    goingConcern,
    inquiries,
    managementLetter,
    draftOpinion,
    disclaimer: DISCLAIMER,
    aiUsed
  };

  await db.aiSuggestion.create({
    data: {
      companyId: input.companyId,
      type: "AUDIT_ASSIST",
      status: "PROPOSED",
      confidence: readiness.score,
      payload: result as object
    }
  });

  if (input.actorUserId) {
    await writeAuditEvent({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      entityType: "Company",
      entityId: input.companyId,
      action: "AI_AUDIT_ASSIST",
      afterJson: {
        readinessScore: readiness.score,
        overallRisk,
        materiality: materiality.overallMateriality,
        aiUsed
      }
    });
  }

  return result;
}
