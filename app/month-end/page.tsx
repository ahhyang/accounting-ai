"use client";

import { useState } from "react";

type MonthEndTask = {
  id: string;
  key: string;
  label: string;
  status: string;
};

type MonthEndResponse = {
  ok: boolean;
  summary?: string;
  completionScore?: number;
  remainingCount?: number;
  run?: { tasks: MonthEndTask[] };
  error?: string;
};

export default function MonthEndPage() {
  const [companyId, setCompanyId] = useState("");
  const [data, setData] = useState<MonthEndResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadChecklist() {
    if (!companyId) return;
    setLoading(true);

    const res = await fetch(`/api/companies/${companyId}/month-end`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }

  async function completeTask(taskId: string) {
    if (!companyId) return;

    const res = await fetch(`/api/companies/${companyId}/month-end`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId,
        status: "COMPLETED",
        completedBy: "demo-user"
      })
    });
    const json = await res.json();

    if (json.ok) {
      await loadChecklist();
    } else {
      setData({ ok: false, error: json.error });
    }
  }

  const tasks = data?.run?.tasks ?? [];
  const score = data?.completionScore ?? 0;

  return (
    <main className="container grid">
      <section className="card">
        <h1>Month-End Closing</h1>
        <p className="muted">Track closing checklist progress with completion scoring.</p>
        <div className="row">
          <input
            placeholder="Company ID"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          />
          <button type="button" className="btn" onClick={loadChecklist} disabled={loading}>
            {loading ? "Loading..." : "Load Checklist"}
          </button>
        </div>
      </section>

      {data?.ok && (
        <>
          <section className="card score-card">
            <h2>{score}% Complete</h2>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${score}%` }} />
            </div>
            <p>{data.summary}</p>
          </section>

          <section className="card">
            <h2>Checklist</h2>
            <ul className="checklist">
              {tasks.map((task) => (
                <li key={task.id} className={task.status === "COMPLETED" ? "done" : ""}>
                  <span>{task.status === "COMPLETED" ? "✓" : "○"} {task.label}</span>
                  {task.status !== "COMPLETED" && (
                    <button type="button" className="btn small" onClick={() => completeTask(task.id)}>
                      Mark done
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {data && !data.ok && <p className="message error">{data.error}</p>}
    </main>
  );
}
