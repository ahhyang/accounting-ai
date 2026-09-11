"use client";

export function EmptyState({
  title,
  hint,
  action
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {hint && <p className="muted">{hint}</p>}
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
    </div>
  );
}
