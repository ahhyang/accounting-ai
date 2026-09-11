import { runTaxAdvise } from "../lib/tax/ai-advisor";

const COMPANY_ID = process.env.TAX_TEST_COMPANY ?? "cmt292zdv0001ovh8ftske529";

async function main() {
  const started = Date.now();
  const r = await runTaxAdvise({ companyId: COMPANY_ID });
  console.log(`elapsed=${Date.now() - started}ms aiUsed=${r.aiUsed} audit=${r.audit.score}`);
  console.log(
    `chargeable=${r.counted.estimatedProfit} tax=${r.counted.estimatedCorporateTax} eff=${r.counted.effectiveRatePct}% sme=${r.counted.smeRateApplied} cp204Safe=${r.counted.cp204SafeEstimate}`
  );
  console.log("bands:", r.counted.taxBands.map((b) => `${b.label}@${b.ratePct}%=${b.tax}`).join(" | "));
  console.log(`strategies=${r.minimumTaxPlan.strategies.length} addBackRisks=${r.minimumTaxPlan.disallowanceRisks.length}`);
  for (const s of r.minimumTaxPlan.strategies) {
    console.log(`- ${s.title} [${s.risk}] saving=${s.estimatedSavingRm} :: ${s.legalBasis}`);
  }
  console.log("plan summary:", r.minimumTaxPlan.summary);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
