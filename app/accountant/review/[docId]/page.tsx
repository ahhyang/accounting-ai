"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { EmptyState } from "@/app/components/EmptyState";
import { categoryLabel, statusLabel } from "@/lib/ux/labels";

type Line = { accountCode: string; debit?: number; credit?: number; memo?: string };

type Suggestion = {
  id: string;
  confidence: number | string;
  payload: {
    proposal?: { description?: string; lines?: Line[] };
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
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [manualMode, setManualMode] = useState(false);

  async function load() {
    const data = await fetch(`/api/accountant/review/${docId}`).then((r) => r.json());
    if (data.ok) {
      setDoc(data.document);
      const latest = data.document.suggestions?.[0] as Suggestion | undefined;
      if (latest?.payload?.proposal) {
        setDescription(latest.payload.proposal.description ?? "");
        setLines(
          (latest.payload.proposal.lines ?? []).map((l) => ({
            accountCode: l.accountCode,
            debit: l.debit ?? 0,
            credit: l.credit ?? 0,
            memo: l.memo ?? ""
          }))
        );
      }
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch(`/api/accountant/review/${docId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra })
    });
    const data = await res.json();
    const okMsg: Record<string, string> = {
      approve: "Approved and posted to the ledger.",
      rerun_ai: "AI re-run complete — review the updated proposal.",
      reject_ask_client: "Client asked to fix / re-upload.",
      manual_post: "Manual journal posted."
    };
    setMessage(data.ok ? okMsg[action] ?? `Done: ${action}` : String(data.error));
    await load();
  }

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { accountCode: "5600", debit: 0, credit: 0, memo: "" }]);
  }

  const latest = doc?.suggestions?.[0];
  const extracted = latest?.payload?.extracted;

  return (
    <main className="container grid">
      <section className="card">
        <h1>Review document</h1>
        {doc ? (
          <>
            <p>
              <strong>{doc.fileName}</strong> · {categoryLabel(doc.category)} ·{" "}
              {statusLabel(doc.status)}
            </p>
            {doc.clientNote && <p className="muted">Client note: {doc.clientNote}</p>}
          </>
        ) : (
          <p className="muted">Loading…</p>
        )}
        {message && <p className="message">{message}</p>}
        <p>
          <Link href="/accountant/inbox">← Back to inbox</Link>
        </p>
      </section>

      {extracted && (
        <section className="card">
          <h2>Extracted fields</h2>
          <table className="table">
            <tbody>
              {Object.entries(extracted).map(([key, value]) => (
                <tr key={key}>
                  <td className="muted">{key}</td>
                  <td>{String(value ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {latest ? (
        <section className="card">
          <h2>
            Journal proposal ({Number(latest.confidence).toFixed(0)}% confidence)
          </h2>
          {latest.payload.riskFlags?.length ? (
            <p className="message error">Risks: {latest.payload.riskFlags.join("; ")}</p>
          ) : null}
          <label className="form" style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            Description
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <table className="table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Debit</th>
                <th>Credit</th>
                <th>Memo</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i}>
                  <td>
                    <input
                      value={line.accountCode}
                      onChange={(e) => updateLine(i, { accountCode: e.target.value })}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={line.debit ?? 0}
                      onChange={(e) => updateLine(i, { debit: Number(e.target.value) })}
                      style={{ width: 100 }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={line.credit ?? 0}
                      onChange={(e) => updateLine(i, { credit: Number(e.target.value) })}
                      style={{ width: 100 }}
                    />
                  </td>
                  <td>
                    <input
                      value={line.memo ?? ""}
                      onChange={(e) => updateLine(i, { memo: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <button type="button" className="btn secondary" onClick={addLine}>
              Add line
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                act("approve", {
                  suggestionId: latest.id,
                  lines,
                  description
                })
              }
            >
              Approve & post
            </button>
            <button type="button" className="btn secondary" onClick={() => act("rerun_ai")}>
              Re-run AI
            </button>
          </div>
        </section>
      ) : (
        <section className="card">
          <EmptyState title="No AI proposal yet" hint="Re-run AI or enter a manual journal." />
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
        <h2>Manual journal</h2>
        <p className="muted">Use the editable table above, or start a blank two-line entry.</p>
        {!manualMode ? (
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              setManualMode(true);
              setLines([
                { accountCode: "5600", debit: 100, credit: 0, memo: "Expense" },
                { accountCode: "1200", debit: 0, credit: 100, memo: "Bank" }
              ]);
              setDescription(`Manual for ${doc?.fileName ?? "document"}`);
            }}
          >
            Start manual entry
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={() =>
              act("manual_post", {
                lines,
                description: description || `Manual for ${doc?.fileName}`
              })
            }
          >
            Post manually
          </button>
        )}
      </section>
    </main>
  );
}
