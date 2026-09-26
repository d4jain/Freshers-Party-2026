import { PageShell } from "@/components/site/page-shell";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageShell width="max-w-xl">
      <div className="invite-frame relative p-6 sm:p-10">{children}</div>
    </PageShell>
  );
}
