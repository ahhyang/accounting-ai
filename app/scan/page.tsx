"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { ExtractedBill } from "@/lib/ai/extraction";

type ScanForm = {
  merchantName: string;
  documentNumber: string;
  billDate: string;
  dueDate: string;
  subtotal: string;
  taxAmount: string;
  description: string;
};

type ScanResult = {
  document: { id: string; fileName: string | null; previewUrl: string | null };
  extraction: {
    extracted: ExtractedBill;
    riskFlags?: string[];
    confidence: number;
  };
  form: ScanForm;
  confidence: number;
};

export default function ScanBillPage() {
  const { data: session } = useSession();
  const isClient = session?.user?.portal === "client";
  const canPost = Boolean(session?.user && !isClient);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [companyId, setCompanyId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [category, setCategory] = useState<"PURCHASE" | "SALES">("PURCHASE");
  const [note, setNote] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [form, setForm] = useState<ScanForm | null>(null);
  const [extracted, setExtracted] = useState<ExtractedBill | null>(null);
  const [posted, setPosted] = useState<{ type: string; number: string; nextStep: string } | null>(
    null
  );
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch("/api/client/checklist")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setPeriodId(data.period.id);
          setCompanyId(data.company.id);
          setCompanyName(data.company.name ?? "");
        }
      })
      .catch(() => {
        setError("Log in to scan bills.");
      });
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function startCamera() {
    setError("");
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
      setError("Camera not available. Upload a photo instead.");
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

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const captured = new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" });
        setFile(captured);
        setPreviewUrl(URL.createObjectURL(blob));
        stopCamera();
      },
      "image/jpeg",
      0.92
    );
  }

  function onFilePick(f: File | null) {
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setResult(null);
    setPosted(null);
  }

  async function scanBill() {
    if (!file || !companyId || !periodId) {
      setError("Select a company period and capture or upload a bill/receipt image.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    setPosted(null);
    setSubmitted(false);

    const body = new FormData();
    body.set("companyId", companyId);
    body.set("periodId", periodId);
    body.set("category", category);
    if (note) body.set("clientNote", note);
    body.set("file", file);

    const res = await fetch("/api/scan", { method: "POST", body });
    const data = await res.json();
    setLoading(false);

    if (!data.ok) {
      setError(String(data.error));
      return;
    }

    const scanResult = data as ScanResult & { ok: true };
    setResult(scanResult);
    setExtracted(scanResult.extraction.extracted);
    setForm({
      merchantName: scanResult.form.merchantName,
      documentNumber: scanResult.form.documentNumber ?? "",
      billDate: scanResult.form.billDate,
      dueDate: scanResult.form.dueDate,
      subtotal: String(scanResult.form.subtotal),
      taxAmount: String(scanResult.form.taxAmount),
      description: scanResult.form.description ?? ""
    });
    setMessage(
      `Scanned (${scanResult.extraction.extracted.textQuality ?? "unknown"} text) — ${scanResult.confidence}% confidence. Review the form below.`
    );
  }

  async function runAction(action: string) {
    if (!result?.document.id || !form) return;
    setLoading(true);
    setError("");

    if (action === "export_excel") {
      const res = await fetch(`/api/scan/${result.document.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          form: {
            ...form,
            subtotal: Number(form.subtotal),
            taxAmount: Number(form.taxAmount)
          },
          category,
          extracted
        })
      });

      if (!res.ok) {
        const err = await res.json();
        setError(String(err.error ?? "Export failed"));
        setLoading(false);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bill-${form.documentNumber || result.document.id.slice(0, 8)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Excel file downloaded.");
      setLoading(false);
      return;
    }

    const res = await fetch(`/api/scan/${result.document.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        form: {
          ...form,
          subtotal: Number(form.subtotal),
          taxAmount: Number(form.taxAmount)
        },
        category,
        extracted
      })
    });

    const data = await res.json();
    setLoading(false);

    if (!data.ok) {
      setError(String(data.error));
      return;
    }

    if (action === "post_to_accounting") {
      setPosted({
        type: data.result.type,
        number: data.result.number,
        nextStep: data.nextStep
      });
      setMessage(
        `${data.result.type === "purchase" ? "Purchase bill" : "Sales invoice"} ${data.result.number} posted.`
      );
    } else if (action === "save_form") {
      setSubmitted(true);
      setMessage(isClient ? "Saved and sent to your accountant for review." : "Form saved.");
    } else {
      setMessage("Saved.");
    }
  }

  const total =
    form != null ? (Number(form.subtotal) || 0) + (Number(form.taxAmount) || 0) : 0;

  return (
    <main className="container grid">
      <section className="card">
        <h1>Scan bill or receipt</h1>
        <p className="muted">
          {companyName ? `${companyName} — ` : ""}
          Photo or upload a receipt (printed or handwritten). AI fills the form.
          {isClient
            ? " Send it to your accountant — they post the books."
            : " Export Excel or post to Sales / Purchases."}
        </p>
      </section>

      <section className="card">
        <h2>1. Capture or upload</h2>
        <div className="form grid">
          <label>
            Document type
            <select value={category} onChange={(e) => setCategory(e.target.value as "PURCHASE" | "SALES")}>
              <option value="PURCHASE">Purchase bill / expense receipt</option>
              <option value="SALES">Sales invoice / customer receipt</option>
            </select>
          </label>
          <label>
            Note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Grab receipt, May utilities" />
          </label>
        </div>

        <div className="row" style={{ marginTop: 12, flexWrap: "wrap", gap: 8 }}>
          {!cameraOn ? (
            <button type="button" className="btn" onClick={startCamera}>
              Open camera
            </button>
          ) : (
            <>
              <button type="button" className="btn" onClick={capturePhoto}>
                Capture photo
              </button>
              <button type="button" className="btn secondary" onClick={stopCamera}>
                Close camera
              </button>
            </>
          )}
          <button type="button" className="btn secondary" onClick={() => fileInputRef.current?.click()}>
            Upload image / PDF
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => onFilePick(e.target.files?.[0] ?? null)}
          />
        </div>

        {cameraOn && (
          <video
            ref={videoRef}
            playsInline
            muted
            style={{ width: "100%", maxWidth: 480, marginTop: 12, borderRadius: 8, border: "1px solid #273159" }}
          />
        )}
        <canvas ref={canvasRef} hidden />

        {(previewUrl || result?.document.previewUrl) && (
          <div style={{ marginTop: 12 }}>
            <p className="muted">Preview</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl ?? result?.document.previewUrl ?? ""}
              alt="Scanned document"
              style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8, border: "1px solid #273159" }}
            />
          </div>
        )}

        <button
          type="button"
          className="btn"
          style={{ marginTop: 12 }}
          disabled={loading || !file}
          onClick={scanBill}
        >
          {loading ? "Scanning..." : "Scan & extract data"}
        </button>
      </section>

      {form && result && (
        <section className="card">
          <h2>2. Review extracted form</h2>
          {result.extraction.riskFlags?.length ? (
            <p className="message error">Notes: {result.extraction.riskFlags.join("; ")}</p>
          ) : null}

          <form className="form grid" onSubmit={(e) => e.preventDefault()}>
            <label>
              {category === "SALES" ? "Customer name" : "Supplier / merchant"}
              <input
                required
                value={form.merchantName}
                onChange={(e) => setForm({ ...form, merchantName: e.target.value })}
              />
            </label>
            <label>
              Document number
              <input
                value={form.documentNumber}
                onChange={(e) => setForm({ ...form, documentNumber: e.target.value })}
              />
            </label>
            <label>
              Date
              <input
                type="date"
                value={form.billDate}
                onChange={(e) => setForm({ ...form, billDate: e.target.value })}
              />
            </label>
            <label>
              Due date
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </label>
            <label>
              Subtotal (RM)
              <input
                value={form.subtotal}
                onChange={(e) => setForm({ ...form, subtotal: e.target.value })}
              />
            </label>
            <label>
              Tax (RM)
              <input
                value={form.taxAmount}
                onChange={(e) => setForm({ ...form, taxAmount: e.target.value })}
              />
            </label>
            <label>
              Total (RM)
              <input readOnly value={total.toFixed(2)} />
            </label>
            <label>
              Description / line items
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
          </form>

          {extracted?.lineItems && extracted.lineItems.length > 0 && (
            <>
              <h3>Line items detected</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {extracted.lineItems.map((item, i) => (
                    <tr key={i}>
                      <td>{item.description ?? "—"}</td>
                      <td>{item.quantity ?? 1}</td>
                      <td>{item.amount ?? item.unitPrice ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      {form && result && (
        <section className="card">
          <h2>3. Next step</h2>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            <button type="button" className="btn" disabled={loading} onClick={() => runAction("save_form")}>
              {isClient ? "Send to accountant" : "Save form"}
            </button>
            <button type="button" className="btn secondary" disabled={loading} onClick={() => runAction("export_excel")}>
              Export to Excel
            </button>
            {canPost && (
              <button type="button" className="btn" disabled={loading} onClick={() => runAction("post_to_accounting")}>
                Post to {category === "SALES" ? "Sales (AR)" : "Purchases (AP)"}
              </button>
            )}
          </div>

          {submitted && isClient && (
            <p className="message" style={{ marginTop: 12 }}>
              Sent. <Link href="/client">Back to checklist</Link>
            </p>
          )}

          {posted && canPost && (
            <div style={{ marginTop: 12 }}>
              <p className="message">
                Posted {posted.type} {posted.number}.
              </p>
              <div className="row" style={{ gap: 8 }}>
                <a className="btn" href={posted.nextStep}>
                  Open {posted.type === "purchase" ? "Purchases" : "Sales"}
                </a>
                <Link className="btn secondary" href="/banking">
                  Banking
                </Link>
              </div>
            </div>
          )}
        </section>
      )}

      {message && <p className="message">{message}</p>}
      {error && <p className="message error">{error}</p>}
    </main>
  );
}
