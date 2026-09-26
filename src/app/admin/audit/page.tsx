import { recentAudit } from "@/lib/admin/queries";
import { getDb } from "@/lib/db";
import { formatDateTimeIST } from "@/lib/format";

export default async function AuditPage() {
  const rows = await recentAudit(getDb());
  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl text-ivory">Audit trail</h1>
      <p className="text-sm text-muted">
        Sensitive organiser changes, role changes and check-ins (latest 200). Secrets are never logged.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-ivory/10">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-ink-2 text-xs tracking-wider text-muted uppercase">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Actor</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Target</th>
              <th className="px-4 py-2">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ivory/5">
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-2 text-xs whitespace-nowrap text-muted">{formatDateTimeIST(a.createdAt)}</td>
                <td className="px-4 py-2 font-mono text-xs">{a.actorLabel ?? a.actorUserId ?? "system"}</td>
                <td className="px-4 py-2 text-ivory">{a.action}</td>
                <td className="px-4 py-2 font-mono text-xs">
                  {a.targetType}:{a.targetId?.slice(0, 12)}
                </td>
                <td className="max-w-md px-4 py-2 font-mono text-xs break-all text-muted">{JSON.stringify(a.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
