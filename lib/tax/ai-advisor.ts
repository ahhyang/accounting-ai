import { db } from "@/lib/db";
import { round2 } from "@/lib/accounting/helpers";
import { callOpenRouter } from "@/lib/ai/openrouter";
import { writeAuditEvent } from "@/lib/audit/log";
import { getSstTaxPack } from "@/lib/tax/sst-summary";

export type TaxAuditFinding = {
  severity: "high" | "medium" | "low" | "info";
  code: string;
  title: string;
  detail: string;
};

export type TaxReductionIdea = {
  title: string;
  how: string;
  estimatedSavingRm: number | null;
  risk: "low" | "medium" | "high";
  legalNote: string;
};

export type TaxAdviseResult = {
  counted: {
    sstOutput: number;
    sstInput: number;
    sstNet: number;
    taxableSales: number;
    taxablePurchases: number;
    estimatedProfit: number;
    estimatedCorporateTax: number;
    corporateTaxRatePct: number;
  };
  audit: {
    score: number;
    findings: TaxAuditFinding[];
  };
  reductionIdeas: TaxReductionIdea[];
  recommendations: string[];
  summary: string;
  disclaimer: string;
  aiUsed: boolean;
};

const DISCLAIMER =
  "Advisory only — not tax advice. Confirm with a licensed Malaysian tax agent / LHDN rules before acting.";

/** SME company tax estimate: 17% on first RM150k chargeable income, 24% above (simplified). */
export function estimateMsCompanyTax(profit: number): {
  chargeable: number;
  tax: number;
  ratePct: number;
} {
  const chargeable = Math.max(0, round2(profit));
  if (chargeable <= 0) return { chargeable: 0, tax: 0, ratePct: 0 };
  const band1 = Math.min(chargeable, 150_000);
  const band2 = Math.max(0, chargeable - 150_000);
  const tax = round2(band1 * 0.17 + band2 * 0.24);
  const ratePct = chargeable > 0 ? round2((tax / chargeable) * 100) : 0;
  return { chargeable, tax, ratePct };
}

async function buildPlSnapshot(companyId: string, periodId?: string) {
  const period = periodId
    ? await db.accountingPeriod.findFirst({ where: { id: periodId, companyId } })
    : await db.accountingPeriod.findFirst({
        where: { companyId },
        orderBy: { startDate: "desc" }
      });

  const journals = await db.journalEntry.findMany({
    where: {
      companyId,
      status: "POSTED",
      ...(period
        ? { journalDate: { gte: period.startDate, lte: period.endDate } }
        : {})
    },
    include: { lines: { include: { account: true } } }
  });

  let revenue = 0;
  let expenses = 0;
  const expenseByCode: Record<string, number> = {};

  for (const je of journals) {
    for (const line of je.lines) {
      const debit = Number(line.debit);
      const credit = Number(line.credit);
      if (line.account.type === "REVENUE") revenue += credit - debit;
      if (line.account.type === "EXPENSE") {
        const amt = debit - credit;
        expenses += amt;
        expenseByCode[line.account.code] = round2(
          (expenseByCode[line.account.code] ?? 0) + amt
        );
      }
    }
  }

  return {
    period,
    revenue: round2(revenue),
    expenses: round2(expenses),
    profit: round2(revenue - expenses),
    expenseByCode
  };
}

function runDeterministicAudit(input: {
  pack: Awaited<ReturnType<typeof getSstTaxPack>>;
  pl: Awaited<ReturnType<typeof buildPlSnapshot>>;
  untaxedSalesCount: number;
  untaxedPurchaseCount: number;
  docsInReview: number;
}): TaxAuditFinding[] {
  const findings: TaxAuditFinding[] = [];
  const { pack, pl } = input;

  if (!pack.settings.sstRegistered || !pack.settings.sstNumber) {
    findings.push({
      severity: "high",
      code: "SST_REG",
      title: "SST registration incomplete",
      detail: "SST flag or SST number missing in tax settings — confirm before filing."
    });
  }

  const salesTaxDiff = round2(pack.sst.outputTax - pack.schedules.taxableSales.tax);
  if (Math.abs(salesTaxDiff) > 1) {
    findings.push({
      severity: "high",
      code: "SST_OUT_MISMATCH",
      title: "SST output vs sales schedule mismatch",
      detail: `Journal SST payable (2400) RM${pack.sst.outputTax.toFixed(2)} vs invoice tax RM${pack.schedules.taxableSales.tax.toFixed(2)} (diff RM${salesTaxDiff.toFixed(2)}).`
    });
  }

  const purchaseTaxDiff = round2(pack.sst.inputTax - pack.schedules.taxablePurchases.tax);
  if (Math.abs(purchaseTaxDiff) > 1) {
    findings.push({
      severity: "medium",
      code: "SST_IN_MISMATCH",
      title: "SST input vs purchase schedule mismatch",
      detail: `Journal input tax (5950) RM${pack.sst.inputTax.toFixed(2)} vs bill tax RM${pack.schedules.taxablePurchases.tax.toFixed(2)} (diff RM${purchaseTaxDiff.toFixed(2)}).`
    });
  }

  if (input.untaxedSalesCount > 0) {
    findings.push({
      severity: "medium",
      code: "SALES_NO_TAX",
      title: "Sales invoices without SST",
      detail: `${input.untaxedSalesCount} invoice(s) have RM0 tax — check exempt vs omitted SST.`
    });
  }

  if (input.untaxedPurchaseCount > 0 && pack.settings.sstRegistered) {
    findings.push({
      severity: "low",
      code: "PURCHASE_NO_INPUT",
      title: "Purchases without input tax",
      detail: `${input.untaxedPurchaseCount} bill(s) with no tax — may miss claimable input tax if suppliers charged SST.`
    });
  }

  if (pack.sst.outputTax > 0 && pack.sst.inputTax === 0) {
    findings.push({
      severity: "medium",
      code: "NO_INPUT_CLAIM",
      title: "Output tax with zero input tax",
      detail: "Collect supplier tax invoices so input tax can offset SST payable."
    });
  }

  if (input.docsInReview > 0) {
    findings.push({
      severity: "medium",
      code: "DOCS_PENDING",
      title: "Documents still in review",
      detail: `${input.docsInReview} source document(s) not posted — tax pack may be incomplete.`
    });
  }

  if (pl.profit > 0 && (pl.expenseByCode["5400"] ?? 0) === 0) {
    findings.push({
      severity: "info",
      code: "EXPENSE_CHECK",
      title: "Limited deductible expense categories posted",
      detail: "Review whether allowable business expenses (marketing, travel, office) are fully captured for company tax."
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "info",
      code: "CLEAN",
      title: "No material automated issues",
      detail: "SST schedules and journals look aligned for this pass."
    });
  }

  return findings;
}

function auditScore(findings: TaxAuditFinding[]): number {
  let score = 100;
  for (const f of findings) {
    if (f.code === "CLEAN") continue;
    if (f.severity === "high") score -= 18;
    else if (f.severity === "medium") score -= 10;
    else if (f.severity === "low") score -= 5;
    else score -= 2;
  }
  return Math.max(0, Math.min(100, score));
}

function fallbackReductionIdeas(input: {
  pack: Awaited<ReturnType<typeof getSstTaxPack>>;
  pl: Awaited<ReturnType<typeof buildPlSnapshot>>;
  corpTax: number;
}): TaxReductionIdea[] {
  const ideas: TaxReductionIdea[] = [];
  const { pack, pl, corpTax } = input;

  if (pack.sst.outputTax > pack.sst.inputTax) {
    const gap = round2(pack.sst.outputTax - pack.sst.inputTax);
    ideas.push({
      title: "Claim missing SST input tax",
      how: "Chase supplier tax invoices / e-invoices for purchases already paid; post input tax to 5950 to reduce net SST payable.",
      estimatedSavingRm: Math.min(gap, pack.schedules.taxablePurchases.subtotal * 0.06),
      risk: "low",
      legalNote: "Only claim with valid tax invoices under SST rules."
    });
  }

  ideas.push({
    title: "Maximise allowable business deductions",
    how: "Ensure staff salaries, EPF/SOCSO, rent, utilities, marketing, and repair costs are booked before year-end — reduces chargeable income.",
    estimatedSavingRm: corpTax > 0 ? round2(Math.min(corpTax * 0.15, pl.expenses * 0.17 * 0.1)) : null,
    risk: "low",
    legalNote: "Only claim expenses wholly & exclusively for business (ITA 1967)."
  });

  ideas.push({
    title: "Capital allowance / assets timing",
    how: "If buying equipment near year-end, claim capital allowances instead of (or in addition to) expense treatment where rules allow.",
    estimatedSavingRm: null,
    risk: "medium",
    legalNote: "Follow capital allowance schedules; personal / private assets not allowable."
  });

  ideas.push({
    title: "Separate personal drawings from expenses",
    how: "Reclassify owner personal spend out of P&L into drawings/equity so SST/input claims and deductions stay clean — avoids penalties more than it “saves” tax.",
    estimatedSavingRm: null,
    risk: "low",
    legalNote: "Prevents disallowance and LHDN queries."
  });

  if (ideas.length < 3) {
    ideas.push({
      title: "Review SST scope (exempt vs taxable)",
      how: "Map products/services to taxable vs exempt; stop overcharging SST on exempt supplies and undercharging on taxable ones.",
      estimatedSavingRm: null,
      risk: "medium",
      legalNote: "Wrong classification creates audit exposure."
    });
  }

  return ideas.slice(0, 5);
}

function fallbackRecommendations(findings: TaxAuditFinding[], ideas: TaxReductionIdea[]): string[] {
  const recs: string[] = [];
  for (const f of findings.filter((x) => x.severity === "high" || x.severity === "medium").slice(0, 3)) {
    recs.push(`Fix: ${f.title} — ${f.detail}`);
  }
  for (const idea of ideas.slice(0, 3)) {
    recs.push(`Consider: ${idea.title}. ${idea.how}`);
  }
  recs.push("Have tax agent review before SST return / company tax estimate filing.");
  return recs.slice(0, 8);
}

function safeParseAdvise(text: string): {
  reductionIdeas?: TaxReductionIdea[];
  recommendations?: string[];
  summary?: string;
} | null {
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned) as {
      reductionIdeas?: TaxReductionIdea[];
      recommendations?: string[];
      summary?: string;
    };
  } catch {
    return null;
  }
}

/**
 * Count tax (SST + estimated company tax) → audit → AI reduction ideas → recommendations.
 */
export async function runTaxAdvise(input: {
  companyId: string;
  periodId?: string;
  actorUserId?: string;
}): Promise<TaxAdviseResult> {
  const pack = await getSstTaxPack(input.companyId, input.periodId);
  const pl = await buildPlSnapshot(input.companyId, input.periodId ?? pack.period?.id);
  const corp = estimateMsCompanyTax(pl.profit);

  const periodFilter = pl.period
    ? {
        gte: pl.period.startDate,
        lte: pl.period.endDate
      }
    : undefined;

  const [untaxedSalesCount, untaxedPurchaseCount, docsInReview] = await Promise.all([
    db.salesInvoice.count({
      where: {
        companyId: input.companyId,
        taxAmount: { equals: 0 },
        ...(periodFilter ? { invoiceDate: periodFilter } : {})
      }
    }),
    db.purchaseBill.count({
      where: {
        companyId: input.companyId,
        taxAmount: { equals: 0 },
        ...(periodFilter ? { billDate: periodFilter } : {})
      }
    }),
    db.sourceDocument.count({
      where: {
        companyId: input.companyId,
        status: { in: ["UPLOADED", "IN_REVIEW", "AI_PROCESSED", "NEEDS_CLIENT"] },
        ...(pl.period ? { periodId: pl.period.id } : {})
      }
    })
  ]);

  const findings = runDeterministicAudit({
    pack,
    pl,
    untaxedSalesCount,
    untaxedPurchaseCount,
    docsInReview
  });
  const score = auditScore(findings);

  let reductionIdeas = fallbackReductionIdeas({
    pack,
    pl,
    corpTax: corp.tax
  });
  let recommendations = fallbackRecommendations(findings, reductionIdeas);
  let summary = `SST net ${pack.sst.netPayable >= 0 ? "payable" : "refund"} RM${Math.abs(pack.sst.netPayable).toFixed(2)}; estimated company tax RM${corp.tax.toFixed(2)} on profit RM${pl.profit.toFixed(2)}. Audit score ${score}/100.`;
  let aiUsed = false;

  const systemPrompt = `You are a Malaysian SME tax assistant (SST + company income tax awareness).
Return JSON only:
{
  "summary": "2-3 sentences",
  "reductionIdeas": [
    {
      "title": string,
      "how": string,
      "estimatedSavingRm": number|null,
      "risk": "low"|"medium"|"high",
      "legalNote": string
    }
  ],
  "recommendations": ["actionable steps"]
}
Rules:
- Give 3 to 5 LEGAL tax-efficiency ideas only (no evasion, no hiding income, no fake invoices).
- Prefer SST input claims, allowable deductions, capital allowances, timing, documentation.
- Use Malaysian context (LHDN, Customs SST, e-Invoice awareness).
- estimatedSavingRm must be conservative or null.`;

  const userPrompt = `
Company tax pack:
${JSON.stringify(
  {
    sst: pack.sst,
    schedules: pack.schedules,
    settings: {
      sstRegistered: pack.settings.sstRegistered,
      hasSstNumber: Boolean(pack.settings.sstNumber)
    },
    pl: { revenue: pl.revenue, expenses: pl.expenses, profit: pl.profit },
    estimatedCorporateTax: corp.tax,
    auditFindings: findings,
    auditScore: score
  },
  null,
  2
)}
`.trim();

  try {
    const raw = await callOpenRouter(systemPrompt, userPrompt);
    const parsed = safeParseAdvise(raw);
    if (parsed) {
      aiUsed = true;
      if (parsed.summary) summary = parsed.summary;
      if (Array.isArray(parsed.reductionIdeas) && parsed.reductionIdeas.length >= 2) {
        reductionIdeas = parsed.reductionIdeas.slice(0, 5).map((idea) => ({
          title: String(idea.title ?? "Idea"),
          how: String(idea.how ?? ""),
          estimatedSavingRm:
            idea.estimatedSavingRm != null && !Number.isNaN(Number(idea.estimatedSavingRm))
              ? round2(Number(idea.estimatedSavingRm))
              : null,
          risk: (["low", "medium", "high"].includes(String(idea.risk))
            ? idea.risk
            : "medium") as TaxReductionIdea["risk"],
          legalNote: String(idea.legalNote ?? "Confirm with tax agent.")
        }));
      }
      if (Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0) {
        recommendations = parsed.recommendations.map(String).slice(0, 8);
      }
    }
  } catch {
    /* keep deterministic fallbacks */
  }

  const result: TaxAdviseResult = {
    counted: {
      sstOutput: pack.sst.outputTax,
      sstInput: pack.sst.inputTax,
      sstNet: pack.sst.netPayable,
      taxableSales: pack.schedules.taxableSales.total,
      taxablePurchases: pack.schedules.taxablePurchases.total,
      estimatedProfit: pl.profit,
      estimatedCorporateTax: corp.tax,
      corporateTaxRatePct: corp.ratePct
    },
    audit: { score, findings },
    reductionIdeas,
    recommendations,
    summary,
    disclaimer: DISCLAIMER,
    aiUsed
  };

  await db.aiSuggestion.create({
    data: {
      companyId: input.companyId,
      type: "TAX_ADVISORY",
      status: "PROPOSED",
      confidence: score,
      payload: result as object
    }
  });

  if (input.actorUserId) {
    await writeAuditEvent({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      entityType: "Company",
      entityId: input.companyId,
      action: "AI_TAX_ADVISE",
      afterJson: {
        score,
        sstNet: result.counted.sstNet,
        corporateTax: result.counted.estimatedCorporateTax,
        aiUsed
      }
    });
  }

  return result;
}
