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
      <p>
        <strong>{title}</strong>
      </p>
      {hint && <p className="muted">{hint}</p>}
      {action}
    </div>
  );
}
