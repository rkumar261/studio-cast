'use client';
import { useEffect, useMemo, useState } from 'react';
import * as tus from 'tus-js-client';
import {
  UploadsAPI,
  type InitiateUploadResponse,
  type UploadProtocol,
  type TrackKind,
} from '@/lib/api';
import { uploadMultipartFile } from '@/lib/multipartUploader';

type RawParticipant = {
  id?: string;
  participantId?: string;
  role: 'host' | 'guest';
  displayName?: string;
  name?: string;
  email?: string;
};

type Props = {
  recordingId: string;
  participants: RawParticipant[];
  onUploaded?: () => void; // parent can pass a refetch callback
};

export default function UploadInitiateCard({ recordingId, participants, onUploaded }: Props) {
  // normalize shape from API
  const options = useMemo(
    () =>
      (participants ?? []).map((p) => {
        const id = (p.id || p.participantId || '').toString();
        const label = p.displayName || p.name || p.email || id;
        return { id, label, role: p.role };
      }),
    [participants]
  );

  const [participantId, setParticipantId] = useState<string>('');
  const [kind, setKind] = useState<TrackKind>('audio');
  const [protocol, setProtocol] = useState<UploadProtocol>('tus');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<InitiateUploadResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // file + progress
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);

  // clear selection if participants refresh and current is gone
  useEffect(() => {
    if (participantId && !options.find((o) => o.id === participantId)) {
      setParticipantId('');
    }
  }, [options, participantId]);

  const ready = !!participantId && !!kind && !!protocol;

  async function onInitiate(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;

    setBusy(true);
    setErr(null);
    setPlan(null);

    // For multipart, we must know size/filename to precompute part URLs
    if (protocol === 'multipart' && !file) {
      setBusy(false);
      setErr('Pick a file first (required for multipart uploads).');
      return;
    }

    try {
      const res = await UploadsAPI.initiate(
        protocol === 'multipart'
          ? {
              recordingId,
              participantId,
              kind,
              protocol,
              filename: file!.name,
              size: file!.size,
              contentType: file!.type || 'application/octet-stream',
            }
          : { recordingId, participantId, kind, protocol }
      );
      setPlan(res);
      // reset previous progress for a fresh transfer
      setProgress(0);
      // For TUS we don't need the selected file until after initiate; clear to avoid confusion.
      if (protocol === 'tus') setFile(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // send bytes → then mark complete → notify parent
  async function startTransfer() {
    if (!plan || !file) return;

    setBusy(true);
    setErr(null);
    try {
      if (plan.tusEndpoint) {
        // ---------- TUS PATH ----------
        await new Promise<void>((resolve, reject) => {
          const up = new tus.Upload(file, {
            endpoint: plan.tusEndpoint!, // from initiate
            metadata: {
              'upload-id': plan.upload.id,
              'track-id': plan.upload.trackId,
              filename: file.name,
              filetype: file.type,
            },
            chunkSize: 5 * 1024 * 1024, // 5MiB
            retryDelays: [300, 600, 1200],
            onError: (error) => reject(error),
            onProgress: (sent, total) => setProgress(Math.round((sent / total) * 100)),
            onSuccess: () => resolve(),
          });

          up.start();
        });

        // tell backend to finalize (idempotent)
        await UploadsAPI.complete(plan.upload.id, { bytes: file.size });
      } else if (plan.presignedUrls?.length && plan.partSize) {
        // ---------- MULTIPART PATH ----------
        // 1) PUT each part to its presigned URL (collect ETags)
        const parts = await uploadMultipartFile(
          file,
          plan.presignedUrls,
          plan.partSize,
          (pct) => setProgress(pct),
          4, // concurrency
          3  // retries
        );

        // 2) Complete on backend with ETags + size
        await UploadsAPI.complete(plan.upload.id, {
          protocol: 'multipart',
          parts,
          totalBytes: file.size,
        });
      } else {
        throw new Error('No transfer plan available (neither tus nor multipart).');
      }

      // cleanup + notify
      setFile(null);
      setProgress(0);
      if (onUploaded) onUploaded();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border rounded bg-white text-gray-900 p-4 space-y-3">
      <h3 className="font-semibold">Start an Upload</h3>

      <form onSubmit={onInitiate} className="flex flex-wrap items-end gap-2">
        <select
          className="border rounded px-3 py-2 bg-white text-gray-900"
          value={participantId}
          onChange={(e) => setParticipantId(e.target.value)}
          disabled={busy || options.length === 0}
        >
          <option value="">{options.length ? 'Select participant…' : 'No participants available'}</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} {p.role === 'host' ? '(host)' : '(guest)'}
            </option>
          ))}
        </select>

        <select
          className="border rounded px-3 py-2 bg-white text-gray-900"
          value={kind}
          onChange={(e) => setKind(e.target.value as TrackKind)}
          disabled={busy}
        >
          <option value="audio">Audio</option>
          <option value="video">Video</option>
          <option value="screen">Screen</option>
        </select>

        <select
          className="border rounded px-3 py-2 bg-white text-gray-900"
          value={protocol}
          onChange={(e) => {
            setProtocol(e.target.value as UploadProtocol);
            setErr(null);
            // avoid stale pickers when switching protocols
            setFile(null);
          }}
          disabled={busy}
          title="Choose the transfer protocol"
        >
          <option value="tus">tus</option>
          <option value="multipart">multipart</option>
        </select>

        {/* Multipart needs file BEFORE initiate so we can presign by size */}
        {protocol === 'multipart' && (
          <input
            type="file"
            accept="audio/*,video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="border rounded px-3 py-2 bg-white text-gray-900"
            title="Pick a file first (multipart needs size for presigning)"
          />
        )}

        <button
          className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-50"
          disabled={!ready || busy || (protocol === 'multipart' && !file)}
        >
          {busy ? 'Starting…' : 'Initiate Upload'}
        </button>
      </form>

      {options.length === 0 && (
        <p className="text-sm text-gray-600 mt-1">No participants yet — add one above first.</p>
      )}

      {err && <p className="text-red-600 text-sm">{err}</p>}

      {plan && (
        <div className="text-sm mt-2 space-y-2">
          <div className="font-medium">Upload created</div>
          <div>
            uploadId: <code>{plan.upload.id}</code>
          </div>
          <div>
            trackId: <code>{plan.upload.trackId}</code>
          </div>
          <div>
            protocol: <code>{plan.upload.protocol}</code>
          </div>

          {/* ---- TUS: show endpoint + picker + start ---- */}
          {plan.tusEndpoint && (
            <>
              <div className="font-medium">tus endpoint</div>
              <div className="break-all">
                <code>{plan.tusEndpoint}</code>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <input
                  type="file"
                  accept="audio/*,video/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="border rounded px-3 py-2 bg-white text-gray-900"
                />
                <button
                  type="button"
                  className="px-4 py-2 rounded bg-gray-800 text-white disabled:opacity-50"
                  onClick={startTransfer}
                  disabled={!file || busy}
                >
                  {busy ? `Uploading… ${progress}%` : 'Start upload'}
                </button>
              </div>
            </>
          )}

          {/* ---- MULTIPART: show info + ONLY Start button (no second picker) ---- */}
          {plan.presignedUrls?.length && plan.partSize && protocol === 'multipart' && (
            <>
              <div className="font-medium">multipart (presigned urls)</div>
              <div>Total parts: {plan.presignedUrls.length}</div>

              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded bg-gray-800 text-white disabled:opacity-50"
                  onClick={startTransfer}
                  disabled={!file || busy}
                >
                  {busy ? `Uploading… ${progress}%` : 'Start upload'}
                </button>
              </div>
            </>
          )}

          {progress > 0 && <div className="text-sm">Progress: {progress}%</div>}
        </div>
      )}
    </div>
  );
}