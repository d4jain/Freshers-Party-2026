import type { Queryable } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";

const SECRET_KEYS = /pass(word)?|secret|token|signature|session|cookie|key_?secret|qr/i;

/** Removes anything that looks like a credential before it reaches the audit log. */
export function scrubDetails(details: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (SECRET_KEYS.test(k)) continue;
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) ? scrubDetails(v as Record<string, unknown>) : v;
  }
  return out;
}

export async function recordAudit(
  db: Queryable,
  entry: {
    actorUserId: string | null;
    actorLabel?: string;
    action: string;
    targetType?: string;
    targetId?: string;
    details?: Record<string, unknown>;
  },
) {
  await db.insert(auditEvents).values({
    actorUserId: entry.actorUserId,
    actorLabel: entry.actorLabel,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    details: scrubDetails(entry.details ?? {}),
  });
}
