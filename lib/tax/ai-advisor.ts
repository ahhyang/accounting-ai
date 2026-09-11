import { db } from "@/lib/db";
import { round2 } from "@/lib/accounting/helpers";
import { callOpenRouter } from "@/lib/ai/openrouter";
import { writeAuditEvent } from "@/lib/audit/log";
import { getSstTaxPack } from "@/lib/tax/sst-summary";
import {
  estimateCompanyTax,
  planCp204,
  reviewExpenseDeductibility,
  DOUBLE_DEDUCTIONS,
  CAPITAL_ALLOWANCE_RATES,
  TAX_KNOWLEDGE_TEXT,
  type TaxBand,
  type TaxFinding
} from "@/lib/tax/malaysia-tax";

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

export type MinimumTaxStrategy = {
  title: string;
  action: string;
  legalBasis: string;
  estimatedSavingRm: number | null;
  risk: "low" | "medium" | "high";
};

export type MinimumTaxPlan = {
  summary: string;
  targetEstimatedTax: number;
  strategies: MinimumTaxStrategy[];
  doubleDeductions: Array<{ title: string; basis: string; how: string }>;
  capitalAllowanceRates: Array<{ assetClass: string; initialPct: number; annualPct: number }>;
  disallowanceRisks: TaxFinding[];
  cp204: {
    minSafeEstimate: number;
    recommendedEstimate: number;
    monthlyInstalment: number;
    penaltyThreshold: number;
    notes: string[];
  };
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
    taxBands: TaxBand[];
    smeRateApplied: boolean;
    effectiveRatePct: number;
    cp204SafeEstimate: number;
  };
  audit: {
    score: number;
    findings: TaxAuditFinding[];
  };
  reductionIdeas: TaxReductionIdea[];
  minimumTaxPlan: MinimumTaxPlan;
  recommendations: string[];
  summary: string;
  disclaimer: string;
  aiUsed: boolean;
};

const DISCLAIMER =
  "Advisory only — not tax advice. Confirm with a licensed Malaysian tax agent / LHDN rules before acting.";

/** SME company tax estimate (kept for backwards compatibility). */
export function estimateMsCompanyTax(profit: number): {
  chargeable: number;
  tax: number;
  ratePct: number;
} {
  const est = estimateCompanyTax({ chargeableIncome: profit });
  return { chargeable: est.chargeableIncome, tax: est.tax, ratePct: est.effectiveRatePct };
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
  minimumTaxPlan?: { strategies?: MinimumTaxStrategy[]; summary?: string };
  summary?: string;
} | null {
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned) as {
      reductionIdeas?: TaxReductionIdea[];
      recommendations?: string[];
      minimumTaxPlan?: { strategies?: MinimumTaxStrategy[]; summary?: string };
      summary?: string;
    };
  } catch {
    return null;
  }
}

function normalizeRisk(value: unknown): MinimumTaxStrategy["risk"] {
  const v = String(value ?? "").toLowerCase();
  return v === "low" || v === "medium" || v === "high" ? v : "medium";
}

function fallbackMinimumTaxStrategies(input: {
  expenseByCode: Record<string, number>;
  marginalRatePct: number;
  disallowanceRisks: TaxFinding[];
}): MinimumTaxStrategy[] {
  const strategies: MinimumTaxStrategy[] = [];
  const rate = input.marginalRatePct > 0 ? input.marginalRatePct / 100 : 0.17;

  for (const dd of DOUBLE_DEDUCTIONS.slice(0, 3)) {
    strategies.push({
      title: dd.title,
      action: `Claim double deduction — ${dd.how}`,
      legalBasis: dd.basis,
      estimatedSavingRm: null,
      risk: "low"
    });
  }

  const dep = round2(input.expenseByCode["5900"] ?? 0);
  if (dep > 0) {
    strategies.push({
      title: "Swap depreciation add-back for capital allowances",
      action: `RM${dep.toFixed(2)} of accounting depreciation is added back. Claim capital allowances (P&M IA 20% + AA 14%) on qualifying assets to shelter the same profit.`,
      legalBasis: "Sch 2/3 ITA 1967",
      estimatedSavingRm: round2(dep * rate),
      risk: "low"
    });
  }

  strategies.push({
    title: "Split entertainment for maximum deduction",
    action:
      "Reclassify client entertainment: 100% for staff and promotional items, 50% for existing customers/suppliers, 0% for potential customers and business associates.",
    legalBasis: "S39(1)(l) / PR 4/2015",
    estimatedSavingRm: null,
    risk: "low"
  });

  strategies.push({
    title: "Time the CP204 estimate to keep cash in the business",
    action:
      "File CP204 near the penalty-safe floor (~70% of expected tax) and revise via CP204A as profit becomes clearer — avoids the 10% under-estimation penalty without over-paying early.",
    legalBasis: "s.107C ITA 1967",
    estimatedSavingRm: null,
    risk: "medium"
  });

  strategies.push({
    title: "Convert CSR spend into deductions",
    action:
      "Route approved giving through S44(6) cash donations (up to 10% of aggregate income) and S34(6) social/community expenditure so discretionary spend becomes deductible.",
    legalBasis: "S44(6), S34(6)",
    estimatedSavingRm: null,
    risk: "low"
  });

  if (input.disallowanceRisks.some((r) => r.severity === "high" || r.severity === "medium")) {
    strategies.push({
      title: "Clear add-back risks before year-end",
      action:
        "Fix the flagged add-backs (private expenses, capital in opex, WHT defaults, vehicle rental cap) — every ringgit added back is taxed at your marginal rate.",
      legalBasis: "S39 ITA 1967",
      estimatedSavingRm: null,
      risk: "low"
    });
  }

  return strategies.slice(0, 6);
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
  const corp = estimateCompanyTax({ chargeableIncome: pl.profit });
  const marginalRatePct = corp.bands.length ? corp.bands[corp.bands.length - 1].ratePct : 24;
  const disallowanceRisks = reviewExpenseDeductibility({
    expenseByCode: pl.expenseByCode,
    aggregateIncome: pl.revenue
  });
  const cp204 = planCp204({ estimatedTaxPayable: corp.tax });

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

  const minimumTaxPlan: MinimumTaxPlan = {
    summary: "",
    targetEstimatedTax: corp.tax,
    strategies: fallbackMinimumTaxStrategies({
      expenseByCode: pl.expenseByCode,
      marginalRatePct,
      disallowanceRisks
    }),
    doubleDeductions: DOUBLE_DEDUCTIONS,
    capitalAllowanceRates: CAPITAL_ALLOWANCE_RATES,
    disallowanceRisks,
    cp204
  };

  const systemPrompt = `You are a Malaysian corporate tax planner. Minimise tax LEGALLY (no evasion, no hiding income, no fake invoices).
${TAX_KNOWLEDGE_TEXT}

Return JSON only:
{
  "summary": "2-3 sentences on the tax position",
  "minimumTaxPlan": {
    "summary": "how to legally reach the lowest tax for this fact pattern",
    "strategies": [
      {
        "title": string,
        "action": string,
        "legalBasis": string,
        "estimatedSavingRm": number|null,
        "risk": "low"|"medium"|"high"
      }
    ]
  },
  "reductionIdeas": [
    { "title": string, "how": string, "estimatedSavingRm": number|null, "risk": "low"|"medium"|"high", "legalNote": string }
  ],
  "recommendations": ["actionable steps"]
}
Rules:
- Give 4 to 6 strategies ranked by rupees saved and ease of execution.
- Ground every strategy in a specific Malaysian provision (S33, S39, Sch 2/3, S34(6), S44(6), s.107C, PU orders).
- Use the supplied PL, expense codes and audit findings; reference the actual RM amounts.
- Keep estimatedSavingRm conservative or null.`;

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
    expenseByCode: pl.expenseByCode,
    companyTax: {
      chargeableIncome: corp.chargeableIncome,
      tax: corp.tax,
      effectiveRatePct: corp.effectiveRatePct,
      bands: corp.bands,
      smeRateApplied: corp.smeRateApplied,
      basis: corp.basis
    },
    cp204Plan: cp204,
    disallowanceRisks,
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
      if (parsed.minimumTaxPlan?.strategies && parsed.minimumTaxPlan.strategies.length >= 3) {
        minimumTaxPlan.strategies = parsed.minimumTaxPlan.strategies.slice(0, 6).map((s) => ({
          title: String(s.title ?? "Strategy"),
          action: String(s.action ?? ""),
          legalBasis: String(s.legalBasis ?? "Confirm with tax agent."),
          estimatedSavingRm:
            s.estimatedSavingRm != null && !Number.isNaN(Number(s.estimatedSavingRm))
              ? round2(Number(s.estimatedSavingRm))
              : null,
          risk: normalizeRisk(s.risk)
        }));
      }
      if (parsed.minimumTaxPlan?.summary) {
        minimumTaxPlan.summary = String(parsed.minimumTaxPlan.summary);
      }
    }
  } catch {
    /* keep deterministic fallbacks */
  }

  if (!minimumTaxPlan.summary) {
    minimumTaxPlan.summary =
      `Estimated tax is RM${corp.tax.toFixed(2)} on chargeable income RM${corp.chargeableIncome.toFixed(2)} ` +
      `(effective ${corp.effectiveRatePct}%). Claim every allowable deduction, capital allowance and double ` +
      `deduction, and time the CP204 estimate to the penalty-safe floor to legally minimise cash tax.`;
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
      corporateTaxRatePct: corp.effectiveRatePct,
      taxBands: corp.bands,
      smeRateApplied: corp.smeRateApplied,
      effectiveRatePct: corp.effectiveRatePct,
      cp204SafeEstimate: cp204.minSafeEstimate
    },
    audit: { score, findings },
    reductionIdeas,
    minimumTaxPlan,
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
