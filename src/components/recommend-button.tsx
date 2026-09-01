"use client";

import { useState } from "react";
import { MessageSquarePlus, X } from "lucide-react";
import { RecommendationForm } from "@/components/recommendation-form";

/**
 * Top-bar entry point for the SEO inbox: drop a recommendation (note +
 * screenshot) from ANY page, without navigating to /recommendations. Opens the
 * same submit form in a modal; the inbox page stays the place to review them.
 */
export function RecommendButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Send an SEO recommendation"
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-2.5 py-1.5 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
      >
        <MessageSquarePlus size={14} /> <span className="hidden sm:inline">Recommend</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-16"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-medium">Send an SEO recommendation</h3>
                <p className="text-[12px] text-[var(--muted)]">
                  A note plus an optional screenshot — it lands in the SEO inbox for review.
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-[var(--subtle)] hover:text-[var(--text)]">
                <X size={16} />
              </button>
            </div>
            <RecommendationForm onSuccess={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
