'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ParticipantsAPI,
  RecordingsAPI,
  UploadsAPI,
} from '@/lib/api';
import { uploadMultipartFile } from '@/lib/multipartUploader';
import {
  detectUploadKind,
  isSupportedUploadFile,
  sanitizeProjectTitleFromFile,
} from '@/lib/upload-flow';
import { useSession } from '@/lib/useSession';
import FileUploadZone from '@/components/upload/FileUploadZone';
import UploadProgress from '@/components/upload/UploadProgress';

type UploadStage =
  | 'idle'
  | 'creating'
  | 'preparing'
  | 'uploading'
  | 'finalizing'
  | 'complete'
  | 'error';

function displayNameFromProfile(profile: {
  name?: string;
  email?: string;
} | null) {
  const trimmedName = profile?.name?.trim();
  if (trimmedName) return trimmedName;

  const emailPrefix = profile?.email?.split('@')[0]?.trim();
  if (emailPrefix) return emailPrefix;

  return 'Host';
}

export default function ProjectUploadEntryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, isLoading } = useSession();

  const [stage, setStage] = useState<UploadStage>('idle');
  const [progress, setProgress] = useState(0);
  const [detail, setDetail] = useState('Choose a file to create a draft project and upload media into it.');
  const [error, setError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [projectHref, setProjectHref] = useState<string | null>(null);

  const mode = searchParams.get('mode');
  const isUploadMode = mode === 'upload' || mode === null;
  const busy = stage !== 'idle' && stage !== 'error';

  const pageTitle = useMemo(
    () => (isUploadMode ? 'Upload media into a project' : 'Create a new project'),
    [isUploadMode]
  );

  async function handleFileSelected(file: File) {
    if (busy) return;

    setSelectedFileName(file.name);
    setError(null);

    if (!isSupportedUploadFile(file)) {
      setStage('error');
      setProgress(0);
      setDetail('This file type is not supported yet. Use a common audio or video file.');
      setError('Supported uploads include MP4, MOV, WEBM, WAV, MP3, M4A, AAC, OGG, and FLAC.');
      return;
    }

    try {
      setStage('creating');
      setProgress(8);
      setDetail('Creating a draft project shell for the upload.');

      const title = sanitizeProjectTitleFromFile(file.name);
      const { recording } = await RecordingsAPI.create(title);
      const nextProjectHref = `/projects/${recording.id}`;
      setProjectHref(nextProjectHref);

      const participant = await ParticipantsAPI.create(recording.id, {
        role: 'host',
        displayName: displayNameFromProfile(profile),
        email: profile?.email,
      });

      setStage('preparing');
      setProgress(16);
      setDetail('Preparing multipart upload and reserving storage.');

      const initiated = await UploadsAPI.initiate({
        recordingId: recording.id,
        participantId: participant.participant.id,
        kind: detectUploadKind(file),
        protocol: 'multipart',
        filename: file.name,
        size: file.size,
        contentType: file.type || 'application/octet-stream',
      });

      if (!initiated.presignedUrls?.length || !initiated.partSize) {
        throw new Error('Upload initialization did not return a multipart plan.');
      }

      setStage('uploading');
      setDetail('Uploading file parts directly to storage.');

      const parts = await uploadMultipartFile(
        file,
        initiated.presignedUrls,
        initiated.partSize,
        (pct) => setProgress(Math.max(20, pct))
      );

      setStage('finalizing');
      setProgress(96);
      setDetail('Finalizing the upload and opening the project workspace.');

      await UploadsAPI.completeMultipart(initiated.upload.id, {
        protocol: 'multipart',
        parts,
        totalBytes: file.size,
      });

      setStage('complete');
      setProgress(100);
      setDetail('Upload complete. Redirecting to your project workspace.');
      router.push(nextProjectHref);
    } catch (uploadError) {
      setStage('error');
      setProgress(0);
      setDetail('The upload could not be completed.');
      setError((uploadError as Error).message || 'Upload failed.');
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-[1.75rem] border border-white/6 bg-white/[0.03] p-8 text-sm text-slate-400">
        Loading your upload workspace...
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6" data-testid="project-upload-entry">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Projects</p>
          <h1 className="text-4xl font-semibold tracking-tight text-white">{pageTitle}</h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-400">
            Create a draft project, upload a pre-recorded audio or video file, and land directly in the
            canonical workspace at <span className="text-slate-200">/projects/[id]</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {projectHref && (
            <Link
              href={projectHref}
              className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 text-sm font-medium text-slate-200"
            >
              Open draft project
            </Link>
          )}
          <Link
            href="/projects"
            className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 text-sm font-medium text-slate-200"
          >
            Back to projects
          </Link>
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <FileUploadZone
          disabled={busy}
          onFileSelected={(file) => void handleFileSelected(file)}
          selectedFileName={selectedFileName}
          error={error}
        />
        <UploadProgress
          stage={stage}
          fileName={selectedFileName}
          progress={progress}
          detail={detail}
          projectHref={projectHref}
        />
      </section>
    </div>
  );
}
