import * as XLSX from "xlsx";
import type { ExtractedBill } from "@/lib/ai/extraction";
import type { ScanBillForm } from "@/lib/portal/bill-from-scan";

export type BillExportRow = {
  "Document Type": string;
  "Merchant / Supplier / Customer": string;
  "Document Number": string;
  Date: string;
  "Due Date": string;
  Subtotal: number;
  Tax: number;
  Total: number;
  Currency: string;
  "Payment Method": string;
  "Text Quality": string;
  Description: string;
  "Line Items": string;
  Notes: string;
};

export function formToExportRow(form: ScanBillForm, category: string, extracted?: ExtractedBill): BillExportRow {
  const total = form.subtotal + form.taxAmount;
  return {
    "Document Type": category === "SALES" ? "Sales Invoice" : "Purchase Bill / Receipt",
    "Merchant / Supplier / Customer": form.merchantName,
    "Document Number": form.documentNumber ?? "",
    Date: form.billDate,
    "Due Date": form.dueDate,
    Subtotal: form.subtotal,
    Tax: form.taxAmount,
    Total: total,
    Currency: extracted?.currency ?? "MYR",
    "Payment Method": extracted?.paymentMethod ?? "",
    "Text Quality": extracted?.textQuality ?? "",
    Description: form.description ?? "",
    "Line Items":
      extracted?.lineItems
        ?.map((l) => `${l.description ?? ""} x${l.quantity ?? 1} = ${l.amount ?? l.unitPrice ?? ""}`)
        .join(" | ") ?? "",
    Notes: extracted?.notes ?? ""
  };
}

export function billsToWorkbook(rows: BillExportRow[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bills");
  return wb;
}

export function workbookToBuffer(wb: XLSX.WorkBook): Buffer {
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

export function singleBillToExcelBuffer(form: ScanBillForm, category: string, extracted?: ExtractedBill) {
  const row = formToExportRow(form, category, extracted);
  return workbookToBuffer(billsToWorkbook([row]));
}

export function multipleBillsToExcelBuffer(
  items: Array<{ form: ScanBillForm; category: string; extracted?: ExtractedBill }>
) {
  const rows = items.map((item) => formToExportRow(item.form, item.category, item.extracted));
  return workbookToBuffer(billsToWorkbook(rows));
}
