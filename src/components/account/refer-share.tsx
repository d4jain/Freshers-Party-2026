"use client";

import { AtSign, Check, Copy, MessageCircle, Share2 } from "lucide-react";
import { useState } from "react";

type Props = { code: string; link: string; message: string };

function useCopied() {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2200);
    } catch {
      /* clipboard unavailable */
    }
  }
  return { copied, copy };
}

/**
 * Share controls for a student's referral code. WhatsApp has a share link;
 * Instagram has no web share-to-DM link, so we use the phone's share sheet
 * (which lists Instagram) and fall back to copying the message.
 */
export function ReferShare({ code, link, message }: Props) {
  const { copied, copy } = useCopied();
  const [shareError, setShareError] = useState(false);
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(message)}`;

  async function shareSheet() {
    setShareError(false);
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ text: message });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // user closed the sheet
      }
    }
    await copy("instagram", message);
    setShareError(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <p className="font-mono text-5xl font-bold tracking-[0.18em] text-gold-bright sm:text-6xl">{code}</p>
        <button type="button" className="btn-ghost !min-h-11 text-sm" onClick={() => copy("code", code)}>
          {copied === "code" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied === "code" ? "Code copied" : "Copy code"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn-gold min-h-14">
          <MessageCircle className="h-5 w-5" aria-hidden="true" /> Share on WhatsApp
          <span className="sr-only"> (opens WhatsApp)</span>
        </a>
        <button type="button" className="btn-ghost min-h-14" onClick={shareSheet}>
          <AtSign className="h-5 w-5" aria-hidden="true" /> Share on Instagram
        </button>
        <button type="button" className="btn-ghost min-h-12 text-sm" onClick={() => copy("message", message)}>
          {copied === "message" ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Share2 className="h-4 w-4" aria-hidden="true" />
          )}
          {copied === "message" ? "Message copied" : "Copy invite message"}
        </button>
        <button type="button" className="btn-ghost min-h-12 text-sm" onClick={() => copy("link", link)}>
          {copied === "link" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied === "link" ? "Link copied" : "Copy booking link"}
        </button>
      </div>
      <p className="text-sm text-mist" role="status" aria-live="polite">
        {shareError || copied === "instagram"
          ? "Invite copied — open Instagram and paste it into a DM or your story."
          : "On your phone, “Share on Instagram” opens your share options — pick Instagram, then a chat or your story."}
      </p>
    </div>
  );
}
