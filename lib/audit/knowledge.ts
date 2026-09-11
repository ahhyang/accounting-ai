import { round2 } from "@/lib/accounting/helpers";

/**
 * Malaysian statutory audit knowledge + deterministic calculators.
 *
 * Framework (researched Aug 2026):
 *  - Companies Act 2016 (SSM): appointment, duties, powers, reporting of
 *    irregularities/fraud; auditor must be approved by the Ministry of Finance
 *    and registered with MIA.
 *  - Malaysian Approved Standards on Auditing (MASA) = ISA adopted by MIA,
 *    including ISA 240 (fraud), 315 (risk), 320 (materiality), 330 (responses),
 *    450 (misstatements), 500 (evidence), 520 (analytical), 540 (estimates),
 *    550 (related parties), 560 (subsequent events), 570 (going concern),
 *    580 (representations), 700/701/705/706 (reports).
 *  - ISQM 1/2 quality management; MIA By-Laws (IESBA ethics, independence).
 *  - Reporting frameworks: MFRS (publicly accountable) or MPERS (private entities).
 *  - Audit exemption: private companies below the SSM phased revenue thresholds
 *    (Practice Directive, currently RM3m for FY beginning on/after 1 Jan 2025),
 *    dormant/zero-revenue companies, and where shareholders pass the exemption
 *    resolution — subject to the current SSM Practice Directive.
 *
 * This is decision support only. The engagement partner remains responsible for
 * the opinion; AI output must be reviewed and is not an audit opinion.
 */

export const AUDIT_PHASES = [
  {
    phase: "I. Engagement & planning",
    tasks: [
      "Client/engagement acceptance & independence confirmation (MIA By-Laws, ISQM 1)",
      "Signed engagement letter (scope, responsibilities, fees)",
      "Understand the entity, industry, legal environment and reporting framework (MPERS/MFRS)",
      "Determine overall and performance materiality (ISA 320)",
      "Document audit strategy and timeline"
    ]
  },
  {
    phase: "II. Risk assessment & internal control",
    tasks: [
      "Identify and assess risks of material misstatement (ISA 315)",
      "Understand the IT environment and key controls",
      "Fraud risk assessment incl. management override (ISA 240)",
      "Identify related parties and significant transactions (ISA 550)",
      "Assess going-concern indicators (ISA 570)"
    ]
  },
  {
    phase: "III. Substantive testing",
    tasks: [
      "Test of detail on balances and transactions (ISA 500/330)",
      "External confirmations: bank, receivables (ISA 505)",
      "Substantive analytical procedures (ISA 520)",
      "Inventory existence and valuation; fixed asset verification",
      "Revenue cut-off and occurrence testing",
      "Tax and WHT compliance testing; estimates (ISA 540)"
    ]
  },
  {
    phase: "IV. Completion",
    tasks: [
      "Aggregate misstatements vs materiality (ISA 450)",
      "Subsequent events review up to report date (ISA 560)",
      "Going-concern conclusion (ISA 570)",
      "Written representations from management (ISA 580)",
      "Related-party and legal/compliance review; engagement quality review (ISQM 2)"
    ]
  },
  {
    phase: "V. Report issuance",
    tasks: [
      "Form opinion on true and fair view",
      "Determine report type (unmodified/qualified/adverse/disclaimer) (ISA 705)",
      "Key Audit Matters where applicable (ISA 701)",
      "Sign report; directors file with SSM with audited financial statements"
    ]
  }
];

export const ASSERTIONS = {
  transactions: ["Occurrence", "Completeness", "Accuracy", "Cut-off", "Classification"],
  balances: ["Existence", "Rights & obligations", "Completeness", "Valuation", "Presentation & disclosure"]
};

export type MaterialityInput = {
  revenue: number;
  totalAssets: number;
  netAssets: number;
  profitBeforeTax: number;
};

export type MaterialityResult = {
  benchmark: string;
  benchmarkAmount: number;
  benchmarkPct: number;
  overallMateriality: number;
  performanceMateriality: number;
  clearlyTrivial: number;
  rationale: string;
  candidates: Array<{ benchmark: string; amount: number; pct: number; materiality: number }>;
};

/**
 * ISA 320 materiality. Common benchmark percentages for commercial entities.
 * Performance materiality = 65% of overall; clearly trivial = 5% of overall.
 */
export function computeMateriality(input: MaterialityInput): MaterialityResult {
  const candidates = [
    { benchmark: "Profit before tax", amount: round2(input.profitBeforeTax), pct: 5 },
    { benchmark: "Total revenue", amount: round2(input.revenue), pct: 1 },
    { benchmark: "Total assets", amount: round2(input.totalAssets), pct: 1 },
    { benchmark: "Net assets", amount: round2(Math.abs(input.netAssets)), pct: 2 }
  ].map((c) => ({ ...c, materiality: round2((c.amount * c.pct) / 100) }));

  // Prefer PBT when profitable; otherwise fall back to revenue/assets/net assets.
  const preferred =
    input.profitBeforeTax > 0
      ? candidates[0]
      : candidates.reduce((best, c) => (c.materiality > best.materiality ? c : best), candidates[1]);

  const performanceMateriality = round2(preferred.materiality * 0.65);
  const clearlyTrivial = round2(preferred.materiality * 0.05);

  return {
    benchmark: preferred.benchmark,
    benchmarkAmount: preferred.amount,
    benchmarkPct: preferred.pct,
    overallMateriality: preferred.materiality,
    performanceMateriality,
    clearlyTrivial,
    rationale:
      input.profitBeforeTax > 0
        ? "Pre-tax profit benchmark (5%) as the entity is profit-oriented."
        : "Profit is nil/negative, so a revenue/asset-based benchmark is used per ISA 320 guidance.",
    candidates
  };
}

export type AuditReadinessItem = {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export type AuditReadiness = {
  score: number;
  items: AuditReadinessItem[];
};

/** Deterministic audit-readiness checks from the live ledger and document pipeline. */
export function computeAuditReadiness(input: {
  tbBalanced: boolean;
  docsPending: number;
  lowConfidenceDocs: number;
  duplicateBillGroups: number;
  bankUnmatched: number;
  periodClosed: boolean;
  postPeriodJournals: number;
  goingConcernFlags: number;
}): AuditReadiness {
  const items: AuditReadinessItem[] = [
    {
      key: "tb_balanced",
      label: "Trial balance is balanced",
      status: input.tbBalanced ? "pass" : "fail",
      detail: input.tbBalanced
        ? "Total debits equal total credits."
        : "Trial balance is out of balance — resolve before fieldwork."
    },
    {
      key: "docs_complete",
      label: "All source documents processed",
      status: input.docsPending === 0 ? "pass" : input.docsPending <= 5 ? "warn" : "fail",
      detail: `${input.docsPending} document(s) still unposted/in review.`
    },
    {
      key: "low_confidence",
      label: "AI extraction reviewed",
      status: input.lowConfidenceDocs === 0 ? "pass" : "warn",
      detail: `${input.lowConfidenceDocs} low-confidence document(s) need human review.`
    },
    {
      key: "duplicates",
      label: "No duplicate purchases",
      status: input.duplicateBillGroups === 0 ? "pass" : "warn",
      detail: `${input.duplicateBillGroups} potential duplicate bill group(s).`
    },
    {
      key: "bank_recon",
      label: "Bank fully reconciled",
      status: input.bankUnmatched === 0 ? "pass" : input.bankUnmatched <= 3 ? "warn" : "fail",
      detail: `${input.bankUnmatched} unreconciled bank transaction(s).`
    },
    {
      key: "period",
      label: "Period closed / locked",
      status: input.periodClosed ? "pass" : "warn",
      detail: input.periodClosed
        ? "Accounting period is closed."
        : "Period still open — lock before issuing the report."
    },
    {
      key: "post_period",
      label: "No back-dated postings after close",
      status: input.postPeriodJournals === 0 ? "pass" : "warn",
      detail: `${input.postPeriodJournals} journal(s) posted with dates in closed periods.`
    },
    {
      key: "going_concern",
      label: "Going-concern indicators",
      status: input.goingConcernFlags === 0 ? "pass" : input.goingConcernFlags === 1 ? "warn" : "fail",
      detail:
        input.goingConcernFlags === 0
          ? "No automated going-concern red flags."
          : `${input.goingConcernFlags} going-concern indicator(s) — apply ISA 570 procedures.`
    }
  ];

  const weight = { pass: 1, warn: 0.5, fail: 0 };
  const score = Math.round(
    (items.reduce((s, i) => s + weight[i.status], 0) / items.length) * 100
  );

  return { score, items };
}

/** Compact knowledge text injected into the AI audit prompt. */
export const AUDIT_KNOWLEDGE_TEXT = `
MALAYSIAN STATUTORY AUDIT KNOWLEDGE

LEGAL FRAMEWORK: Companies Act 2016 (administered by SSM). Auditors must be approved by the
Ministry of Finance and registered with the Malaysian Institute of Accountants (MIA). The auditor
forms an independent opinion on whether the financial statements give a TRUE AND FAIR VIEW and
comply with the Act and the applicable reporting framework (MFRS for publicly accountable entities,
MPERS for private entities). The auditor has a duty to report irregularities/fraud and has a right of
access to accounting records. MIA By-Laws (IESBA Code) govern ethics, independence and quality.

STANDARDS: Malaysian Approved Standards on Auditing (MASA = ISA as adopted by MIA), plus ISQM 1/2
(quality management). Key standards: ISA 240 fraud, ISA 315 risk assessment, ISA 320 materiality,
ISA 330 responses, ISA 450 misstatements, ISA 500 evidence, ISA 505 confirmations, ISA 520
analytical, ISA 540 estimates, ISA 550 related parties, ISA 560 subsequent events, ISA 570 going
concern, ISA 580 representations, ISA 700/701/705/706 reporting.

AUDIT PROCESS (5 PHASES): I. Engagement & planning (acceptance, independence, engagement letter,
understanding entity, materiality, strategy); II. Risk assessment & internal control (ISA 315, IT
controls, fraud/management override, related parties, going concern); III. Substantive testing
(detail tests, external confirmations, analytical procedures, inventory/FA, revenue cut-off, tax);
IV. Completion (aggregate misstatements, subsequent events, going concern, written representations,
EQ review); V. Report issuance (opinion type, KAM, sign, directors file with SSM).

MATERIALITY (ISA 320): benchmarks — PBT 5%, revenue 0.5–1%, total assets 1–2%, net assets 2–5%,
expenses 1%. Performance materiality typically 50–75% of overall. Misstatements below the clearly
trivial threshold need not be accumulated.

ASSERTIONS: transactions — occurrence, completeness, accuracy, cut-off, classification; balances —
existence, rights & obligations, completeness, valuation, presentation.

REPORT TYPES (ISA 705): unmodified (clean); qualified (material but not pervasive); adverse (material
and pervasive misstatement); disclaimer (unable to obtain sufficient evidence). Key Audit Matters are
reported for listed entities (ISA 701). Going-concern uncertainty is disclosed under ISA 570.

AUDIT EXEMPTION: certain private companies may be exempt if below the SSM phased revenue thresholds
(currently RM3 million for financial years beginning on or after 1 January 2025, phasing upward),
where dormant/zero-revenue, or where the shareholders pass an exemption resolution — always confirmed
against the current SSM Practice Directive.

COMMON SME RISK AREAS: revenue recognition and cut-off; management override of controls; cash
misappropriation; fictitious or duplicate suppliers/purchases; related-party transactions (ISA 550);
inventory existence/valuation; receivables recoverability and credit notes; capital vs revenue
expenditure; WHT compliance on non-resident payments; tax provisions and deferred tax; going concern;
subsequent events; estimates (doubtful debts, depreciation, accruals); completeness of liabilities.

AI OUTPUT IS DECISION SUPPORT ONLY. It is NOT an audit opinion and must be reviewed by the engagement
partner against the Standards and the Companies Act 2016.
`.trim();
