"use client";

import { Check, Copy, Download, ImageUp, LoaderCircle, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { FormAlert } from "@/components/ui/field";
import { useNow } from "@/lib/hooks/client-state";
import { formatINR } from "@/lib/money";

type Props = {
  bookingId: string;
  reference: string;
  totalPaise: number;
  holdExpiresAt: string;
  expired: boolean;
  upi: { upiId: string | null; payeeName: string | null; qrPath: string; payLink: string | null };
};

/** Server limit (hosting caps request bodies at 4.5 MB). */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** Anything bigger than this is re-encoded in the browser before upload. */
const SHRINK_ABOVE_BYTES = 3 * 1024 * 1024;
/** Largest file we'll try to shrink; the phone screenshots we expect are far smaller. */
const MAX_PICK_BYTES = 30 * 1024 * 1024;

/**
 * Re-encodes a large screenshot as JPEG, fitting it inside 1600×3200 (the
 * server stores the same size), so it fits the upload limit.
 * Returns the original file if the browser can't decode it.
 */
async function shrinkForUpload(file: File): Promise<File> {
  if (file.size <= SHRINK_ABOVE_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / bitmap.width, 3200 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gold/35 px-3 text-xs font-bold text-gold hover:border-gold"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard unavailable */
        }
      }}
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * Step 2 of booking: pay the organiser's UPI QR, then upload the payment
 * screenshot + transaction ID. The booking moves to "In review"; an
 * organiser confirms it after checking their UPI account.
 */
export function PaymentPanel({ bookingId, reference, totalPaise, holdExpiresAt, expired, upi }: Props) {
  const router = useRouter();
  const now = useNow(1000);
  const fileId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [utr, setUtr] = useState("");
  const [payerName, setPayerName] = useState("");
  const [confirmAmount, setConfirmAmount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ file?: string; utr?: string; confirm?: string }>({});

  const msLeft = now == null ? null : new Date(holdExpiresAt).getTime() - now;
  const holdLabel =
    msLeft == null
      ? ""
      : msLeft > 0
        ? `${Math.floor(msLeft / 60000)}:${String(Math.floor((msLeft % 60000) / 1000)).padStart(2, "0")}`
        : "expired";

  function onFile(f: File | null) {
    setFieldErrors((e) => ({ ...e, file: undefined }));
    if (preview) URL.revokeObjectURL(preview);
    if (!f) {
      setFile(null);
      setPreview(null);
      return;
    }
    if (!/^image\//.test(f.type)) {
      setFieldErrors((e) => ({ ...e, file: "Choose an image (JPG or PNG screenshot)." }));
      return;
    }
    if (f.size > MAX_PICK_BYTES) {
      setFieldErrors((e) => ({ ...e, file: "That image is too large. Upload the screenshot itself, not a photo of it." }));
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const cleanUtr = utr.trim().toUpperCase().replace(/[\s-]/g, "");
    const errs: typeof fieldErrors = {};
    if (!file) errs.file = "Attach the payment screenshot.";
    if (!/^[A-Z0-9]{6,35}$/.test(cleanUtr))
      errs.utr = "Enter the UPI transaction ID / UTR (letters and numbers, usually 12 digits).";
    if (!confirmAmount) errs.confirm = `Confirm you paid exactly ${formatINR(totalPaise)}.`;
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      const upload = await shrinkForUpload(file!);
      if (upload.size > MAX_UPLOAD_BYTES) {
        setFieldErrors({ file: "That image is too large. Upload a JPG or PNG screenshot under 4 MB." });
        return;
      }
      const fd = new FormData();
      fd.set("screenshot", upload);
      fd.set("utr", cleanUtr);
      if (payerName.trim()) fd.set("payerName", payerName.trim());
      const res = await fetch(`/api/bookings/${bookingId}/proof`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error?.message ?? "Upload failed. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network problem — please try again. Don’t pay twice.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6" data-no-glitter>
      <section aria-labelledby="pay-title" className="invite-frame relative p-5 sm:p-8">
        <div className="relative grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
          <div className="mx-auto w-full max-w-[16rem]">
            <div className="rounded-2xl bg-white p-3 shadow-[0_20px_60px_-25px_rgba(215,183,119,0.6)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- configurable QR path, shown at native size */}
              <img
                src={upi.qrPath}
                alt={`UPI QR code to pay ${upi.payeeName ?? "the organisers"}`}
                className="aspect-square w-full"
              />
            </div>
            <a
              href={upi.qrPath}
              download={`freshers-2026-upi-qr-${reference}.png`}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 text-sm font-semibold text-gold"
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Save QR image
            </a>
          </div>
          <div className="min-w-0 space-y-4">
            <div>
              <p id="pay-title" className="eyebrow">
                Step 2 · Pay
              </p>
              <p className="mt-2 text-sm text-mist">Pay exactly</p>
              <p className="display text-6xl text-gold">{formatINR(totalPaise)}</p>
            </div>
            <dl className="space-y-2 text-sm">
              {upi.payeeName && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-muted">Payee</dt>
                  <dd className="font-semibold text-ivory">{upi.payeeName}</dd>
                </div>
              )}
              {upi.upiId && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-muted">UPI ID</dt>
                  <dd className="flex items-center gap-2 font-mono text-ivory">
                    <span className="break-all">{upi.upiId}</span>
                    <CopyButton value={upi.upiId} label="UPI ID" />
                  </dd>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-muted">Add this note</dt>
                <dd className="flex items-center gap-2 font-mono text-ivory">
                  {reference}
                  <CopyButton value={reference} label="booking reference" />
                </dd>
              </div>
            </dl>
            {upi.payLink && (
              <a href={upi.payLink} className="btn-gold w-full md:hidden">
                <Smartphone className="h-4 w-4" aria-hidden="true" /> Pay {formatINR(totalPaise)} in a UPI app
              </a>
            )}
            <p className="text-xs text-muted">
              Scan with GPay, PhonePe, Paytm or any UPI app. On your phone, use the button above or save the QR and open it from
              your UPI app. Check the payee name before paying.
            </p>
            {!expired && holdLabel && (
              <p className="text-sm text-mist" aria-live="off">
                Places held for <span className="font-semibold text-gold-bright tabular-nums">{holdLabel}</span>
              </p>
            )}
          </div>
        </div>
      </section>

      <form onSubmit={submit} noValidate className="card space-y-5 p-5 sm:p-8" aria-labelledby="proof-title">
        <div>
          <p id="proof-title" className="eyebrow">
            Step 3 · Upload proof
          </p>
          <p className="mt-2 text-sm text-mist">
            After paying, upload the success screenshot from your UPI app and its transaction ID.
          </p>
        </div>
        {expired && (
          <FormAlert tone="info">
            Your hold has lapsed. If you’ve already paid, upload your proof — we’ll accept it if places are still available.
          </FormAlert>
        )}

        <div>
          <span className="field-label">Payment screenshot</span>
          <label
            htmlFor={fileId}
            className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gold/35 bg-ink-2/60 p-5 text-center transition hover:border-gold"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
              <img src={preview} alt="Selected payment screenshot" className="max-h-72 rounded-lg object-contain" />
            ) : (
              <ImageUp className="h-8 w-8 text-gold" aria-hidden="true" />
            )}
            <span className="text-sm font-semibold text-ivory">{file ? "Change screenshot" : "Choose screenshot"}</span>
            <span className="text-xs text-muted">JPG or PNG screenshot</span>
          </label>
          <input
            id={fileId}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            aria-invalid={fieldErrors.file ? true : undefined}
          />
          {fieldErrors.file && (
            <p className="field-error" role="alert">
              {fieldErrors.file}
            </p>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="utr" className="field-label">
              UPI transaction ID / UTR
            </label>
            <input
              id="utr"
              className="field font-mono uppercase"
              inputMode="text"
              autoComplete="off"
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              placeholder="e.g. 426512345678"
              aria-invalid={fieldErrors.utr ? true : undefined}
              aria-describedby="utr-hint"
            />
            <p id="utr-hint" className={fieldErrors.utr ? "field-error" : "field-hint"}>
              {fieldErrors.utr ?? "Shown on the payment success screen (UPI Ref / UTR / Transaction ID)."}
            </p>
          </div>
          <div>
            <label htmlFor="payer" className="field-label">
              Paid from (name on UPI account) <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="payer"
              className="field"
              autoComplete="name"
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
            />
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-2xl border border-gold/15 p-4 text-sm text-ivory">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#d7b777]"
            checked={confirmAmount}
            onChange={(e) => setConfirmAmount(e.target.checked)}
          />
          <span>
            I paid exactly {formatINR(totalPaise)} for booking {reference}.
            {fieldErrors.confirm && <span className="field-error block">{fieldErrors.confirm}</span>}
          </span>
        </label>

        {error && <FormAlert>{error}</FormAlert>}
        <button type="submit" className="btn-gold min-h-14 w-full text-base sm:w-auto sm:px-8" disabled={busy}>
          {busy && <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />}
          {busy ? "Uploading…" : "Submit payment proof"}
        </button>
        <p className="text-xs text-muted">
          Your booking goes to “In review”. Passes are issued once the organisers verify the payment.
        </p>
      </form>
    </div>
  );
}
