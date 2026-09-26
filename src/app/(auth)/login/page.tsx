import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { PageTitle } from "@/components/site/page-shell";
import { getSessionUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/validation";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : null;
  const user = await getSessionUser().catch(() => null);
  if (user) redirect(safeNextPath(next, "/account"));
  return (
    <>
      <PageTitle
        eyebrow="Welcome back"
        title={
          <>
            Log <em className="text-gold">in</em>
          </>
        }
      >
        {next?.startsWith("/book")
          ? "Log in to continue your booking — your group details are saved."
          : "See your bookings and passes."}
      </PageTitle>
      <LoginForm next={next} />
    </>
  );
}
