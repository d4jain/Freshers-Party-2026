import Link from "next/link";
import { PageShell, PageTitle } from "@/components/site/page-shell";

export default function NotFound() {
  return (
    <PageShell>
      <PageTitle
        eyebrow="404"
        title={
          <>
            Wrong <em className="text-gold">dance floor.</em>
          </>
        }
      >
        We couldn’t find that page.
      </PageTitle>
      <Link href="/" className="btn-gold">
        Back to the party
      </Link>
    </PageShell>
  );
}
