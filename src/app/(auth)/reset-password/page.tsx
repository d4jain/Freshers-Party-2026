import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/password-forms";
import { PageTitle } from "@/components/site/page-shell";

export const metadata: Metadata = { title: "Reset password", robots: { index: false }, referrer: "no-referrer" };

export default async function ResetPasswordPage(props: PageProps<"/reset-password">) {
  const sp = await props.searchParams;
  const token = typeof sp.token === "string" ? sp.token : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  return (
    <>
      <PageTitle
        eyebrow="Account"
        title={
          <>
            Choose a new <em className="text-gold">password</em>
          </>
        }
      />
      <ResetPasswordForm token={token} tokenError={error} />
    </>
  );
}
