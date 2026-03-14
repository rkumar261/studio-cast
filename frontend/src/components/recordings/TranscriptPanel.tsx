'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TranscriptAPI,
  type GetTranscriptResponse,
  type SaveTranscriptSegmentInput,
} from '@/lib/api';

type Props = {
  recordingId: string;
  onSeekToMs?: (ms: number) => void;
  onSavedRevision?: () => void;
};

type DraftSegment = {
  id: string;
  trackId: string | null;
  startMs: number;
  endMs: number;
  text: string;
  speaker: string | null;
  confidence: number | null;
};

function formatClock(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function stateLabel(state: 'pending' | 'processing' | 'ready' | 'failed') {
  if (state === 'ready') return 'Published';
  if (state === 'processing') return 'Processing';
  if (state === 'failed') return 'Failed';
  return 'Pending';
}

function stateClass(state: 'pending' | 'processing' | 'ready' | 'failed') {
  if (state === 'ready') return 'border-emerald-600/50 bg-emerald-500/10 text-emerald-200';
  if (state === 'processing') return 'border-cyan-600/50 bg-cyan-500/10 text-cyan-200';
  if (state === 'failed') return 'border-red-600/50 bg-red-500/10 text-red-200';
  return 'border-amber-600/50 bg-amber-500/10 text-amber-200';
}

function mapToDraftSegments(data: GetTranscriptResponse): DraftSegment[] {
  return data.segments.map((segment) => ({
    id: segment.id,
    trackId: segment.trackId,
    startMs: segment.startMs,
    endMs: segment.endMs,
    text: segment.text,
    speaker: segment.speaker,
    confidence: segment.confidence,
  }));
}

export default function TranscriptPanel(props: Props) {
  const { recordingId, onSeekToMs, onSavedRevision } = props;

  const [data, setData] = useState<GetTranscriptResponse | null>(null);
  const [draftSegments, setDraftSegments] = useState<DraftSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const loadTranscript = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaveMessage(null);
    try {
      const response = await TranscriptAPI.getForRecording(recordingId);
      setData(response);
      setDraftSegments(mapToDraftSegments(response));
    } catch (err) {
      setError((err as Error).message || 'Failed to load transcript.');
    } finally {
      setLoading(false);
    }
  }, [recordingId]);

  useEffect(() => {
    loadTranscript();
  }, [loadTranscript]);

  const activeSegments = editMode ? draftSegments : (data?.segments ?? []);

  const filteredSegments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const rows = activeSegments.map((segment, index) => ({ segment, index }));
    if (!q) return rows;
    return rows.filter(({ segment }) => {
      const speaker = (segment.speaker ?? '').toLowerCase();
      return segment.text.toLowerCase().includes(q) || speaker.includes(q);
    });
  }, [activeSegments, searchQuery]);

  const transcriptState = data?.transcript.state ?? 'pending';
  const transcriptRevision = data?.transcript.revision ?? 0;
  const publishedAt = data?.transcript.publishedAt;
  const isPublished = transcriptState === 'ready' && !!publishedAt;

  function resetDraftToServer() {
    if (!data) return;
    setDraftSegments(mapToDraftSegments(data));
  }

  function updateDraftSegment(index: number, patch: Partial<DraftSegment>) {
    setDraftSegments((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      next[index] = { ...current, ...patch };
      return next;
    });
  }

  async function saveRevision(publish: boolean) {
    if (!data) return;
    setSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const payloadSegments: SaveTranscriptSegmentInput[] = draftSegments.map((segment) => ({
        trackId: segment.trackId,
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
        speaker: segment.speaker,
        confidence: segment.confidence,
      }));

      const saved = await TranscriptAPI.saveRevision(recordingId, {
        baseRevision: data.transcript.revision,
        publish,
        segments: payloadSegments,
      });

      setData(saved);
      setDraftSegments(mapToDraftSegments(saved));
      setEditMode(false);
      setSaveMessage(
        publish
          ? `Saved and published revision ${saved.transcript.revision}.`
          : `Saved draft revision ${saved.transcript.revision}.`
      );
      onSavedRevision?.();
    } catch (err) {
      const message = (err as Error).message || 'Failed to save transcript revision.';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-100">Transcript</h3>
          <p className="mt-1 text-xs text-slate-400">
            Search, review, and publish transcript revisions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-1 text-[11px] ${stateClass(transcriptState)}`}>
            {stateLabel(transcriptState)}
          </span>
          <span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-300">
            Revision {transcriptRevision}
          </span>
        </div>
      </div>

      <div className="grid gap-3 text-xs text-slate-300 md:grid-cols-4">
        <div className="rounded border border-slate-700 bg-slate-950/40 px-3 py-2">
          Published: {isPublished ? new Date(publishedAt).toLocaleString() : 'Not published yet'}
        </div>
        <div className="rounded border border-slate-700 bg-slate-950/40 px-3 py-2">
          Source: {data?.transcript.sourceType ?? 'machine'}
        </div>
        <div className="rounded border border-slate-700 bg-slate-950/40 px-3 py-2">
          Segments: {activeSegments.length}
        </div>
        <div className="rounded border border-slate-700 bg-slate-950/40 px-3 py-2">
          Language: {(data?.transcript.language ?? 'en').toUpperCase()}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search transcript text or speaker..."
          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 md:max-w-md"
        />
        <button
          type="button"
          onClick={loadTranscript}
          className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-slate-500"
        >
          Refresh
        </button>
        {!editMode ? (
          <button
            type="button"
            onClick={() => {
              resetDraftToServer();
              setEditMode(true);
              setSaveMessage(null);
            }}
            className="rounded border border-cyan-700 px-3 py-2 text-xs text-cyan-100 hover:border-cyan-500"
            disabled={loading || !data}
          >
            Edit transcript
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => saveRevision(true)}
              disabled={saving || draftSegments.length === 0}
              className="rounded border border-emerald-700 px-3 py-2 text-xs text-emerald-100 hover:border-emerald-500 disabled:opacity-60"
            >
              {saving ? 'Saving…' : `Save + publish revision ${transcriptRevision + 1}`}
            </button>
            <button
              type="button"
              onClick={() => saveRevision(false)}
              disabled={saving || draftSegments.length === 0}
              className="rounded border border-amber-700 px-3 py-2 text-xs text-amber-100 hover:border-amber-500 disabled:opacity-60"
            >
              {saving ? 'Saving…' : `Save draft revision ${transcriptRevision + 1}`}
            </button>
            <button
              type="button"
              onClick={() => {
                resetDraftToServer();
                setEditMode(false);
              }}
              className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-slate-500"
              disabled={saving}
            >
              Cancel edits
            </button>
          </>
        )}
      </div>

      {saveMessage && (
        <p className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {saveMessage}
        </p>
      )}

      {error && (
        <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      )}

      {loading ? (
        <div className="rounded border border-slate-700 px-3 py-4 text-sm text-slate-400">Loading transcript…</div>
      ) : filteredSegments.length === 0 ? (
        <div className="rounded border border-slate-700 px-3 py-4 text-sm text-slate-400">
          {searchQuery.trim() ? 'No segments match your search.' : 'No transcript segments yet.'}
        </div>
      ) : (
        <div className="max-h-[460px] space-y-2 overflow-y-auto rounded border border-slate-800 bg-slate-950/40 p-2">
          {filteredSegments.map(({ segment, index }) => (
            <article
              key={`${segment.id}-${index}`}
              className="rounded border border-slate-800 bg-slate-950/70 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSeekToMs?.(segment.startMs)}
                  className="rounded border border-cyan-700 px-2 py-1 text-xs text-cyan-100 hover:border-cyan-500"
                >
                  {formatClock(segment.startMs)} - {formatClock(segment.endMs)}
                </button>
                {!editMode ? (
                  <span className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-300">
                    {segment.speaker?.trim() || 'Unknown speaker'}
                  </span>
                ) : (
                  <input
                    type="text"
                    value={segment.speaker ?? ''}
                    onChange={(e) =>
                      updateDraftSegment(index, {
                        speaker: e.target.value.trim() ? e.target.value : null,
                      })
                    }
                    className="min-w-[180px] rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                    placeholder="Speaker label"
                  />
                )}
              </div>

              {!editMode ? (
                <p className="mt-2 text-sm text-slate-100">{segment.text}</p>
              ) : (
                <textarea
                  value={segment.text}
                  onChange={(e) => updateDraftSegment(index, { text: e.target.value })}
                  rows={2}
                  className="mt-2 w-full rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100"
                />
              )}
            </article>
          ))}
        </div>
      )}

      {editMode && (
        <p className="text-xs text-slate-400">
          Saving creates a new revision and keeps prior machine output history explicit.
        </p>
      )}
    </section>
  );
}
