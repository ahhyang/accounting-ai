import {
  estimateCompanyTax,
  planCp204,
  reviewExpenseDeductibility,
  isSmeEligible
} from "../lib/tax/malaysia-tax";

function assert(name: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 0.005;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: got ${actual}, expected ${expected}`);
  if (!ok) process.exitCode = 1;
}

console.log("=== SME bands YA2025 ===");
const a = estimateCompanyTax({ chargeableIncome: 600_000, ya: 2025, smeEligible: true });
// 15% * 150k = 22,500 ; 17% * 450k = 76,500 => 99,000
assert("CE 600k SME tax", a.tax, 99_000);
assert("CE 600k effective %", a.effectiveRatePct, 16.5);
assert("CE 600k bands", a.bands.length, 2);

const b = estimateCompanyTax({ chargeableIncome: 1_000_000, ya: 2025, smeEligible: true });
// 99,000 + 24% * 400,000 = 195,000
assert("CE 1m SME tax", b.tax, 195_000);
assert("CE 1m bands", b.bands.length, 3);

const c = estimateCompanyTax({ chargeableIncome: 100_000, ya: 2025, smeEligible: true });
assert("CE 100k SME tax (15%)", c.tax, 15_000);

const d = estimateCompanyTax({ chargeableIncome: 1_000_000, ya: 2025, smeEligible: false });
assert("CE 1m non-SME tax (24%)", d.tax, 240_000);

const e = estimateCompanyTax({ chargeableIncome: 600_000, ya: 2023, smeEligible: true });
// 17% * 500k = 85,000 ; 24% * 100k = 24,000 => 109,000
assert("CE 600k YA2023 SME tax", e.tax, 109_000);

console.log("=== CP204 ===");
const cp = planCp204({ estimatedTaxPayable: 99_000 });
assert("CP204 safe estimate (70%)", cp.minSafeEstimate, 69_300);
assert("CP204 monthly", cp.monthlyInstalment, 5_775);

console.log("=== SME eligibility ===");
console.log("eligible:", isSmeEligible({ paidUpCapitalRm: 1_000_000, grossIncomeRm: 10_000_000 }));
console.log("not eligible:", !isSmeEligible({ paidUpCapitalRm: 3_000_000, grossIncomeRm: 10_000_000 }));

console.log("=== Expense review ===");
const findings = reviewExpenseDeductibility({
  expenseByCode: { "5900": 5_000, "5400": 3_000, "5600": 1_200 },
  aggregateIncome: 200_000
});
console.log(findings.map((f) => `${f.severity} ${f.code} (${f.estimatedAddBackRm ?? "-"})`).join("\n"));

console.log("\nDone.");
