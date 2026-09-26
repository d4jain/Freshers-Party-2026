import { env } from "@/lib/env";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Passed to providers that support idempotency, e.g. Resend's Idempotency-Key. */
  idempotencyKey?: string;
};

export type EmailSendResult = { ok: true; providerMessageId: string | null } | { ok: false; error: string; retryable: boolean };

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/** Development/test only: prints the message to the server console. */
class ConsoleProvider implements EmailProvider {
  readonly name = "console";
  async send(m: EmailMessage): Promise<EmailSendResult> {
    console.info(`\n[email:console] To: ${m.to}\nSubject: ${m.subject}\n${m.text}\n`);
    return { ok: true, providerMessageId: null };
  }
}

class ResendProvider implements EmailProvider {
  readonly name = "resend";
  constructor(
    private apiKey: string,
    private from: string,
    private replyTo?: string,
  ) {}
  async send(m: EmailMessage): Promise<EmailSendResult> {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(m.idempotencyKey ? { "Idempotency-Key": m.idempotencyKey.slice(0, 256) } : {}),
        },
        body: JSON.stringify({
          from: this.from,
          to: [m.to],
          subject: m.subject,
          html: m.html,
          text: m.text,
          ...(this.replyTo ? { reply_to: this.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as { id?: string };
        return { ok: true, providerMessageId: body.id ?? null };
      }
      const retryable = res.status === 429 || res.status >= 500;
      return { ok: false, error: `Resend responded ${res.status}`, retryable };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "network error", retryable: true };
    }
  }
}

let override: EmailProvider | undefined;
export function setEmailProviderOverride(p: EmailProvider | undefined) {
  override = p;
}

/** Returns null when no provider is configured; the outbox keeps messages pending. */
export function getEmailProvider(): EmailProvider | null {
  if (override) return override;
  const e = env();
  const choice = e.EMAIL_PROVIDER ?? (e.RESEND_API_KEY ? "resend" : e.isProduction ? "none" : "console");
  if (choice === "resend" && e.RESEND_API_KEY && e.EMAIL_FROM) {
    return new ResendProvider(e.RESEND_API_KEY, e.EMAIL_FROM, e.EMAIL_REPLY_TO);
  }
  if (choice === "console" && !e.isProduction) return new ConsoleProvider();
  return null;
}
