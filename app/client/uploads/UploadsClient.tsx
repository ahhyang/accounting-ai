"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function ClientUploadsPage() {
  const params = useSearchParams();
  const [periodId, setPeriodId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [category, setCategory] = useState(params.get("category") || "PURCHASE");
  const [requestId, setRequestId] = useState(params.get("requestId") || "");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/client/checklist")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setPeriodId(data.period.id);
          setCompanyId(data.company.id);
        }
      });
  }, []);

  const tip = useMemo(() => {
    if (category === "BANK") return "PDF/CSV bank statement, all pages.";
    if (category === "SALES") return "Customer invoices or sales receipts.";
    if (category === "PURCHASE") return "Supplier bills, Grab/receipts photos OK.";
    return "Upload the clearest file you have.";
  }, [category]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !companyId || !periodId) return;
    setLoading(true);
    setMessage("");

    const form = new FormData();
    form.set("companyId", companyId);
    form.set("periodId", periodId);
    form.set("category", category);
    if (requestId) form.set("requestId", requestId);
    if (note) form.set("clientNote", note);
    form.set("file", file);

    const res = await fetch("/api/client/uploads", { method: "POST", body: form });
    const data = await res.json();
    setLoading(false);

    if (data.ok) {
      setMessage(
        `Received. AI confidence: ${data.ai?.confidence ?? data.confidence ?? "n/a"}%. Review at Scan Bill or wait for accountant.`
      );
      setFile(null);
    } else {
      setMessage(String(data.error));
    }
  }

  return (
    <main className="container grid">
      <section className="card">
        <h1>Upload documents</h1>
        <p className="muted">
          {tip}{" "}
          <a href="/scan">Scan a bill or receipt</a> for instant form fill + Excel export.
        </p>
        <form className="form grid" onSubmit={onSubmit}>
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="BANK">Bank</option>
              <option value="SALES">Sales</option>
              <option value="PURCHASE">Purchase</option>
              <option value="PAYROLL">Payroll</option>
              <option value="TAX">Tax</option>
              <option value="OTHER">Other / Questions</option>
            </select>
          </label>
          <label>
            Checklist item ID (optional)
            <input value={requestId} onChange={(e) => setRequestId(e.target.value)} />
          </label>
          <label>
            Note to accountant
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Maybank May statement"
            />
          </label>
          <label>
            File
            <input type="file" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Uploading..." : "Upload & send to AI"}
          </button>
        </form>
        {message && <p className="message">{message}</p>}
      </section>
    </main>
  );
}
