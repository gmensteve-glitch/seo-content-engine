"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Loader2, Send, X } from "lucide-react";
import { submitRecommendationAction } from "@/app/actions";

/**
 * The submit box for the SEO inbox: notes on what to improve plus an optional
 * screenshot. Shows a thumbnail preview before sending and resets on success.
 */
export function RecommendationForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return setPreview(null);
    if (!f.type.startsWith("image/")) return setError("Attachment must be an image.");
    if (f.size > 5 * 1024 * 1024) return setError("Screenshot too large (max 5 MB).");
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(f);
  }

  function clearImage() {
    setPreview(null);
    const input = formRef.current?.elements.namedItem("image") as HTMLInputElement | null;
    if (input) input.value = "";
  }

  function submit(formData: FormData) {
    setError(null);
    if (!String(formData.get("note") ?? "").trim()) {
      setError("Add a note describing what to improve.");
      return;
    }
    start(async () => {
      try {
        await submitRecommendationAction(formData);
        formRef.current?.reset();
        setPreview(null);
        onSuccess?.();
      } catch {
        setError("Couldn't submit — please try again.");
      }
    });
  }

  return (
    <form ref={formRef} action={submit} className="space-y-3">
      <textarea
        name="note"
        rows={3}
        placeholder="What should we improve? e.g. “H1 on the NC delivery post is too generic — target ‘casket delivery North Carolina’ and add a price table.”"
        className="w-full resize-y rounded-lg border border-[var(--border-strong)] bg-[var(--surface-0)] px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="author"
          placeholder="Your name (optional)"
          className="min-w-[160px] flex-1 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-0)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]"
        />
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)]">
          <ImagePlus size={14} /> {preview ? "Change screenshot" : "Attach screenshot"}
          <input name="image" type="file" accept="image/*" className="hidden" onChange={onFile} />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          Send to review
        </button>
      </div>
      {preview && (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Screenshot preview"
            className="max-h-48 rounded-lg border border-[var(--border)]"
          />
          <button
            type="button"
            onClick={clearImage}
            title="Remove screenshot"
            className="absolute -right-2 -top-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface-1)] p-1 text-[var(--muted)] hover:text-[var(--text)]"
          >
            <X size={12} />
          </button>
        </div>
      )}
      {error && <p className="text-[12px] text-[var(--danger)]">{error}</p>}
    </form>
  );
}
