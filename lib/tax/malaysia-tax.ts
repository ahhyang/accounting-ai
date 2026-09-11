import { round2 } from "@/lib/accounting/helpers";

/**
 * Malaysia corporate tax knowledge + deterministic calculators.
 *
 * Distilled from the Grant Thornton Malaysia "Tax Deductible Expenses" deck
 * (8 Aug 2023) plus the Income Tax Act 1967 framework it relies on:
 *  - S33(1) general deduction test, S39 disallowed expenses
 *  - Entertainment deduction matrix (PR 4/2015): 100% / 50% / 0%
 *  - Capital allowances vs revenue expenditure
 *  - Double deductions / special deductions and S34(6) social expenditure
 *  - CP204 estimate-of-tax-payable mechanics (s.107C)
 *
 * Advisory only — always confirm figures with a licensed tax agent before filing.
 */

export type TaxBand = {
  label: string;
  ratePct: number;
  taxable: number;
  tax: number;
};

export type CompanyTaxEstimate = {
  chargeableIncome: number;
  tax: number;
  effectiveRatePct: number;
  bands: TaxBand[];
  smeRateApplied: boolean;
  ya: number;
  basis: string;
};

const fmtRm = (n: number) =>
  `RM${Math.round(n).toLocaleString("en-MY")}`;

/** Malaysian year of assessment — calendar year for a Dec year-end company. */
export function currentYa(date = new Date()): number {
  return date.getFullYear();
}

/**
 * SME preferential rate eligibility: paid-up capital ≤ RM2.5m AND
 * annual gross business income ≤ RM50m (Para 2A Sch 1 ITA / PG 1/2024).
 */
export function isSmeEligible(input: {
  paidUpCapitalRm?: number;
  grossIncomeRm?: number;
}): boolean {
  const capital = input.paidUpCapitalRm ?? 0;
  const gross = input.grossIncomeRm ?? 0;
  return capital <= 2_500_000 && gross <= 50_000_000;
}

type Tier = { upTo: number; ratePct: number };

function applyBands(ci: number, tiers: Tier[]): { bands: TaxBand[]; tax: number } {
  const bands: TaxBand[] = [];
  let lower = 0;
  let tax = 0;
  for (const t of tiers) {
    if (ci <= lower) break;
    const taxable = Math.min(ci, t.upTo) - lower;
    if (taxable <= 0) continue;
    const bandTax = round2(taxable * (t.ratePct / 100));
    const upperLabel = Number.isFinite(t.upTo) ? fmtRm(t.upTo) : "above";
    bands.push({
      label: `${fmtRm(lower)} – ${upperLabel}`,
      ratePct: t.ratePct,
      taxable: round2(taxable),
      tax: bandTax
    });
    tax += bandTax;
    lower = t.upTo;
  }
  return { bands, tax: round2(tax) };
}

/**
 * Resident company corporate tax.
 *  - SME YA2024+: 15% on first RM150k, 17% on next RM450k, 24% above RM600k.
 *  - SME up to YA2023: 17% on first RM500k, 24% above.
 *  - Non-SME / large company: 24% flat.
 */
export function estimateCompanyTax(input: {
  chargeableIncome: number;
  ya?: number;
  smeEligible?: boolean;
}): CompanyTaxEstimate {
  const ci = Math.max(0, round2(input.chargeableIncome));
  const ya = input.ya ?? currentYa();
  const sme = input.smeEligible ?? true;

  let tiers: Tier[];
  let basis: string;
  if (!sme) {
    tiers = [{ upTo: Number.POSITIVE_INFINITY, ratePct: 24 }];
    basis = "Standard resident company rate 24% (SME tier not applicable).";
  } else if (ya >= 2024) {
    tiers = [
      { upTo: 150_000, ratePct: 15 },
      { upTo: 600_000, ratePct: 17 },
      { upTo: Number.POSITIVE_INFINITY, ratePct: 24 }
    ];
    basis =
      "SME rate from YA2024: 15% on first RM150,000, 17% on RM150,001–RM600,000, 24% above RM600,000.";
  } else {
    tiers = [
      { upTo: 500_000, ratePct: 17 },
      { upTo: Number.POSITIVE_INFINITY, ratePct: 24 }
    ];
    basis = "SME rate up to YA2023: 17% on first RM500,000, 24% above.";
  }

  const { bands, tax } = applyBands(ci, tiers);
  const effectiveRatePct = ci > 0 ? round2((tax / ci) * 100) : 0;
  return { chargeableIncome: ci, tax, effectiveRatePct, bands, smeRateApplied: sme, ya, basis };
}

/** Backwards-compatible helper used by the AI advisor. */
export function estimateMsCompanyTax(profit: number): {
  chargeable: number;
  tax: number;
  ratePct: number;
} {
  const est = estimateCompanyTax({ chargeableIncome: profit });
  return { chargeable: est.chargeableIncome, tax: est.tax, ratePct: est.effectiveRatePct };
}

/**
 * CP204 (estimate of tax payable) planner — s.107C.
 *
 * Cash-flow-minimising but penalty-safe estimate. Under-estimating the actual
 * tax payable by more than 30% triggers a 10% penalty on the shortfall, so the
 * safe floor is ~70% of expected actual tax. Over-estimating locks up cash and
 * refunds are slow, so we recommend the safe floor as the target.
 */
export function planCp204(input: { estimatedTaxPayable: number }): {
  minSafeEstimate: number;
  recommendedEstimate: number;
  monthlyInstalment: number;
  penaltyThreshold: number;
  notes: string[];
} {
  const tax = Math.max(0, round2(input.estimatedTaxPayable));
  const minSafeEstimate = round2(tax * 0.7);
  const recommendedEstimate = minSafeEstimate;
  const monthlyInstalment = round2(recommendedEstimate / 12);
  return {
    minSafeEstimate,
    recommendedEstimate,
    monthlyInstalment,
    penaltyThreshold: round2(tax * 0.3),
    notes: [
      "CP204 must be submitted at least 30 days before the basis period begins; revise via CP204A (6th, 9th, 11th month).",
      "Under-estimating actual tax by more than 30% attracts a 10% penalty on the shortfall (s.107C).",
      `Aim to keep the estimate at or above ${fmtRm(minSafeEstimate)} (~70% of expected tax) to stay penalty-safe.`,
      "Over-estimating ties up working capital and refunds are slow — review the estimate as profit becomes clearer."
    ]
  };
}

// ---------------------------------------------------------------------------
// Entertainment deduction matrix (PR 4/2015 / S39(1)(l) provisos)
// ---------------------------------------------------------------------------

export const ENTERTAINMENT_FULL = [
  "Employees / staff (annual trip within Malaysia)",
  "Entertainment in the ordinary course of business",
  "Promotional samples of the business's products",
  "Promotional gifts at trade fairs/exhibitions OUTSIDE Malaysia",
  "Cultural/sporting events open to the public to promote the business",
  "Promotional gifts WITHIN Malaysia bearing the business logo",
  "Food & drink for a new product launch",
  "Redemption/discount/cash/meal/concert vouchers on purchases",
  "Redemption of gifts under an accumulated-points scheme",
  'Free gifts for purchases exceeding a set amount',
  "Lucky draw prizes to customers for purchases",
  "Incentive trips to dealers for achieving sales targets"
];

export const ENTERTAINMENT_HALF = [
  "Existing customers",
  "Existing suppliers",
  "Gifts to a new outlet (as per PR 4/2015 summary)"
];

export const ENTERTAINMENT_NONE = [
  "Potential customers / clients",
  "Government",
  "Employees of a related company",
  "Business associates",
  "Tax agents / auditors / bankers",
  "Festive hampers or gifts",
  "Wedding gifts",
  "Annual general meeting (AGM) expenses",
  "Cash contributions"
];

// ---------------------------------------------------------------------------
// Capital allowances (Sch 2 / 3 ITA) — common asset classes
// ---------------------------------------------------------------------------

export const CAPITAL_ALLOWANCE_RATES: Array<{
  assetClass: string;
  initialPct: number;
  annualPct: number;
}> = [
  { assetClass: "Plant & machinery (general)", initialPct: 20, annualPct: 14 },
  { assetClass: "Heavy machinery / motor vehicles (commercial)", initialPct: 20, annualPct: 20 },
  { assetClass: "Office equipment, furniture & fittings", initialPct: 20, annualPct: 10 },
  { assetClass: "Computers & software", initialPct: 20, annualPct: 40 }
];

// ---------------------------------------------------------------------------
// Double / special deductions & S34(6) allowances (from the deck)
// ---------------------------------------------------------------------------

export const DOUBLE_DEDUCTIONS: Array<{ title: string; basis: string; how: string }> = [
  {
    title: "Research & development",
    basis: "S34(7)/S35 & gazette orders",
    how: "Book approved R&D and qualifying scientific research costs; keep approvals and technical write-ups."
  },
  {
    title: "Approved training",
    basis: "Double deduction gazette order",
    how: "Register training with HRD Corp / approved institutions and claim DD on approved training costs."
  },
  {
    title: "Promotion of exports",
    basis: "S41 / gazette orders (manufacturing, agriculture, services)",
    how: "Claim DD on overseas advertising, export market research, trade fairs and export samples."
  },
  {
    title: "Advertising of Malaysian brand-name goods",
    basis: "Gazette order",
    how: "DD on advertising incurred in Malaysia promoting an approved Malaysian brand."
  },
  {
    title: "Certification (ISO / quality / halal)",
    basis: "Gazette order",
    how: "Claim DD on costs to obtain quality-system or halal certification."
  },
  {
    title: "Structured Internship Programme (SIP)",
    basis: "TalentCorp-approved SIP, gazette order",
    how: "DD on allowances/costs for students under an approved structured internship."
  },
  {
    title: "Employment of disabled persons",
    basis: "PR 3/2019",
    how: "DD on remuneration paid to employees certified by the SOCSO Medical Board."
  },
  {
    title: "Senior citizens / ex-convicts / parolees / ex-drug dependants",
    basis: "YA2021–YA2025 gazette order",
    how: "DD on monthly remuneration ≤ RM4,000, full-time, not a relative of the employer/director/shareholder."
  },
  {
    title: "Freight & export credit insurance (local insurers)",
    basis: "Gazette orders",
    how: "DD on cargo insurance with locally incorporated insurers and qualifying export freight."
  },
  {
    title: "Child care centre / child care allowance",
    basis: "S34(6) & gazette orders",
    how: "Deduction on provision & maintenance of a child care centre for employees, or child care allowance."
  }
];

/** S39 disallowed / restricted — common add-back risks. */
export const DISALLOWED_EXPENSES: Array<{ title: string; detail: string; basis: string }> = [
  {
    title: "Domestic or private expenses",
    detail: "Personal expenses (house, family, food, clothing) and owner drawings are added back.",
    basis: "S39(1)(a)–(b)"
  },
  {
    title: "Capital expenditure expensed off",
    detail: "Capital items (renovation, furniture, equipment) charged to P&L are non-deductible — claim capital allowances instead.",
    basis: "S39(1)(c) + Sch 2/3"
  },
  {
    title: "Depreciation & loss on disposal of fixed assets",
    detail: "Accounting depreciation is added back; replace with capital allowances.",
    basis: "Sch 2/3"
  },
  {
    title: "Entertainment (partial/complete disallowance)",
    detail: "Only 100% / 50% / 0% is deductible depending on the purpose (see entertainment matrix under PR 4/2015).",
    basis: "S39(1)(l)"
  },
  {
    title: "Motor vehicle rental restriction",
    detail: "Rental of non-commercial/passenger cars capped at RM100,000 per vehicle (RM50,000 if cost exceeds RM150,000).",
    basis: "S39(1)(k)"
  },
  {
    title: "Leave passage",
    detail: "Leave passage (within or outside Malaysia) is not deductible.",
    basis: "S39(1)(m)"
  },
  {
    title: "Withholding-tax non-compliance",
    detail: "Expenses tied to unpaid/underpaid WHT on non-resident royalty, interest, technical fees or contract payments are disallowed.",
    basis: "S39(1)(j)"
  },
  {
    title: "Fines / penalties for breaking the law",
    detail: "Fines and related legal costs for non-trading law breaches are not deductible.",
    basis: "S39(1)"
  },
  {
    title: "Unapproved pension / provident funds",
    detail: "Payments to unapproved schemes or funds are disallowed.",
    basis: "S39(1)(d)"
  }
];

/** Allowable deduction via PU orders / S34(6) — often missed. */
export const ALLOWABLE_ITEMS: Array<{ title: string; detail: string; basis: string }> = [
  {
    title: "Tax filing fee",
    detail: "Fee paid to an approved tax agent to prepare returns and CP204 is deductible.",
    basis: "PU Order 162/2020 (WEF YA2022)"
  },
  {
    title: "Company secretarial fee",
    detail: "Secretarial fee paid to a Companies Act 2016 secretary is deductible.",
    basis: "PU Order 471/2021 (WEF YA2022)"
  },
  {
    title: "Cash donation to approved bodies",
    detail: "Cash donations to government/approved charitable institutions are deductible up to 10% of aggregate income (company).",
    basis: "S44(6)"
  },
  {
    title: "Social / community expenditure",
    detail: "Includes disabled-employee equipment, public library contributions (≤ RM100,000), approved charity/community projects and child care centres.",
    basis: "S34(6)"
  },
  {
    title: "Sponsorship of arts, culture & heritage",
    detail: "Approved local activities up to RM1,000,000/year; foreign activities up to RM300,000/year.",
    basis: "S34(6)(k) & PR 2/2021"
  }
];

// ---------------------------------------------------------------------------
// Deterministic expense review
// ---------------------------------------------------------------------------

export type TaxFinding = {
  severity: "high" | "medium" | "low" | "info";
  code: string;
  title: string;
  detail: string;
  estimatedAddBackRm?: number;
  legalBasis: string;
};

/**
 * Review posted expense balances for likely add-backs and missed deductions.
 * Codes follow the default Malaysia COA in lib/accounting/default-coa.ts.
 */
export function reviewExpenseDeductibility(input: {
  expenseByCode: Record<string, number>;
  aggregateIncome?: number;
}): TaxFinding[] {
  const findings: TaxFinding[] = [];
  const bal = (code: string) => round2(input.expenseByCode[code] ?? 0);

  const depreciation = bal("5900");
  if (depreciation > 0) {
    findings.push({
      severity: "medium",
      code: "ADD_BACK_DEPRECIATION",
      title: "Depreciation added back",
      detail: `Accounting depreciation of RM${depreciation.toFixed(2)} is non-deductible; claim capital allowances on the same assets.`,
      estimatedAddBackRm: depreciation,
      legalBasis: "Sch 2/3 ITA 1967"
    });
  }

  const marketing = bal("5400");
  if (marketing > 0) {
    findings.push({
      severity: "low",
      code: "CHECK_ENTERTAINMENT",
      title: "Split entertainment from marketing",
      detail: `RM${marketing.toFixed(2)} in marketing may include client entertainment. Only 50% is deductible for existing customers/suppliers and 0% for potential customers, government, related-company staff or business associates.`,
      legalBasis: "S39(1)(l) / PR 4/2015"
    });
  }

  const transport = bal("5500");
  if (transport > 0) {
    findings.push({
      severity: "low",
      code: "CHECK_VEHICLE_RENTAL",
      title: "Motor vehicle rental cap",
      detail: `Transportation/hire of RM${transport.toFixed(2)}: rental of passenger cars is capped at RM100,000 per vehicle (RM50,000 if cost > RM150,000).`,
      legalBasis: "S39(1)(k)"
    });
  }

  const office = bal("5600");
  if (office > 0) {
    findings.push({
      severity: "info",
      code: "CHECK_CAPITAL_IN_OPEX",
      title: "Capital items inside office expenses",
      detail: `Office expenses of RM${office.toFixed(2)} may contain capital purchases (furniture, equipment, renovations) that must be capitalised and claimed via capital allowances.`,
      legalBasis: "S39(1)(c) + Sch 2/3"
    });
  }

  const professional = bal("5800");
  if (professional > 0) {
    findings.push({
      severity: "info",
      code: "PROFESSIONAL_FEES",
      title: "Professional fee split",
      detail: `Professional fees of RM${professional.toFixed(2)}: tax filing and secretarial fees are deductible (PU Orders); fees to acquire an asset or source of income are capital.`,
      legalBasis: "PU 162/2020, PU 471/2021, S33(1)"
    });
  }

  findings.push({
    severity: "info",
    code: "DISCARD_FINANCE_COSTS",
    title: "Ensure WHT-compliant payments",
    detail:
      "Confirm withholding tax on any non-resident royalty, interest, technical fee or contract payment has been remitted — otherwise the expense is disallowed.",
    legalBasis: "S39(1)(j)"
  });

  return findings;
}

/** Compact knowledge text injected into the AI prompt. */
export const TAX_KNOWLEDGE_TEXT = `
MALAYSIAN CORPORATE TAX KNOWLEDGE (ITA 1967)

GENERAL DEDUCTION — S33(1): deductible only if outgoings/expenses are (a) wholly and exclusively,
(b) incurred (legal liability, not a provision), (c) in the production of gross income, (d) revenue in
nature, and (e) not prohibited by S39. Pre-commencement expenses are not deductible; capital
expenditure is not deductible (claim capital allowances / IBA).

DISALLOWED — S39: domestic/private expenses; capital withdrawn; payments to unapproved funds;
WHT non-compliance (non-resident royalty, interest, technical fee, contract payment); passenger
motor-vehicle rental capped at RM100,000 (RM50,000 if vehicle cost > RM150,000); leave passage;
entertainment (partial); fines for breaking the law.

ENTERTAINMENT (PR 4/2015): 100% — staff, ordinary course of business, samples, logo gifts in
Malaysia, overseas trade-fair gifts, public cultural/sporting events, new-product launch, vouchers,
points redemption, lucky draws, dealer incentive trips. 50% — existing customers and suppliers.
0% — potential customers, government, related-company staff, business associates, tax
agents/auditors/bankers, festive hampers, wedding gifts, AGM, cash contributions.

CAPITAL ALLOWANCES: P&M general IA 20% + AA 14%; heavy machinery/commercial vehicles 20%+20%;
office equipment/furniture 20%+10%; computers/software 20%+40%. No CA before business commencement.

DOUBLE / SPECIAL DEDUCTIONS: R&D; approved training; export promotion; advertising Malaysian brand
goods; ISO/halal certification; Structured Internship Programme; disabled employees (PR 3/2019);
senior citizens/ex-convicts/parolees/ex-drug dependants (YA2021–YA2025, remuneration ≤ RM4,000/mth,
full-time, not a relative); freight & export credit insurance with local insurers; child care centre /
child care allowance; PTPTN repayment on behalf of employees.

ALLOWABLE VIA PU ORDERS: tax filing fee (PU 162/2020) and company secretarial fee (PU 471/2021).
S34(6): disabled-employee equipment, public library contributions (≤ RM100k), approved charity/
community projects, child care centres; sponsorship of approved local arts/culture/heritage up to
RM1,000,000 (foreign RM300,000).

DONATIONS (S44(6)): cash to government/approved charitable institutions, capped at 10% of
aggregate income for a company (YA2020 onwards).

CORPORATE TAX RATES: SME (paid-up capital ≤ RM2.5m, gross income ≤ RM50m): YA2024+ = 15% on first
RM150,000, 17% on RM150,001–RM600,000, 24% above RM600,000 (up to YA2023: 17% first RM500,000,
24% above). Non-SME: 24%.

CP204 (s.107C): estimate of tax payable filed ≥30 days before basis period; revisions (CP204A) in
the 6th, 9th and 11th month. Under-estimating actual tax by more than 30% attracts a 10% penalty on
the shortfall. Over-estimating locks up cash with slow refunds — target the penalty-safe floor
(~70–100% of expected tax) to legally minimise cash tax paid early.

MINIMUM-TAX PLAYBOOK (legal): maximise allowable revenue deductions; claim all capital allowances and
double deductions; defer non-cash/optional spend where timing helps; split entertainment correctly;
avoid add-backs (private expenses, capital in opex, WHT defaults); use CP204 timing; consider
incentives (pioneer status, investment tax allowance, reinvestment allowance, automation/Green
investment tax allowance) only where genuinely eligible. Never evade tax, hide income or use fake
invoices.
`.trim();
