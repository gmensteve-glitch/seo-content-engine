"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A form submit button that reflects the pending state of its parent <form>'s
 * server action: while the action runs it disables itself (no double-submit)
 * and swaps its icon for a spinner + optional pending label. Drop it inside any
 * server-rendered <form action={serverAction}> — it reads status via context.
 */
export function SubmitButton({
  children,
  icon,
  pendingLabel,
  className,
  title,
}: {
  children: ReactNode;
  icon?: ReactNode;
  pendingLabel?: string;
  className?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={title}
      aria-busy={pending}
      className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? <Loader2 size={13} className="animate-spin" /> : icon}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
