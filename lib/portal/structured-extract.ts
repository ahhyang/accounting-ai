import * as XLSX from "xlsx";
import {
  extractionResultSchema,
  reconcileExtractedAmounts,
  type ExtractionResult
} from "@/lib/ai/extraction";
import type { ResolvedFile } from "@/lib/portal/document-file";

function finalize(raw: Record<string, unknown>): ExtractionResult | null {
  const parsed = extractionResultSchema.safeParse(raw);
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    extracted: reconcileExtractedAmounts(parsed.data.extracted)
  };
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Buffer.from(b64, "base64");
}

function extOf(fileName: string) {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : "";
}

export function isSpreadsheetFile(mime: string, fileName: string) {
  const m = mime.toLowerCase();
  const e = extOf(fileName);
  return (
    m.includes("spreadsheet") ||
    m.includes("excel") ||
    m === "application/vnd.ms-excel" ||
    e === "xlsx" ||
    e === "xls"
  );
}

export function isJsonFile(mime: string, fileName: string) {
  const m = mime.toLowerCase();
  const e = extOf(fileName);
  return m.includes("json") || e === "json";
}

export function isDelimitedTextFile(mime: string, fileName: string) {
  const m = mime.toLowerCase();
  const e = extOf(fileName);
  return (
    m.includes("csv") ||
    m === "text/tab-separated-values" ||
    e === "csv" ||
    e === "tsv" ||
    e === "txt" ||
    e === "html" ||
    e === "htm" ||
    m.startsWith("text/")
  );
}

export function canReadFileContents(mime: string, fileName: string) {
  return (
    isSpreadsheetFile(mime, fileName) ||
    isJsonFile(mime, fileName) ||
    isDelimitedTextFile(mime, fileName)
  );
}

export function fileBytesToText(file: ResolvedFile): string | null {
  try {
    const buf = dataUrlToBuffer(file.dataUrl);
    if (isSpreadsheetFile(file.mimeType, file.fileName)) {
      const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
      const parts: string[] = [];
      for (const name of wb.SheetNames.slice(0, 3)) {
        const sheet = wb.Sheets[name];
        if (!sheet) continue;
        parts.push(`# Sheet: ${name}`);
        parts.push(XLSX.utils.sheet_to_csv(sheet));
      }
      return parts.join("\n").trim() || null;
    }
    let text = buf.toString("utf8");
    // Strip UTF-8 BOM
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (extOf(file.fileName) === "html" || file.mimeType.includes("html")) {
      text = text
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
    }
    return text.trim() || null;
  } catch {
    return null;
  }
}

function guessBankName(fileName: string, text: string): string {
  const blob = `${fileName} ${text.slice(0, 400)}`.toLowerCase();
  if (blob.includes("maybank")) return "Maybank";
  if (blob.includes("cimb")) return "CIMB";
  if (blob.includes("public bank") || blob.includes("public-bank") || /public.?bank/.test(blob))
    return "Public Bank";
  if (blob.includes("hong leong") || blob.includes("hlb")) return "Hong Leong Bank";
  if (blob.includes("rhb")) return "RHB";
  if (blob.includes("ambank")) return "AmBank";
  if (blob.includes("ocbc")) return "OCBC";
  if (blob.includes("uob")) return "UOB";
  if (blob.includes("statement") || blob.includes("bank")) return "Bank statement";
  return "Unknown";
}

function detectDelimiter(headerLine: string): string {
  const commas = (headerLine.match(/,/g) || []).length;
  const semis = (headerLine.match(/;/g) || []).length;
  const tabs = (headerLine.match(/\t/g) || []).length;
  if (tabs >= commas && tabs >= semis && tabs > 0) return "\t";
  if (semis > commas) return ";";
  return ",";
}

function splitCsvLine(line: string, delim: string): string[] {
  if (delim === "\t") return line.split("\t").map((c) => c.trim());
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === delim && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseTable(text: string): { headers: string[]; rows: string[][] } | null {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (lines.length < 2) return null;
  const delim = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delim).map((h) => h.toLowerCase());
  if (headers.length < 2) return null;
  const rows = lines.slice(1).map((l) => splitCsvLine(l, delim));
  return { headers, rows };
}

function colIndex(headers: string[], aliases: string[]) {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].replace(/\s+/g, " ").trim();
    if (aliases.some((a) => h === a || h.includes(a))) return i;
  }
  return -1;
}

function toNum(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(/,/g, "").replace(/RM/gi, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function isIsoDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(s);
}

function normalizeDate(s: string): string | null {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    let y = m[3];
    if (y.length === 2) y = `20${y}`;
    // Prefer YMD if first part > 12 → already D/M/Y malaysia style
    if (Number(m[1]) > 12) return `${y}-${mo}-${d}`;
    return `${y}-${mo}-${d}`;
  }
  return null;
}

function extractFromTable(
  table: { headers: string[]; rows: string[][] },
  fileName: string,
  category: string
): ExtractionResult | null {
  const { headers, rows } = table;
  const dateIdx = colIndex(headers, ["date", "txn date", "transaction date", "posting date", "value date"]);
  const descIdx = colIndex(headers, [
    "description",
    "particulars",
    "details",
    "narrative",
    "party",
    "merchant"
  ]);
  const amountIdx = colIndex(headers, ["amount", "amt", "value", "total"]);
  const debitIdx = colIndex(headers, ["debit", "withdrawal", "money out"]);
  const creditIdx = colIndex(headers, ["credit", "deposit", "money in"]);
  const balanceIdx = colIndex(headers, ["balance", "running balance", "bal"]);
  const partyIdx = colIndex(headers, ["party", "supplier", "customer", "merchant"]);
  const totalColIdx = colIndex(headers, ["total"]);
  const subtotalIdx = colIndex(headers, ["subtotal"]);
  const taxIdx = colIndex(headers, ["tax", "sst"]);
  const categoryIdx = colIndex(headers, ["category"]);
  const docNoIdx = colIndex(headers, ["docno", "doc no", "document number", "invoice"]);

  const looksBank =
    balanceIdx >= 0 ||
    (debitIdx >= 0 && creditIdx >= 0) ||
    /statement|bank|maybank|cimb|hlb|public/i.test(fileName);

  const looksRegister = categoryIdx >= 0 && (totalColIdx >= 0 || amountIdx >= 0);

  const lineItems: Array<{ description: string; amount?: number }> = [];
  let firstDate: string | null = null;
  let lastDate: string | null = null;
  let lastBalance: number | null = null;
  let sumSigned = 0;
  let sumAbs = 0;
  let sumTotals = 0;
  let sumTax = 0;
  let sumSub = 0;
  let moneyRows = 0;

  for (const row of rows) {
    if (!row.length || row.every((c) => !c)) continue;
    const dateRaw = dateIdx >= 0 ? row[dateIdx] : "";
    const date = dateRaw && isIsoDate(dateRaw) ? normalizeDate(dateRaw) : dateRaw ? normalizeDate(dateRaw) : null;
    if (date) {
      if (!firstDate) firstDate = date;
      lastDate = date;
    }

    let amount: number | null = null;
    if (amountIdx >= 0) amount = toNum(row[amountIdx]);
    else if (debitIdx >= 0 || creditIdx >= 0) {
      const d = debitIdx >= 0 ? toNum(row[debitIdx]) : null;
      const c = creditIdx >= 0 ? toNum(row[creditIdx]) : null;
      if (d != null && d !== 0) amount = -Math.abs(d);
      else if (c != null && c !== 0) amount = Math.abs(c);
    } else if (totalColIdx >= 0) amount = toNum(row[totalColIdx]);

    if (balanceIdx >= 0) {
      const b = toNum(row[balanceIdx]);
      if (b != null) lastBalance = b;
    }

    const descParts = [
      descIdx >= 0 ? row[descIdx] : "",
      partyIdx >= 0 ? row[partyIdx] : "",
      docNoIdx >= 0 ? row[docNoIdx] : "",
      categoryIdx >= 0 ? row[categoryIdx] : ""
    ].filter(Boolean);
    const description = descParts.join(" — ") || "Row";

    // Skip pure opening/closing labels with empty amounts when balance-only
    const isMeta = /opening balance|closing balance/i.test(description);

    if (amount != null && !isMeta) {
      sumSigned += amount;
      sumAbs += Math.abs(amount);
      moneyRows += 1;
      if (looksRegister) {
        sumTotals += Math.abs(amount);
        if (taxIdx >= 0) sumTax += Math.abs(toNum(row[taxIdx]) ?? 0);
        if (subtotalIdx >= 0) sumSub += Math.abs(toNum(row[subtotalIdx]) ?? 0);
      }
    }

    if (lineItems.length < 40 && (amount != null || description !== "Row")) {
      lineItems.push({
        description: description.slice(0, 120),
        amount: amount ?? undefined
      });
    }
  }

  if (moneyRows === 0 && lastBalance == null && lineItems.length === 0) return null;

  const bankName = guessBankName(fileName, headers.join(" "));
  const hint = looksBank
    ? "BANK"
    : looksRegister
      ? category === "SALES"
        ? "SALES"
        : "PURCHASE"
      : /payroll|salary|payslip/i.test(fileName)
        ? "PAYROLL"
        : category;

  // Prefer closing balance for bank files; else net movement or register sum.
  let total: number | null = null;
  let subtotal: number | null = null;
  let tax: number | null = null;
  if (looksBank && lastBalance != null) {
    total = lastBalance;
    subtotal = lastBalance;
    tax = 0;
  } else if (looksRegister && sumTotals > 0) {
    total = Math.round(sumTotals * 100) / 100;
    subtotal = sumSub > 0 ? Math.round(sumSub * 100) / 100 : total;
    tax = sumTax > 0 ? Math.round(sumTax * 100) / 100 : 0;
  } else if (moneyRows > 0) {
    total = Math.round(sumAbs * 100) / 100;
    subtotal = total;
    tax = 0;
  }

  const merchant = looksBank
    ? bankName
    : looksRegister
      ? sanitizeParty(fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")) || "Register"
      : bankName !== "Unknown"
        ? bankName
        : "Unknown";

  const raw = {
    extracted: {
      merchant,
      supplier: looksBank ? merchant : merchant,
      documentNumber: looksBank ? `${moneyRows || lineItems.length}-txns` : undefined,
      date: lastDate ?? firstDate ?? undefined,
      subtotal: subtotal ?? undefined,
      tax: tax ?? undefined,
      total: total ?? undefined,
      currency: "MYR",
      categoryHint: hint,
      textQuality: "printed" as const,
      lineItems,
      notes: looksBank
        ? `Parsed ${moneyRows || lineItems.length} bank rows. Closing/total RM ${total ?? "n/a"}. Period ${firstDate ?? "?"} to ${lastDate ?? "?"}.`
        : `Parsed ${moneyRows || lineItems.length} rows from spreadsheet/CSV.`
    },
    proposal: {
      description: looksBank ? `Bank statement — ${merchant}` : `Imported — ${merchant}`,
      lines: [
        {
          accountCode: looksBank ? "1200" : "5600",
          debit: total ?? 0,
          credit: 0,
          memo: looksBank ? "Bank balance / movements" : "Imported total"
        },
        {
          accountCode: looksBank ? "3000" : "1200",
          debit: 0,
          credit: total ?? 0,
          memo: looksBank ? "Equity/clearing placeholder" : "Bank"
        }
      ]
    },
    riskFlags: [
      "Parsed from file contents (CSV/XLSX/TXT)",
      ...(looksBank ? ["Bank statement — review before posting"] : [])
    ],
    confidence: looksBank || looksRegister ? 90 : 78
  };

  return finalize(raw);
}

function sanitizeParty(s: string) {
  return s.replace(/\d+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
}

function extractMoneyFromPlainText(text: string, fileName: string, category: string): ExtractionResult | null {
  const totalMatch =
    text.match(/TOTAL(?:\s*NET\s*PAY)?\s*[:=]?\s*RM?\s*([0-9,]+\.\d{2})/i) ||
    text.match(/TOTAL\s+RM\s*([0-9,]+\.\d{2})/i);
  const subMatch = text.match(/SUBTOTAL[^\d]*RM?\s*([0-9,]+\.\d{2})/i);
  const taxMatch = text.match(/(?:TAX|SST|PCB)[^\d]*RM?\s*([0-9,]+\.\d{2})/i);
  const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  const docMatch =
    text.match(/Doc(?:ument)?\s*No\.?\s*[:#]?\s*([A-Z0-9\-_/]+)/i) ||
    text.match(/\b([A-Z]{2,5}-\d{2,}-?\d*)\b/);
  const merchantMatch =
    text.match(/Merchant:\s*(.+)/i) ||
    text.match(/Employer:\s*(.+)/i) ||
    text.match(/Seller:\s*(.+)/i);

  if (!totalMatch && !subMatch) return null;

  const total = toNum(totalMatch?.[1] ?? "") ?? toNum(subMatch?.[1] ?? "");
  const subtotal = toNum(subMatch?.[1] ?? "") ?? total;
  const tax = toNum(taxMatch?.[1] ?? "") ?? 0;
  const merchant =
    merchantMatch?.[1]?.trim().split(/\n|,/)[0]?.slice(0, 60) ||
    guessBankName(fileName, text) ||
    "Unknown";

  const hint = /payroll|payslip|salary/i.test(`${fileName} ${text.slice(0, 200)}`)
    ? "PAYROLL"
    : /bank|statement|opening balance|closing balance/i.test(`${fileName} ${text.slice(0, 300)}`)
      ? "BANK"
      : /sales|customer|tax invoice/i.test(text.slice(0, 400))
        ? "SALES"
        : category === "OTHER"
          ? "PURCHASE"
          : category;

  const raw = {
    extracted: {
      merchant,
      supplier: merchant,
      documentNumber: docMatch?.[1],
      date: dateMatch?.[1],
      subtotal: subtotal ?? undefined,
      tax: tax ?? undefined,
      total: total ?? undefined,
      currency: "MYR",
      categoryHint: hint,
      textQuality: "printed" as const,
      notes: `Parsed from text file ${fileName}`
    },
    proposal: {
      description: `${hint} — ${merchant}`,
      lines: [
        { accountCode: hint === "SALES" ? "1300" : "5600", debit: total ?? 0, credit: 0, memo: "Import" },
        { accountCode: hint === "SALES" ? "4100" : "1200", debit: 0, credit: total ?? 0, memo: "Import" }
      ]
    },
    riskFlags: ["Parsed from text contents"],
    confidence: 86
  };
  return finalize(raw);
}

/** Local extract for JSON / CSV / TSV / TXT / HTML / XLSX — no vision needed. */
export function extractFromStructuredFile(input: {
  file: ResolvedFile;
  category: string;
  fileName?: string;
}): { result: ExtractionResult; source: "local-json" | "local-table" | "local-text"; textPreview: string } | null {
  const fileName = input.fileName ?? input.file.fileName;
  const text = fileBytesToText(input.file);
  if (!text) return null;
  const preview = text.slice(0, 8000);

  if (isJsonFile(input.file.mimeType, fileName)) {
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      const wrapped = json.extracted
        ? {
            ...json,
            confidence: json.confidence ?? 92,
            riskFlags: [...(Array.isArray(json.riskFlags) ? json.riskFlags : []), "Parsed from JSON file"]
          }
        : {
            extracted: {
              ...json,
              currency: (json.currency as string) ?? "MYR",
              categoryHint: json.categoryHint
            },
            proposal: {
              description: `JSON — ${String(json.merchant ?? json.supplier ?? "Document")}`,
              lines: [
                {
                  accountCode: "5600",
                  debit: Number(json.total ?? 0) || 0,
                  credit: 0,
                  memo: "JSON import"
                },
                {
                  accountCode: "1200",
                  debit: 0,
                  credit: Number(json.total ?? 0) || 0,
                  memo: "Bank"
                }
              ]
            },
            riskFlags: ["Parsed from JSON file"],
            confidence: 92
          };
      const normalized = finalize(wrapped as Record<string, unknown>);
      if (normalized) {
        return { result: normalized, source: "local-json", textPreview: preview };
      }
    } catch {
      /* fall through */
    }
  }

  if (isSpreadsheetFile(input.file.mimeType, fileName) || /\.(csv|tsv)$/i.test(fileName) || input.file.mimeType.includes("csv")) {
    // For multi-sheet xlsx text, parse first sheet block only
    const firstSheet = preview.includes("# Sheet:")
      ? preview.split("# Sheet:").slice(1).map((p) => p.replace(/^[^\n]*\n/, "")).find(Boolean) ?? preview
      : preview;
    const table = parseTable(firstSheet);
    if (table) {
      const result = extractFromTable(table, fileName, input.category);
      if (result) return { result, source: "local-table", textPreview: preview };
    }
  }

  if (isDelimitedTextFile(input.file.mimeType, fileName) || isSpreadsheetFile(input.file.mimeType, fileName)) {
    const table = parseTable(preview);
    if (table) {
      const result = extractFromTable(table, fileName, input.category);
      if (result) return { result, source: "local-table", textPreview: preview };
    }
    const plain = extractMoneyFromPlainText(text, fileName, input.category);
    if (plain) return { result: plain, source: "local-text", textPreview: preview };
  }

  return null;
}
