import { runAuditAssistant } from "../lib/audit/ai-auditor";

const COMPANY_ID = process.env.AUDIT_TEST_COMPANY ?? "cmt292zdv0001ovh8ftske529";

async function main() {
  const started = Date.now();
  const r = await runAuditAssistant({ companyId: COMPANY_ID });
  console.log(`elapsed=${Date.now() - started}ms aiUsed=${r.aiUsed}`);
  console.log(`readiness=${r.readiness.score} overallRisk=${r.overallRisk}`);
  console.log(
    `materiality overall=${r.materiality.overallMateriality} performance=${r.materiality.performanceMateriality} benchmark=${r.materiality.benchmark}`
  );
  console.log(
    `financials revenue=${r.financials.revenue} expenses=${r.financials.expenses} pbt=${r.financials.profitBeforeTax} netAssets=${r.financials.netAssets}`
  );
  console.log(`goingConcern=${r.goingConcern.indicator} flags=${r.goingConcernFlags.join("; ") || "none"}`);
  console.log(`risks=${r.riskAssessment.length} findings=${r.findings.length} KAM=${r.keyAuditMatters.length}`);
  for (const risk of r.riskAssessment.slice(0, 4)) {
    console.log(`- [${risk.risk}] ${risk.area} (${risk.assertion}) :: ${risk.response}`);
  }
  console.log("draftOpinion:", r.draftOpinion.type);
  console.log("summary:", r.summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
