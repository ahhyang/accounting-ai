"use client";

import { useSession } from "next-auth/react";
import { portalLabel } from "@/lib/ux/labels";

/** Persistent company + role context under the nav (no raw UUIDs). */
export function AppChrome() {
  const { data, status } = useSession();
  if (status !== "authenticated" || !data?.user) return null;

  const { companyName, roleName, portal } = data.user;

  return (
    <div className="app-chrome">
      <div className="container app-chrome-inner">
        <span>
          <strong>{companyName || "Your company"}</strong>
          <span className="muted"> · Current month</span>
        </span>
        <span className="muted">
          {portalLabel(portal)} · {roleName}
        </span>
      </div>
    </div>
  );
}
