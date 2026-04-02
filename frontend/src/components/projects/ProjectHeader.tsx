'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function ProjectHeader({
  title,
  createdAtLabel,
  statusLabel,
  statusClassName,
  onRenameTitle,
}: {
  title: string;
  createdAtLabel: string;
  statusLabel: string;
  statusClassName: string;
  onRenameTitle?: (newTitle: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(title);
    }
  }, [editing, title]);

  async function commitRename() {
    const nextTitle = draft.trim();
    setEditing(false);

    if (!nextTitle || nextTitle === title || !onRenameTitle) {
      setDraft(title);
      return;
    }

    setSaving(true);
    setRenameError(null);

    try {
      await onRenameTitle(nextTitle);
    } catch (error) {
      setDraft(title);
      setRenameError((error as Error).message || 'Failed to rename project.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <header>
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/projects" className="hover:text-slate-300 transition-colors">
          Projects
        </Link>
        <span>/</span>
        <span className="text-slate-300">{title}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            {editing ? (
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => void commitRename()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void commitRename();
                  }
                  if (event.key === 'Escape') {
                    setDraft(title);
                    setEditing(false);
                    setRenameError(null);
                  }
                }}
                autoFocus
                maxLength={120}
                className="w-full max-w-3xl rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-3xl font-semibold tracking-tight text-white outline-none ring-0"
                aria-label="Project title"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (!saving && onRenameTitle) {
                    setEditing(true);
                    setRenameError(null);
                  }
                }}
                disabled={saving || !onRenameTitle}
                className="max-w-full truncate rounded-xl text-left transition-colors hover:text-violet-100 disabled:cursor-default"
                title={onRenameTitle ? 'Click to rename project' : title}
              >
                {title}
              </button>
            )}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Created {createdAtLabel}</p>
          {renameError && <p className="mt-2 text-sm text-rose-300">{renameError}</p>}
        </div>

        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClassName}`}>
            {saving ? 'Saving…' : statusLabel}
          </span>
          <Link
            href="/recordings"
            className="rounded-xl border border-white/8 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-white/16 hover:text-white transition-colors"
          >
            All recordings
          </Link>
        </div>
      </div>
    </header>
  );
}
