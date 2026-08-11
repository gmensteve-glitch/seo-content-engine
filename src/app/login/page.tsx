import { Lock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-0)] p-6">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-7">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-bg)] text-[var(--accent)]">
            <Lock size={18} />
          </span>
          <div>
            <div className="text-[15px] font-medium text-[var(--text)]">SEO Content Engine</div>
            <div className="text-[12px] text-[var(--muted)]">Sign in to continue</div>
          </div>
        </div>

        <form action="/api/auth/login" method="POST" className="space-y-3">
          <input
            type="password"
            name="password"
            autoFocus
            required
            placeholder="Password"
            className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />
          {error && (
            <p className="text-[12.5px] text-[var(--danger)]">Incorrect password. Try again.</p>
          )}
          <button
            type="submit"
            className="w-full rounded-lg bg-[var(--accent)] px-3 py-2.5 text-[14px] font-medium text-white hover:opacity-90"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
