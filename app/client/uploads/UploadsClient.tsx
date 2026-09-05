"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ClientUploadsPage() {
  const params = useSearchParams();
  const [periodId, setPeriodId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [category, setCategory] = useState(params.get("category") || "PURCHASE");
  const [requestId, setRequestId] = useState(params.get("requestId") || "");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
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
    if (category === "BANK") return "Bank statements — PDF, CSV, Excel, ZIP, photos…";
    if (category === "SALES") return "Customer invoices / sales receipts — any format.";
    if (category === "PURCHASE") return "Supplier bills & receipts — PDF, photos, Excel, Word…";
    return "Any document your accountant needs.";
  }, [category]);

  const totalSize = useMemo(() => files.reduce((s, f) => s + f.size, 0), [files]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length || !companyId || !periodId) return;
    setLoading(true);
    setMessage("");

    const form = new FormData();
    form.set("companyId", companyId);
    form.set("periodId", periodId);
    form.set("category", category);
    if (requestId) form.set("requestId", requestId);
    if (note) form.set("clientNote", note);
    for (const f of files) {
      form.append("files", f);
    }

    const res = await fetch("/api/client/uploads", { method: "POST", body: form });
    const data = await res.json();
    setLoading(false);

    if (data.ok) {
      const count = data.count ?? 1;
      setMessage(
        count > 1
          ? `Received ${count} files. Accountant will review them.`
          : `Received “${files[0]?.name}”. AI confidence: ${data.ai?.confidence ?? "n/a"}%.`
      );
      setFiles([]);
    } else {
      setMessage(String(data.error));
    }
  }

  return (
    <main className="container grid">
      <section className="card">
        <h1>Upload documents</h1>
        <p className="muted">
          {tip} Upload <strong>any file type</strong> and <strong>any size</strong> (PDF, Excel, Word,
          images, CSV, ZIP, etc.). Multiple files OK.{" "}
          <a href="/scan">Scan a bill</a> if you want instant form fill.
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
            Note to accountant
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Maybank May statement + Excel export"
            />
          </label>
          {requestId ? (
            <p className="muted" style={{ fontSize: 13 }}>
              Linked to checklist item (auto).
            </p>
          ) : null}
          <label>
            Files (any type, multiple allowed)
            <input
              type="file"
              multiple
              required={files.length === 0}
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </label>
          {files.length > 0 && (
            <div className="muted" style={{ fontSize: 13 }}>
              <p>
                Selected {files.length} file{files.length === 1 ? "" : "s"} · {formatBytes(totalSize)}{" "}
                total
              </p>
              <ul>
                {files.map((f) => (
                  <li key={`${f.name}-${f.size}-${f.lastModified}`}>
                    {f.name} · {formatBytes(f.size)}
                    {f.type ? ` · ${f.type}` : " · unknown type"}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button className="btn" type="submit" disabled={loading || files.length === 0}>
            {loading
              ? `Uploading ${files.length} file${files.length === 1 ? "" : "s"}...`
              : `Upload ${files.length || ""} file${files.length === 1 ? "" : "s"} & send to accountant`}
          </button>
        </form>
        {message && <p className="message">{message}</p>}
      </section>
    </main>
  );
}
