"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { categoryLabel } from "@/lib/ux/labels";
import { downloadTidyDocsExcel } from "@/lib/export/tidy-excel";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type ExtractedFields = {
  merchant: string | null;
  supplier: string | null;
  customer: string | null;
  documentNumber: string | null;
  date: string | null;
  dueDate: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  currency: string | null;
  paymentMethod: string | null;
  lineItems?: Array<{
    description?: string;
    quantity?: number;
    unitPrice?: number;
    amount?: number;
  }>;
  notes: string | null;
};

type TidiedDoc = {
  id: string;
  fileName: string | null;
  originalFileName: string | null;
  category: string;
  confidence: number | null;
  fields: ExtractedFields | null;
  aiUsed?: boolean;
  aiError?: string | null;
};

export default function ClientUploadsPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [periodId, setPeriodId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"files" | "camera">("files");
  const [files, setFiles] = useState<File[]>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, percent: 0, current: "" });
  const [results, setResults] = useState<TidiedDoc[]>([]);

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

  useEffect(() => {
    return () => {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const totalSize = useMemo(() => files.reduce((s, f) => s + f.size, 0), [files]);

  const moneyTotals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    let total = 0;
    for (const doc of results) {
      subtotal += Number(doc.fields?.subtotal ?? 0);
      tax += Number(doc.fields?.tax ?? 0);
      total += Number(doc.fields?.total ?? 0);
    }
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round(total * 100) / 100
    };
  }, [results]);

  const categoryMoney = useMemo(() => {
    const map = new Map<string, { count: number; subtotal: number; tax: number; total: number }>();
    for (const doc of results) {
      const row = map.get(doc.category) ?? { count: 0, subtotal: 0, tax: 0, total: 0 };
      row.count += 1;
      row.subtotal += Number(doc.fields?.subtotal ?? 0);
      row.tax += Number(doc.fields?.tax ?? 0);
      row.total += Number(doc.fields?.total ?? 0);
      map.set(doc.category, row);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [results]);

  function partyOf(doc: TidiedDoc) {
    const f = doc.fields;
    if (!f) return "—";
    if (doc.category === "SALES") return f.customer || f.merchant || f.supplier || "—";
    return f.merchant || f.supplier || f.customer || "—";
  }

  function money(n: number | null | undefined) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    return Number(n).toFixed(2);
  }

  function addFiles(next: File[]) {
    if (!next.length) return;
    setFiles((prev) => [...prev, ...next]);
    setResults([]);
    setMessage("");
    setError("");
  }

  async function startCamera() {
    setError("");
    setMode("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setError("Camera not available. Use Upload files instead.");
      setMode("files");
    }
  }

  function stopCamera() {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        addFiles([new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" })]);
      },
      "image/jpeg",
      0.92
    );
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length || !companyId || !periodId) return;
    setLoading(true);
    setMessage("");
    setError("");
    setResults([]);
    stopCamera();

    const queue = [...files];
    const total = queue.length;
    const docs: TidiedDoc[] = [];
    const errors: string[] = [];

    setProgress({ done: 0, total, percent: 0, current: queue[0]?.name ?? "" });

    try {
      for (let i = 0; i < queue.length; i++) {
        const file = queue[i];
        setProgress({
          done: i,
          total,
          percent: Math.round((i / total) * 100),
          current: file.name
        });

        const form = new FormData();
        form.set("companyId", companyId);
        form.set("periodId", periodId);
        form.set("autoClassify", "1");
        form.set("category", "OTHER");
        if (note) form.set("clientNote", note);
        form.append("files", file);

        try {
          const res = await fetch("/api/client/uploads", { method: "POST", body: form });
          const data = await res.json();
          if (!data.ok) {
            errors.push(`${file.name}: ${data.error || "failed"}`);
          } else {
            const batch = (data.documents ?? []) as TidiedDoc[];
            docs.push(...batch);
          }
        } catch (err) {
          errors.push(
            `${file.name}: ${err instanceof Error ? err.message : "upload failed"}`
          );
        }

        setProgress({
          done: i + 1,
          total,
          percent: Math.round(((i + 1) / total) * 100),
          current: i + 1 < total ? queue[i + 1].name : file.name
        });

        // Pause between files to avoid OpenRouter / provider 429 burst limits.
        if (i + 1 < total) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }

      setResults(docs);
      const live = docs.filter((d) => d.aiUsed).length;
      const offline = docs.length - live;
      if (docs.length === 0) {
        setError(errors[0] || "No documents processed.");
      } else {
        setMessage(
          offline > 0 && live === 0
            ? `Sorted ${docs.length} file(s), but OpenRouter AI failed — showing offline estimates.`
            : offline > 0
              ? `Done — ${live} live AI · ${offline} offline fallback.`
              : `Done — AI sorted ${docs.length} file${docs.length === 1 ? "" : "s"} into categories and tidied names.`
        );
      }
      if (errors.length) {
        setError(errors.slice(0, 3).join(" · "));
      }
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setLoading(false);
      setProgress({ done: total, total, percent: 100, current: "" });
    }
  }

  return (
    <main className="container grid">
      <section className="card">
        <div className="page-header">
          <h1>Drop everything here</h1>
          <p className="muted">
            Upload <strong>all</strong> bills, receipts, bank statements, payroll, tax docs — mixed
            together is fine. You don’t pick folders. AI sorts, extracts, and renames for your
            accountant.
          </p>
        </div>

        <div className="btn-row" style={{ marginTop: 12, marginBottom: 12 }}>
          <button
            type="button"
            className={`btn ${mode === "files" ? "" : "secondary"}`}
            onClick={() => {
              stopCamera();
              setMode("files");
            }}
          >
            Upload many files
          </button>
          <button
            type="button"
            className={`btn ${mode === "camera" ? "" : "secondary"}`}
            onClick={() => void startCamera()}
          >
            Camera photos
          </button>
        </div>

        <form className="form grid" onSubmit={onSubmit}>
          <label>
            Optional note (for your accountant)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. May pack — bank + Grab + supplier bills"
            />
          </label>

          {mode === "files" && (
            <label className="bulk-drop">
              <span className="bulk-drop-title">Choose files or drop a whole folder’s worth</span>
              <span className="muted" style={{ fontSize: 13 }}>
                Photos, PDF, Excel, CSV, ZIP — multiple files OK
              </span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.csv,.xlsx,.xls,.doc,.docx,.zip,application/*"
                onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
              />
            </label>
          )}

          {mode === "camera" && (
            <div className="grid">
              <video ref={videoRef} className="video-frame" playsInline muted />
              <canvas ref={canvasRef} hidden />
              <div className="btn-row">
                {!cameraOn ? (
                  <button type="button" className="btn" onClick={startCamera}>
                    Start camera
                  </button>
                ) : (
                  <>
                    <button type="button" className="btn" onClick={capturePhoto}>
                      Capture photo
                    </button>
                    <button type="button" className="btn secondary" onClick={stopCamera}>
                      Stop camera
                    </button>
                  </>
                )}
              </div>
              <p className="muted" style={{ fontSize: 13 }}>
                Capture as many as you need — they queue below, then AI sorts them.
              </p>
            </div>
          )}

          {files.length > 0 && (
            <div className="muted" style={{ fontSize: 13 }}>
              <p>
                Queue: <strong>{files.length}</strong> file{files.length === 1 ? "" : "s"} ·{" "}
                {formatBytes(totalSize)}
              </p>
              <ul>
                {files.map((f, i) => (
                  <li key={`${f.name}-${f.size}-${f.lastModified}-${i}`}>
                    {f.name} · {formatBytes(f.size)}
                    <button
                      type="button"
                      className="btn small secondary"
                      style={{ marginLeft: 8 }}
                      onClick={() => removeFile(i)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {loading && (
            <div className="upload-progress" aria-live="polite">
              <div className="upload-progress-head">
                <strong>{progress.percent}%</strong>
                <span className="muted">
                  {progress.done} / {progress.total} files
                </span>
              </div>
              <div className="progress" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
                <div className="progress-bar" style={{ width: `${progress.percent}%` }} />
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {progress.done < progress.total
                  ? `AI reading: ${progress.current}`
                  : "Finishing…"}
              </p>
            </div>
          )}

          <button className="btn" type="submit" disabled={loading || files.length === 0}>
            {loading
              ? `Processing ${progress.done}/${progress.total} (${progress.percent}%)…`
              : `Send all — AI will sort (${files.length || 0})`}
          </button>
        </form>

        {error && <p className="message error">{error}</p>}
        {message && <p className="message success">{message}</p>}
      </section>

      {results.length > 0 && (
        <>
          <section className="card">
            <div className="btn-row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>Numbers breakdown</h2>
              <button
                type="button"
                className="btn"
                onClick={() => downloadTidyDocsExcel(results)}
              >
                Download Excel
              </button>
            </div>
            <p className="muted">
              Full extract of every document — open in Excel / Google Sheets.
            </p>
            <div className="grid metrics" style={{ marginBottom: 12 }}>
              <div className="demo-chip">
                <strong>All subtotal</strong>
                <span className="metric-value" style={{ fontSize: "1.25rem" }}>
                  RM {money(moneyTotals.subtotal)}
                </span>
              </div>
              <div className="demo-chip">
                <strong>All tax / SST</strong>
                <span className="metric-value" style={{ fontSize: "1.25rem" }}>
                  RM {money(moneyTotals.tax)}
                </span>
              </div>
              <div className="demo-chip">
                <strong>All total</strong>
                <span className="metric-value" style={{ fontSize: "1.25rem" }}>
                  RM {money(moneyTotals.total)}
                </span>
              </div>
            </div>

            <h3>By category</h3>
            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Docs</th>
                    <th>Subtotal</th>
                    <th>Tax</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryMoney.map(([cat, row]) => (
                    <tr key={cat}>
                      <td>{categoryLabel(cat)}</td>
                      <td>{row.count}</td>
                      <td>RM {money(row.subtotal)}</td>
                      <td>RM {money(row.tax)}</td>
                      <td>RM {money(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>All documents</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Party</th>
                    <th>Doc no.</th>
                    <th>Date</th>
                    <th>Subtotal</th>
                    <th>Tax</th>
                    <th>Total</th>
                    <th>AI %</th>
                    <th>File</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((doc) => (
                    <tr key={doc.id}>
                      <td>{categoryLabel(doc.category)}</td>
                      <td>{partyOf(doc)}</td>
                      <td>{doc.fields?.documentNumber || "—"}</td>
                      <td>{doc.fields?.date || "—"}</td>
                      <td>{money(doc.fields?.subtotal)}</td>
                      <td>{money(doc.fields?.tax)}</td>
                      <td>
                        <strong>{money(doc.fields?.total)}</strong>
                      </td>
                      <td>
                        {doc.confidence != null ? Math.round(Number(doc.confidence)) : "—"}
                        {doc.aiUsed ? "" : "*"}
                      </td>
                      <td className="muted" style={{ fontSize: 12 }}>
                        {doc.fileName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              * = offline estimate. Excel includes a Documents sheet + Summary sheet.
            </p>
          </section>

          {categoryMoney.map(([cat]) => {
            const docs = results.filter((d) => d.category === cat);
            return (
              <section key={cat} className="card">
                <h2>
                  {categoryLabel(cat)} · {docs.length}
                </h2>
                <div className="grid">
                  {docs.map((doc) => (
                    <div key={doc.id} className="extracted-doc">
                      <p>
                        <strong>{doc.fileName}</strong>
                      </p>
                      <p className="muted" style={{ fontSize: 13 }}>
                        Was: {doc.originalFileName ?? "—"}
                        {doc.confidence != null
                          ? ` · AI ${Math.round(Number(doc.confidence))}%`
                          : ""}
                        {doc.aiUsed
                          ? doc.fields?.notes?.toLowerCase().includes("parsed from")
                            ? " · file contents read"
                            : " · live OpenRouter"
                          : " · offline estimate"}
                      </p>
                      {doc.aiError ? (
                        <p className="message error" style={{ marginTop: 8 }}>
                          {doc.aiError}
                        </p>
                      ) : null}
                      {doc.fields ? (
                        <div className="table-wrap" style={{ marginTop: 8 }}>
                          <table className="data-table">
                            <tbody>
                              <tr>
                                <th>Party</th>
                                <td>{partyOf(doc)}</td>
                              </tr>
                              <tr>
                                <th>Doc no.</th>
                                <td>{doc.fields.documentNumber || "—"}</td>
                              </tr>
                              <tr>
                                <th>Date</th>
                                <td>{doc.fields.date || "—"}</td>
                              </tr>
                              <tr>
                                <th>Subtotal</th>
                                <td>RM {money(doc.fields.subtotal)}</td>
                              </tr>
                              <tr>
                                <th>Tax / SST</th>
                                <td>RM {money(doc.fields.tax)}</td>
                              </tr>
                              <tr>
                                <th>Total</th>
                                <td>
                                  <strong>RM {money(doc.fields.total)}</strong>
                                </td>
                              </tr>
                              <tr>
                                <th>Payment</th>
                                <td>{doc.fields.paymentMethod || "—"}</td>
                              </tr>
                              {doc.fields.lineItems && doc.fields.lineItems.length > 0 ? (
                                <tr>
                                  <th>Line items</th>
                                  <td>
                                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                                      {doc.fields.lineItems.map((l, idx) => (
                                        <li key={`${doc.id}-li-${idx}`}>
                                          {l.description || "Item"}
                                          {l.quantity != null ? ` × ${l.quantity}` : ""}
                                          {l.amount != null ? ` = RM ${money(l.amount)}` : ""}
                                        </li>
                                      ))}
                                    </ul>
                                  </td>
                                </tr>
                              ) : null}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="muted">Details pending accountant review.</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          <section className="card">
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                onClick={() => downloadTidyDocsExcel(results)}
              >
                Download Excel again
              </button>
              <Link className="btn secondary" href={"/client" as Route}>
                Back to home →
              </Link>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
