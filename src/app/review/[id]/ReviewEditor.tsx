"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PolishDraftVM } from "@/lib/data/types";
import { Bar } from "@/components/ui";
import {
  Sparkles,
  Wand2,
  RefreshCw,
  X,
  Rocket,
  MessageSquare,
  MousePointerClick,
  ArrowLeft,
  CheckCircle2,
  ThumbsUp,
  ThumbsDown,
  Eye,
  Image as ImageIcon,
  Upload,
} from "lucide-react";

// Preset image rejections. The `reason` is a full instruction — it's both stored
// as feedback and injected into future image prompts as a learned "avoid" rule.
const IMAGE_REJECTS: { label: string; reason: string }[] = [
  { label: "Floating", reason: "the subject was floating or not resting on a surface — keep it firmly grounded on a real surface with proper contact shadows" },
  { label: "Looks fake / AI", reason: "it looked fake, CGI, or AI-generated — it must look like a real professional photograph, not a render" },
  { label: "Wrong subject", reason: "the subject was wrong or confusing for the topic — depict the actual subject of the article clearly" },
  { label: "Off-brand", reason: "the tone was off-brand — keep it more dignified, understated, and respectful" },
  { label: "Too cluttered", reason: "the composition was too busy — use a simpler, cleaner composition with one clear subject" },
];

export function ReviewEditor({ initial }: { initial: PolishDraftVM }) {
  const [vm, setVm] = useState<PolishDraftVM>(initial);
  const [selection, setSelection] = useState("");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<
    null | "edit" | "regrade" | "schedule" | "publish" | "feedback"
  >(null);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<null | { label: string; href: string }>(null);
  const [fbMode, setFbMode] = useState<null | "LIKE" | "REJECT">(null);
  const [fbText, setFbText] = useState("");
  const [preview, setPreview] = useState<null | {
    html: string;
    seoTitle: string;
    metaDescription: string;
    slug: string;
    ok: boolean;
    issues: string[];
  }>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [imgBusy, setImgBusy] = useState<null | "ai" | "stock" | "like" | "reject" | "upload">(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [hasImg, setHasImg] = useState(initial.hasHeroImage);
  const [imgSource, setImgSource] = useState<string | null>(initial.heroImageSource);
  const [imgVer, setImgVer] = useState(0); // cache-bust the <img> after a swap
  const bodyRef = useRef<HTMLDivElement>(null);

  const gap = vm.threshold - vm.overall;
  const passed = vm.status === "passed";

  async function post(path: string, body: Record<string, unknown>) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  }

  // Generate a fresh AI image, or swap to a real stock photo, for the hero.
  async function rotateImage(prefer: "ai" | "stock") {
    setImgBusy(prefer);
    setNote(
      prefer === "ai"
        ? "Generating a new image… (~10–20s)"
        : "Finding a stock photo…",
    );
    try {
      const { ok, data } = await post("/api/review/image", { draftId: vm.id, prefer });
      if (!ok || !data.hasImage) {
        setNote(data.error ? `Error: ${data.error}` : "Couldn't get an image — is the image key set?");
        setImgBusy(null);
        return;
      }
      setHasImg(true);
      setImgSource((data.source as string) ?? null);
      setImgVer((v) => v + 1);
      setNote(prefer === "ai" ? "New image generated." : "Swapped to a stock photo.");
    } catch {
      setNote("Network error — try again.");
    }
    setImgBusy(null);
  }

  // Leave feedback on the current image. A LIKE is just recorded (steers future
  // images); a REJECT records the reason AND regenerates now with it applied.
  async function imageFeedback(verdict: "LIKE" | "REJECT", reason: string) {
    setImgBusy(verdict === "LIKE" ? "like" : "reject");
    setNote(verdict === "LIKE" ? "Saving your feedback…" : `Rejected (“${reason}”) — regenerating with that in mind…`);
    try {
      const { ok, data } = await post("/api/review/image", {
        draftId: vm.id,
        feedback: { verdict, reason },
      });
      if (!ok) {
        setNote(data.error ? `Error: ${data.error}` : "Couldn't save feedback.");
        setImgBusy(null);
        return;
      }
      if (data.regenerated) {
        setHasImg(Boolean(data.hasImage));
        setImgSource((data.source as string) ?? null);
        setImgVer((v) => v + 1);
        setNote("New image generated with your feedback applied. It'll keep learning from every rating.");
      } else {
        setNote("Thanks — noted. Future images will lean this way.");
      }
    } catch {
      setNote("Network error — try again.");
    }
    setImgBusy(null);
  }

  // Upload your own hero image — read as base64 client-side, store on the draft.
  async function uploadImage(file: File) {
    if (!file.type.startsWith("image/")) {
      setNote("That's not an image file — pick a JPG, PNG, or WebP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setNote("Image too large — keep it under 10MB.");
      return;
    }
    setImgBusy("upload");
    setNote(`Uploading “${file.name}”…`);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(file);
      });
      const { ok, data } = await post("/api/review/image", {
        draftId: vm.id,
        upload: { base64, mime: file.type },
      });
      if (!ok || !data.hasImage) {
        setNote(data.error ? `Error: ${data.error}` : "Upload failed — try again.");
        setImgBusy(null);
        return;
      }
      setHasImg(true);
      setImgSource("upload");
      setImgVer((v) => v + 1);
      setNote("Your image is set.");
    } catch {
      setNote("Couldn't read that file — try again.");
    }
    setImgBusy(null);
  }

  async function run(
    kind: typeof busy,
    path: string,
    body: Record<string, unknown>,
    onOk: (data: Record<string, unknown>) => void,
  ) {
    setBusy(kind);
    setNote("");
    try {
      const { ok, data } = await post(path, body);
      if (!ok) {
        setNote(data.error ? `Error: ${data.error}` : "Something went wrong.");
        return;
      }
      onOk(data);
    } catch {
      setNote("Network error — try again.");
    } finally {
      setBusy(null);
    }
  }

  // Fetch the rendered preview. First statement is `await`, so no synchronous
  // setState in the mount effect.
  const loadPreview = useCallback(async () => {
    try {
      const res = await fetch(`/api/review/preview?draftId=${vm.id}`);
      const data = await res.json().catch(() => ({}));
      if (data.html !== undefined) {
        setPreview(data);
        setShowPreview(true);
      } else {
        setNote(data.error ? `Preview error: ${data.error}` : "Couldn't build preview.");
      }
    } catch {
      setNote("Network error building preview.");
    }
  }, [vm.id]);

  // Land on the rendered "as it'll look on the site" view by default. loadPreview
  // only setState after an await (fetch), so this is a safe fetch-on-mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPreview();
  }, [loadPreview]);

  async function togglePreview() {
    if (showPreview) {
      setShowPreview(false);
      return;
    }
    if (preview) {
      setShowPreview(true);
      return;
    }
    setPreviewLoading(true);
    try {
      await loadPreview();
    } finally {
      setPreviewLoading(false);
    }
  }

  function captureSelection() {
    const sel = window.getSelection()?.toString() ?? "";
    if (sel.trim().length > 2) setSelection(sel);
  }

  const applyEdit = () =>
    run("edit", "/api/review/edit", { draftId: vm.id, selectedText: selection, instruction }, (d) => {
      if (d.draft) setVm(d.draft as PolishDraftVM);
      setSelection("");
      setInstruction("");
      setNote("Passage updated. Re-grade to see the new score.");
    });


  const regrade = () =>
    run("regrade", "/api/review/regrade", { draftId: vm.id }, (d) => {
      if (d.draft) setVm(d.draft as PolishDraftVM);
      setNote("Re-graded.");
    });

  const publish = (publishState: "published" | "draft") =>
    run("publish", "/api/review/publish", { draftId: vm.id, publishState }, (d) => {
      setDone({
        label: publishState === "draft" ? "Published as a hidden Shopify draft" : "Published live to Shopify",
        href: (d.url as string) || "/performance",
      });
    });

  // Send as hidden draft, then jump to the post in Shopify admin in a new tab.
  // Open the tab synchronously on click so the browser's popup blocker allows it,
  // then point it at the admin URL once the API returns.
  const sendAsDraft = () => {
    const win = typeof window !== "undefined" ? window.open("about:blank", "_blank") : null;
    run("publish", "/api/review/publish", { draftId: vm.id, publishState: "draft" }, (d) => {
      const target = (d.adminUrl as string) || (d.url as string) || "";
      if (win) {
        if (target) win.location.href = target;
        else win.close();
      }
      setDone({ label: "Sent as a hidden Shopify draft — opening it in Shopify", href: target || "/performance" });
    });
  };

  const submitFeedback = () => {
    if (!fbMode || !fbText.trim()) return;
    run("feedback", "/api/review/feedback", { draftId: vm.id, verdict: fbMode, reason: fbText }, () => {
      if (fbMode === "REJECT") {
        setDone({ label: "Rejected — pulled from your Ready list, and your reason is logged", href: "/ready" });
      } else {
        setNote("Thanks — logged what you liked. I'll use it to tune the next pieces.");
        setFbMode(null);
        setFbText("");
      }
    });
  };

  return (
    <div>
      <Link
        href={passed ? "/ready" : "/review"}
        className="mb-3 inline-flex items-center gap-1 text-[12px] text-[var(--muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft size={13} /> {passed ? "All ready pieces" : "All near-misses"}
      </Link>

      {/* Score header (Quality-style) */}
      <div className="mb-1 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold tracking-tight">{vm.title}</h1>
          <div className="mt-0.5 text-[12px] text-[var(--muted)]">{vm.targetKeyword}</div>
        </div>
      </div>
      <div className="mb-4 flex items-baseline gap-3">
        <span
          className={`text-[44px] font-semibold leading-none ${passed ? "text-[var(--success)]" : "text-[var(--warn)]"}`}
        >
          {vm.overall}
        </span>
        <span className="text-[12.5px] text-[var(--muted)]">
          / 100 · {passed ? `passed threshold (${vm.threshold})` : `${gap} below threshold (${vm.threshold})`} · loop{" "}
          {vm.loop}
          {vm.costCents > 0 && (
            <> · cost <b className="text-[var(--text)]">${(vm.costCents / 100).toFixed(2)}</b></>
          )}
        </span>
      </div>

      {/* Success banner after publish */}
      {done && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--success)] bg-[var(--success-bg)] px-3 py-2.5 text-[13px] text-[var(--success)]">
          <CheckCircle2 size={16} /> {done.label}.
          {done.href.startsWith("http") ? (
            <a
              href={done.href}
              target="_blank"
              rel="noreferrer"
              className="ml-1 font-medium underline"
            >
              View on Shopify ↗
            </a>
          ) : (
            <Link href={done.href} className="ml-1 font-medium underline">
              See it
            </Link>
          )}
        </div>
      )}

      {/* FULL scorecard — every dimension, always visible */}
      <div className="mb-4 space-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
        {vm.dimensions.map((d) => {
          const pct = (d.score / d.max) * 100;
          const tone = pct >= 85 ? "success" : pct >= 70 ? "warn" : "danger";
          return (
            <div key={d.key}>
              <div className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-[12px] text-[var(--muted)]">{d.label}</span>
                <Bar pct={pct} tone={tone} />
                <span className="w-12 shrink-0 text-right text-[12px] text-[var(--muted)]">
                  {d.score}/{d.max}
                </span>
              </div>
              {d.note && <p className="ml-40 pl-3 text-[11px] text-[var(--subtle)]">{d.note}</p>}
            </div>
          );
        })}
        {vm.feedback && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2.5">
            <MessageSquare size={15} className="mt-0.5 shrink-0 text-[var(--muted)]" />
            <p className="text-[12.5px] text-[var(--text)]">
              <span className="font-medium">Notes: </span>
              {vm.feedback}
            </p>
          </div>
        )}
      </div>

      {/* Primary actions */}
      {passed && !done ? (
        <div className="mb-4 rounded-xl border border-[var(--success)] bg-[var(--success-bg)] p-4">
          <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--success)]">
            <CheckCircle2 size={13} /> Ready to publish
          </div>
          <p className="mb-2.5 text-[12px] text-[var(--muted)]">
            Push it straight to your Shopify blog. Go live now, or drop it in as a hidden
            draft to eyeball on Shopify first — either way it publishes with its hero image.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => publish("published")}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--success)] px-4 py-2 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              <Rocket size={15} /> {busy === "publish" ? "Publishing…" : "Publish to Shopify"}
            </button>
            <button
              onClick={sendAsDraft}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-[13px] text-[var(--muted)] hover:bg-[var(--surface-1)] disabled:opacity-50"
            >
              <Rocket size={14} /> {busy === "publish" ? "Sending…" : "Send as hidden draft ↗"}
            </button>
          </div>

          {/* Feedback — teach me your taste. LIKE keeps it, REJECT pulls it. */}
          <div className="mt-4 border-t border-[var(--success)] pt-3">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
              Not quite right, or nailed it? Tell me why
            </div>
            {fbMode === null ? (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFbMode("LIKE")}
                  disabled={busy !== null}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-1)] px-3 py-1.5 text-[12.5px] text-[var(--text)] hover:bg-[var(--surface-2)] disabled:opacity-50"
                >
                  <ThumbsUp size={13} className="text-[var(--success)]" /> I like it because…
                </button>
                <button
                  onClick={() => setFbMode("REJECT")}
                  disabled={busy !== null}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-1)] px-3 py-1.5 text-[12.5px] text-[var(--text)] hover:bg-[var(--surface-2)] disabled:opacity-50"
                >
                  <ThumbsDown size={13} className="text-[var(--danger)]" /> Reject &amp; why…
                </button>
              </div>
            ) : (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium">
                  {fbMode === "LIKE" ? (
                    <>
                      <ThumbsUp size={13} className="text-[var(--success)]" /> What worked about this piece?
                    </>
                  ) : (
                    <>
                      <ThumbsDown size={13} className="text-[var(--danger)]" /> What&apos;s wrong with it? (this pulls it from Ready)
                    </>
                  )}
                </div>
                <textarea
                  autoFocus
                  value={fbText}
                  onChange={(e) => setFbText(e.target.value)}
                  rows={2}
                  placeholder={
                    fbMode === "LIKE"
                      ? "e.g. 'great answer-first intro', 'perfect length', 'loved the tone'"
                      : "e.g. 'intro is boring', 'too salesy', 'wrong angle', 'reads like AI'"
                  }
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-0)] px-3 py-2 text-[13px]"
                />
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    onClick={submitFeedback}
                    disabled={busy !== null || !fbText.trim()}
                    className={`rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-50 ${
                      fbMode === "REJECT" ? "bg-[var(--danger)]" : "bg-[var(--success)]"
                    } hover:brightness-110`}
                  >
                    {busy === "feedback" ? "Saving…" : fbMode === "REJECT" ? "Reject & log reason" : "Save feedback"}
                  </button>
                  <button
                    onClick={() => {
                      setFbMode(null);
                      setFbText("");
                    }}
                    className="text-[12px] text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : !passed ? (
        <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3">
          <div className="flex items-start gap-2 text-[12.5px]">
            <Sparkles size={15} className="mt-0.5 shrink-0 text-[var(--accent)]" />
            <span>
              <b>Already boosted to {vm.overall}.</b> The engine ran its data boost and revisions
              automatically — this is its ceiling, just under your bar of {vm.threshold}. Add a real
              detail below and re-grade to push it over, or reject it.
            </span>
          </div>
          <div className="mt-2.5">
            <button
              onClick={regrade}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-[13px] text-[var(--muted)] hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              <RefreshCw size={14} /> {busy === "regrade" ? "Grading…" : "Re-grade"}
            </button>
          </div>
        </div>
      ) : null}

      {note && (
        <div className="mb-2 rounded-md bg-[var(--surface-2)] px-3 py-2 text-[12px] text-[var(--text)]">
          {note}
        </div>
      )}

      {/* Hero image — generate a new one, or swap to a real stock photo */}
      <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3">
        <div className="mb-2 flex items-center gap-2">
          <ImageIcon size={13} className="text-[var(--accent)]" />
          <span className="text-[12px] font-medium">Hero image</span>
          {imgSource && (
            <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
              {imgSource === "ai"
                ? "AI-generated"
                : imgSource === "unsplash"
                  ? "stock photo"
                  : imgSource === "upload"
                    ? "your upload"
                    : "product photo"}
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => rotateImage("ai")}
              disabled={imgBusy !== null}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              <Sparkles size={13} /> {imgBusy === "ai" ? "Generating…" : hasImg ? "Generate new" : "Generate image"}
            </button>
            <button
              onClick={() => rotateImage("stock")}
              disabled={imgBusy !== null}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              <RefreshCw size={12} /> {imgBusy === "stock" ? "Finding…" : "Stock photo"}
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={imgBusy !== null}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              <Upload size={12} /> {imgBusy === "upload" ? "Uploading…" : "Upload your own"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadImage(f);
                e.target.value = ""; // allow re-selecting the same file
              }}
            />
          </div>
        </div>
        {hasImg ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/review/image?draftId=${vm.id}&v=${imgVer}`}
              alt={vm.title}
              className="max-h-72 w-full rounded-lg object-cover"
            />
            {/* Feedback — trains future image generation for this business */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] text-[var(--muted)]">Rate this image:</span>
              <button
                onClick={() => imageFeedback("LIKE", "This style works well — more like this")}
                disabled={imgBusy !== null}
                className="flex items-center gap-1 rounded-full border border-[var(--success)] px-2.5 py-1 text-[11px] text-[var(--success)] hover:bg-[var(--success-bg)] disabled:opacity-50"
              >
                <ThumbsUp size={11} /> Good
              </button>
              {IMAGE_REJECTS.map((r) => (
                <button
                  key={r.label}
                  onClick={() => imageFeedback("REJECT", r.reason)}
                  disabled={imgBusy !== null}
                  className="flex items-center gap-1 rounded-full border border-[var(--border-strong)] px-2.5 py-1 text-[11px] text-[var(--muted)] hover:bg-[var(--surface-2)] disabled:opacity-50"
                  title={`Reject: ${r.reason}`}
                >
                  <ThumbsDown size={11} /> {r.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10.5px] text-[var(--subtle)]">
              Rejecting regenerates with your note applied — and every rating trains future images.
            </p>
          </>
        ) : (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-[var(--border-strong)] py-8 text-[12px] text-[var(--muted)]">
            No image yet — generate one, or the engine will add one automatically.
          </div>
        )}
      </div>

      {/* Read the post — highlight any text to reword it, or preview the final render */}
      <div className="mb-1.5 flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--subtle)]">
          <MousePointerClick size={12} />{" "}
          {showPreview ? "How it'll look on your site" : "Source — highlight any line to reword it"}
        </div>
        <button
          onClick={togglePreview}
          disabled={previewLoading}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-2.5 py-1 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)] disabled:opacity-50"
        >
          <Eye size={13} />
          {previewLoading ? "Rendering…" : showPreview ? "Edit / reword source" : "View as published"}
        </button>
      </div>

      {/* Pre-publish check badge (the buffer) */}
      {showPreview && preview && (
        <div
          className={`mb-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px] ${
            preview.ok
              ? "border-[var(--success)] bg-[var(--success-bg)] text-[var(--success)]"
              : "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)]"
          }`}
        >
          {preview.ok ? (
            <>
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> Passed all pre-publish checks — safe to publish.
            </>
          ) : (
            <div>
              <div className="mb-0.5 font-medium">Blocked — this can&apos;t publish until fixed:</div>
              <ul className="list-disc pl-4">
                {preview.issues.map((i, n) => (
                  <li key={n}>{i}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {showPreview && preview ? (
        <>
          {/* Search-engine snippet — exactly the title + meta that will publish */}
          <div className="mb-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
            <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--subtle)]">
              Search engine preview
              <span className="ml-auto flex gap-2 font-normal normal-case tracking-normal text-[10px]">
                <span className={preview.seoTitle.length > 60 ? "text-[var(--warn)]" : "text-[var(--muted)]"}>
                  title {preview.seoTitle.length}/60
                </span>
                <span className={preview.metaDescription.length > 160 ? "text-[var(--warn)]" : "text-[var(--muted)]"}>
                  meta {preview.metaDescription.length}/160
                </span>
              </span>
            </div>
            <div className="text-[12px] text-[#5f6368]">
              trustedcaskets.com › blogs › news › {preview.slug}
            </div>
            <div className="text-[16px] leading-snug text-[#1a0dab]">{preview.seoTitle}</div>
            <div className="text-[12.5px] leading-snug text-[#4d5156]">{preview.metaDescription}</div>
          </div>
          {/* Rendered like a real blog page — white readable column + article typography */}
          <div className="max-h-[70vh] overflow-y-auto rounded-xl border border-[var(--border)] bg-white">
            <div className="mx-auto max-w-[720px] px-6 py-8">
              <article className="article-preview" dangerouslySetInnerHTML={{ __html: preview.html }} />
            </div>
          </div>
        </>
      ) : (
        <div
          ref={bodyRef}
          onMouseUp={captureSelection}
          className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 text-[13.5px] leading-relaxed text-[var(--text)] selection:bg-[var(--accent)] selection:text-white"
        >
          {vm.bodyMd}
        </div>
      )}

      {/* Highlight → instruct chatbox */}
      {selection && (
        <div className="fixed inset-x-0 bottom-4 z-30 mx-auto w-[min(680px,92vw)] rounded-xl border border-[var(--border-strong)] bg-[var(--surface-1)] p-3 shadow-lg">
          <div className="mb-2 flex items-start gap-2">
            <Wand2 size={14} className="mt-0.5 shrink-0 text-[var(--accent)]" />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium text-[var(--muted)]">Selected passage</div>
              <div className="truncate text-[12px] text-[var(--text)]">
                &ldquo;{selection.slice(0, 120)}
                {selection.length > 120 ? "…" : ""}&rdquo;
              </div>
            </div>
            <button
              onClick={() => {
                setSelection("");
                setInstruction("");
              }}
              className="shrink-0 text-[var(--subtle)] hover:text-[var(--text)]"
            >
              <X size={15} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && busy === null) applyEdit();
              }}
              placeholder="What should I change? e.g. 'shorten this', 'add a real stat', 'make it warmer'"
              className="flex-1 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-0)] px-3 py-2 text-[13px]"
            />
            <button
              onClick={applyEdit}
              disabled={busy !== null || !instruction.trim()}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              <Wand2 size={14} /> {busy === "edit" ? "Editing…" : "Apply"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
