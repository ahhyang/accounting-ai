"use client";

import { Suspense, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { EmptyState } from "@/app/components/EmptyState";
import { useCompanyId } from "@/app/components/useCompanyId";
import { statusLabel } from "@/lib/ux/labels";

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

function MonthEndPageInner() {
  const { data: session } = useSession();
  const { companyId, companyName, ready, loadingSession } = useCompanyId();
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

  useEffect(() => {
    if (ready) void loadChecklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, companyId]);

  async function completeTask(taskId: string) {
    if (!companyId) return;
    const res = await fetch(`/api/companies/${companyId}/month-end`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId,
        status: "COMPLETED",
        completedBy: session?.user?.id ?? "user"
      })
    });
    const json = await res.json();
    if (json.ok) await loadChecklist();
    else setData({ ok: false, error: json.error });
  }

  const tasks = data?.run?.tasks ?? [];
  const score = data?.completionScore ?? 0;

  if (loadingSession) {
    return (
      <main className="container">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (!companyId) {
    return (
      <main className="container">
        <EmptyState title="Sign in required" hint="Log in to open month-end for your company." />
      </main>
    );
  }

  return (
    <main className="container grid">
      <section className="card">
        <h1>Month-end closing</h1>
        <p className="muted">
          {companyName || "Your company"} — finish the checklist, then Manager closes the period.
        </p>
        <div className="row">
          <button type="button" className="btn secondary" onClick={loadChecklist} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </section>

      {data?.ok && (
        <>
          <section className="card score-card">
            <h2>{score}% complete</h2>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${score}%` }} />
            </div>
            <p>{data.summary}</p>
          </section>

          <section className="card">
            <h2>Checklist</h2>
            {tasks.length === 0 ? (
              <EmptyState title="No tasks" hint="Month-end run will appear here." />
            ) : (
              <ul className="checklist">
                {tasks.map((task) => (
                  <li key={task.id} className={task.status === "COMPLETED" ? "done" : ""}>
                    <span>
                      {task.status === "COMPLETED" ? "✓" : "○"} {task.label}{" "}
                      <span className="muted">({statusLabel(task.status)})</span>
                    </span>
                    {task.status !== "COMPLETED" && (
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => completeTask(task.id)}
                      >
                        Mark done
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {data && !data.ok && <p className="message error">{String(data.error)}</p>}
    </main>
  );
}

export default function MonthEndPage() {
  return (
    <Suspense
      fallback={
        <main className="container">
          <p>Loading month-end…</p>
        </main>
      }
    >
      <MonthEndPageInner />
    </Suspense>
  );
}
