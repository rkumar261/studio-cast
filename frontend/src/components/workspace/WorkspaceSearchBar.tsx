export default function WorkspaceSearchBar() {
  return (
    <div className="mx-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.06] px-4 py-3 text-sm text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4 text-slate-500"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        placeholder="Search"
        aria-label="Search workspace"
        className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none"
      />
    </div>
  );
}
