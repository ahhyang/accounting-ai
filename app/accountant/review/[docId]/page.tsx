"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Suggestion = {
  id: string;
  confidence: number | string;
  payload: {
    proposal?: {
      description?: string;
      lines?: Array<{ accountCode: string; debit?: number; credit?: number; memo?: string }>;
    };
    riskFlags?: string[];
    extracted?: Record<string, unknown>;
  };
};

export default function ReviewPage() {
  const params = useParams();
  const docId = String(params.docId);
  const [doc, setDoc] = useState<{
    id: string;
    fileName: string | null;
    category: string;
    status: string;
    clientNote: string | null;
    suggestions: Suggestion[];
  } | null>(null);
  const [message, setMessage] = useState("");
  const [askText, setAskText] = useState("Please re-upload a clearer copy of this document.");
  const [manualLines, setManualLines] = useState(
    JSON.stringify(
      [
        { accountCode: "5600", debit: 100, credit: 0, memo: "Expense" },
        { accountCode: "1200", debit: 0, credit: 100, memo: "Bank" }
      ],
      null,
      2
    )
  );

  async function load() {
    const data = await fetch(`/api/accountant/review/${docId}`).then((r) => r.json());
    if (data.ok) setDoc(data.document);
  }

  useEffect(() => {
    load();
  }, [docId]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch(`/api/accountant/review/${docId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra })
    });
    const data = await res.json();
    setMessage(data.ok ? `OK: ${action}` : String(data.error));
    await load();
  }

  const latest = doc?.suggestions?.[0];

  return (
    <main className="container grid">
      <section className="card">
        <h1>Review document</h1>
        {doc && (
          <>
            <p>
              <strong>{doc.fileName}</strong> · {doc.category} · {doc.status}
            </p>
            {doc.clientNote && <p className="muted">Client note: {doc.clientNote}</p>}
          </>
        )}
        {message && <p className="message">{message}</p>}
      </section>

      {latest && (
        <section className="card">
          <h2>AI proposal ({Number(latest.confidence).toFixed(0)}% confidence)</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>
            {JSON.stringify(latest.payload.proposal ?? latest.payload, null, 2)}
          </pre>
          {latest.payload.riskFlags?.length ? (
            <p className="message error">Risks: {latest.payload.riskFlags.join("; ")}</p>
          ) : null}
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={() => act("approve", { suggestionId: latest.id })}
            >
              Approve & Post
            </button>
            <button type="button" className="btn secondary" onClick={() => act("rerun_ai")}>
              Re-run AI
            </button>
          </div>
        </section>
      )}

      <section className="card">
        <h2>Ask client (if unclear)</h2>
        <div className="row">
          <input value={askText} onChange={(e) => setAskText(e.target.value)} />
          <button
            type="button"
            className="btn secondary"
            onClick={() => act("reject_ask_client", { message: askText })}
          >
            Request fix
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Manual entry (fallback)</h2>
        <p className="muted">If AI cannot help, type balanced journal lines JSON and post.</p>
        <textarea
          rows={8}
          value={manualLines}
          onChange={(e) => setManualLines(e.target.value)}
          style={{
            width: "100%",
            background: "#0b1020",
            color: "#eef2ff",
            border: "1px solid #273159",
            borderRadius: 8,
            padding: 12
          }}
        />
        <button
          type="button"
          className="btn"
          onClick={() => {
            try {
              const lines = JSON.parse(manualLines);
              act("manual_post", { lines, description: `Manual for ${doc?.fileName}` });
            } catch {
              setMessage("Invalid JSON lines");
            }
          }}
        >
          Post manually
        </button>
      </section>
    </main>
  );
}
