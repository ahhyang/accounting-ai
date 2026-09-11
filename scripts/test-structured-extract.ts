import fs from "fs";
import path from "path";
import { extractFromStructuredFile } from "../lib/portal/structured-extract";

function file(p: string, mime: string) {
  const b = fs.readFileSync(p);
  return {
    dataUrl: `data:${mime};base64,${b.toString("base64")}`,
    mimeType: mime,
    fileName: path.basename(p)
  };
}

const cases: Array<[string, string]> = [
  ["samples/06-maybank-statement.csv", "text/csv"],
  ["samples/18-public-bank-statement.csv", "text/csv"],
  [
    "samples/17-cimb-statement.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ],
  [
    "samples/16-expense-sales-register.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ],
  ["samples/15-foodpanda-receipt.json", "application/json"],
  ["samples/12-payroll-payslip-may.txt", "text/plain"]
];

for (const [p, mime] of cases) {
  const r = extractFromStructuredFile({ file: file(p, mime), category: "OTHER" });
  if (!r) {
    console.log("FAIL", p);
    continue;
  }
  const e = r.result.extracted;
  console.log(
    path.basename(p),
    "=>",
    e.merchant,
    e.date,
    e.total,
    e.categoryHint,
    "conf",
    r.result.confidence,
    r.source
  );
}
