"use client";

import { Camera, CameraOff, CircleCheck, CircleX, LoaderCircle, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TicketLookup } from "@/lib/tickets/checkin";
import { cn } from "@/lib/utils";

type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

const STATE_UI: Record<TicketLookup["state"], { title: string; tone: "ok" | "warn" | "bad" }> = {
  valid: { title: "Valid pass", tone: "ok" },
  already_checked_in: { title: "Already checked in", tone: "warn" },
  void: { title: "Void pass — do not admit", tone: "bad" },
  booking_not_confirmed: { title: "Booking not confirmed — do not admit", tone: "bad" },
  demo_pass: { title: "Demo pass — not valid for entry", tone: "bad" },
  not_found: { title: "Pass not found", tone: "bad" },
  invalid_code: { title: "Invalid or forged code", tone: "bad" },
};

function fmt(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function CheckInConsole() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const lastRef = useRef<{ code: string; at: number } | null>(null);
  const [camera, setCamera] = useState<"off" | "starting" | "on" | "error">("off");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TicketLookup | null>(null);
  const [admitted, setAdmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async (code: string) => {
    setBusy(true);
    setError(null);
    setAdmitted(false);
    try {
      const res = await fetch("/api/staff/tickets/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? "Lookup failed");
      setResult(body.result as TicketLookup);
      if (navigator.vibrate) navigator.vibrate(body.result.state === "valid" ? 60 : [120, 60, 120]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }, []);

  async function admit() {
    if (!result?.ticketId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/tickets/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticketId: result.ticketId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? "Check-in failed");
      const r = body.result as TicketLookup;
      setResult(r);
      setAdmitted(r.state === "valid");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  }

  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamera("off");
  }, []);

  async function startCamera() {
    setCamera("starting");
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setCamera("on");
      scanningRef.current = true;
      void scanLoop();
    } catch {
      setCamera("error");
      setCameraError("Camera unavailable. Allow camera access, or use manual code entry below.");
    }
  }

  async function scanLoop() {
    const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike })
      .BarcodeDetector;
    const detector = Detector ? new Detector({ formats: ["qr_code"] }) : null;
    const jsQR = detector ? null : (await import("jsqr")).default;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    while (scanningRef.current) {
      await new Promise((r) => setTimeout(r, 220));
      if (!scanningRef.current || video.readyState < 2 || document.hidden) continue;
      let value: string | null = null;
      try {
        if (detector) {
          const codes = await detector.detect(video);
          value = codes[0]?.rawValue ?? null;
        } else if (jsQR && ctx) {
          const w = Math.min(640, video.videoWidth);
          const h = Math.round((video.videoHeight / video.videoWidth) * w);
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          value = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
        }
      } catch {
        value = null;
      }
      if (value) {
        const now = Date.now();
        if (lastRef.current && lastRef.current.code === value && now - lastRef.current.at < 4000) continue;
        lastRef.current = { code: value, at: now };
        await lookup(value);
      }
    }
  }

  useEffect(() => {
    const onHide = () => {
      if (document.hidden) stopCamera();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      stopCamera();
    };
  }, [stopCamera]);

  const ui = result ? STATE_UI[result.state] : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2" data-no-glitter>
      <section aria-labelledby="scan-title" className="card space-y-4 p-5">
        <h2 id="scan-title" className="font-display text-2xl text-ivory">
          Scan QR
        </h2>
        <div className="relative aspect-square overflow-hidden rounded-2xl border border-gold/20 bg-ink">
          <video
            ref={videoRef}
            className={cn("h-full w-full object-cover", camera !== "on" && "hidden")}
            muted
            playsInline
            aria-label="Camera preview"
          />
          {camera !== "on" && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted">
              <Camera className="h-10 w-10 text-gold" aria-hidden="true" />
              {camera === "starting" ? "Starting camera…" : (cameraError ?? "Camera is off.")}
            </div>
          )}
          {camera === "on" && (
            <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-gold/80" aria-hidden="true" />
          )}
          <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
        </div>
        {camera === "on" ? (
          <button type="button" className="btn-ghost w-full" onClick={stopCamera}>
            <CameraOff className="h-4 w-4" aria-hidden="true" /> Stop camera
          </button>
        ) : (
          <button type="button" className="btn-gold w-full" onClick={() => void startCamera()} disabled={camera === "starting"}>
            <Camera className="h-4 w-4" aria-hidden="true" /> Start camera
          </button>
        )}
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) void lookup(manual.trim());
          }}
        >
          <label htmlFor="manual" className="field-label">
            Manual code
          </label>
          <div className="flex gap-2">
            <input
              id="manual"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="ABCDE-12345"
              autoCapitalize="characters"
              autoComplete="off"
              className="field font-mono tracking-wider uppercase"
            />
            <button className="btn-ghost shrink-0" type="submit" disabled={busy}>
              Check
            </button>
          </div>
        </form>
      </section>

      <section aria-labelledby="result-title" aria-live="assertive" className="card p-5">
        <h2 id="result-title" className="font-display text-2xl text-ivory">
          Result
        </h2>
        {busy && <LoaderCircle className="mt-6 h-8 w-8 animate-spin text-gold" aria-label="Checking" />}
        {error && <p className="mt-4 text-danger">{error}</p>}
        {!busy && !result && !error && <p className="mt-4 text-muted">Scan a pass or enter its code.</p>}
        {!busy && result && ui && (
          <div
            className={cn(
              "mt-4 rounded-2xl border-2 p-5",
              admitted || (ui.tone === "ok" && !admitted)
                ? "border-success/60 bg-success/10"
                : ui.tone === "warn"
                  ? "border-gold-bright/70 bg-gold/10"
                  : "border-danger/70 bg-danger/10",
            )}
          >
            <p className="flex items-center gap-2 text-2xl font-bold text-ivory">
              {ui.tone === "ok" ? (
                <CircleCheck className="h-7 w-7 text-success" aria-hidden="true" />
              ) : ui.tone === "warn" ? (
                <TriangleAlert className="h-7 w-7 text-gold-bright" aria-hidden="true" />
              ) : (
                <CircleX className="h-7 w-7 text-danger" aria-hidden="true" />
              )}
              {admitted ? "Admitted ✓" : ui.title}
            </p>
            {result.reference && (
              <dl className="mt-4 space-y-1 text-lg">
                <div>
                  <dt className="inline text-muted">Name: </dt>
                  <dd className="inline text-ivory">{result.holderFirstName}</dd>
                </div>
                <div>
                  <dt className="inline text-muted">Booking: </dt>
                  <dd className="inline font-mono text-ivory">{result.reference}</dd>
                </div>
                <div>
                  <dt className="inline text-muted">Pass: </dt>
                  <dd className="inline text-ivory">
                    {result.ticketIndex} of {result.ticketsInBooking}
                  </dd>
                </div>
                {result.checkedInAt && (
                  <div>
                    <dt className="inline text-muted">Checked in: </dt>
                    <dd className="inline text-ivory">{fmt(result.checkedInAt)}</dd>
                  </div>
                )}
              </dl>
            )}
            {result.state === "valid" && !admitted && (
              <button
                type="button"
                className="btn-gold mt-5 min-h-16 w-full text-xl"
                onClick={() => void admit()}
                disabled={busy}
              >
                Admit
              </button>
            )}
            <button
              type="button"
              className="btn-ghost mt-3 w-full"
              onClick={() => {
                setResult(null);
                setAdmitted(false);
                lastRef.current = null;
              }}
            >
              Next guest
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
