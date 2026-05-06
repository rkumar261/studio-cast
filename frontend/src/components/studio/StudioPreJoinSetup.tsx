'use client';

import Link from 'next/link';
import type { RefObject } from 'react';

import type { DeviceOption, PreJoinStatus } from '@/lib/studio/useStudioDevices';

type StudioPreJoinSetupProps = {
  isGuestStudioFlow: boolean;
  displayName: string;
  studioOwnerLabel: string;
  guestEmail: string;
  localStudioRole: 'host' | 'guest';
  localStudioRoleLabel: string;
  usingHeadphones: boolean;
  joiningFromPreJoin: boolean;
  guestNameMissing: boolean;
  guestJoinError: string | null;
  preJoinError: string | null;
  previewVideoRef: RefObject<HTMLVideoElement | null>;
  preJoinMicEnabled: boolean;
  preJoinCamEnabled: boolean;
  preJoinStatus: PreJoinStatus;
  cameraDevices: DeviceOption[];
  micDevices: DeviceOption[];
  speakerDevices: DeviceOption[];
  selectedCameraId: string;
  selectedMicId: string;
  selectedSpeakerId: string;
  onDisplayNameChange: (value: string) => void;
  onGuestEmailChange: (value: string) => void;
  onSetUsingHeadphones: (value: boolean) => void;
  onJoin: () => void;
  onTogglePreJoinMic: () => void;
  onTogglePreJoinCam: () => void;
  onSelectedCameraIdChange: (value: string) => void;
  onSelectedMicIdChange: (value: string) => void;
  onSelectedSpeakerIdChange: (value: string) => void;
  onRefreshPreview: () => void;
};

export function StudioPreJoinSetup(props: StudioPreJoinSetupProps) {
  return (
    <main className="studio-shell-background min-h-screen text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1450px] flex-col px-6 py-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="studio-control-surface rounded-full px-3 py-1.5 text-slate-300 hover:text-slate-100">
              ←
            </Link>
            <p className="text-2xl font-semibold tracking-[0.2em]">STUDIO CAST</p>
            <span className="text-slate-600">|</span>
            <p className="text-xl text-slate-300">{props.studioOwnerLabel}&apos;s Studio</p>
          </div>
          <button
            type="button"
            className="studio-control-surface rounded-xl px-4 py-2 text-sm text-slate-200"
          >
            Get help
          </button>
        </header>

        <section className="flex flex-1 items-center py-10">
          <div className="grid w-full items-start gap-12 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="max-w-xl space-y-6">
              <span className="inline-flex rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
                REC
              </span>
              <p className="text-2xl text-slate-400">
                {props.isGuestStudioFlow
                  ? 'You are about to join this studio as a guest'
                  : `You're about to join ${props.displayName || 'your'} studio`}
              </p>
              <h1 className="text-6xl font-semibold leading-tight">Let&apos;s check your cam and mic</h1>

              <div className="space-y-3">
                <label className="studio-input-surface flex items-center gap-2 rounded-xl px-4 py-3">
                  <input
                    type="text"
                    value={props.displayName}
                    onChange={(event) => props.onDisplayNameChange(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-xl outline-none placeholder:text-slate-500"
                    placeholder={props.isGuestStudioFlow ? 'Your name (required)' : 'Your display name'}
                  />
                  <span className="rounded-lg border border-white/10 bg-white/8 px-3 py-1 text-sm text-slate-200">
                    {props.localStudioRoleLabel}
                  </span>
                </label>

                {props.isGuestStudioFlow && (
                  <label className="studio-input-surface flex items-center gap-2 rounded-xl px-4 py-3">
                    <input
                      type="email"
                      value={props.guestEmail}
                      onChange={(event) => props.onGuestEmailChange(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-xl outline-none placeholder:text-slate-500"
                      placeholder="Email (optional)"
                    />
                  </label>
                )}

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => props.onSetUsingHeadphones(false)}
                    className={`rounded-xl px-4 py-3 text-base ${
                      !props.usingHeadphones
                        ? 'border border-violet-400/30 bg-violet-500/12 text-white'
                        : 'studio-control-surface text-slate-300'
                    }`}
                  >
                    I am not using headphones
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onSetUsingHeadphones(true)}
                    className={`rounded-xl px-4 py-3 text-base ${
                      props.usingHeadphones
                        ? 'border border-violet-400/30 bg-violet-500/12 text-white'
                        : 'studio-control-surface text-slate-300'
                    }`}
                  >
                    I am using headphones
                  </button>
                </div>

                <button
                  type="button"
                  onClick={props.onJoin}
                  disabled={
                    props.preJoinStatus !== 'ready' ||
                    props.joiningFromPreJoin ||
                    props.guestNameMissing
                  }
                  className="w-full rounded-xl bg-[var(--workspace-purple)] px-4 py-3 text-xl font-semibold text-white hover:brightness-110 disabled:opacity-60"
                >
                  {props.joiningFromPreJoin
                    ? 'Joining studio...'
                    : props.isGuestStudioFlow
                      ? 'Join as guest'
                      : 'Join studio'}
                </button>

                <p className="text-lg text-slate-400">
                  {props.isGuestStudioFlow
                    ? 'Joining as guest participant'
                    : `You are joining as a ${props.localStudioRole === 'host' ? 'host' : 'guest'}`}
                </p>
                {props.guestJoinError && (
                  <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {props.guestJoinError}
                  </p>
                )}
                {props.preJoinError && (
                  <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {props.preJoinError}
                  </p>
                )}
              </div>
            </div>

            <div className="studio-panel-surface rounded-3xl p-4">
              <div className="relative overflow-hidden rounded-2xl bg-black">
                <video ref={props.previewVideoRef} autoPlay playsInline muted className="aspect-video w-full object-cover" />
                <div className="studio-chip-surface absolute left-3 top-3 rounded-full px-3 py-1 text-xs text-slate-100">
                  720p / 30fps
                </div>
                <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={props.onTogglePreJoinMic}
                    className={`rounded-full px-3 py-1 text-sm ${
                      props.preJoinMicEnabled ? 'studio-chip-surface text-slate-100' : 'bg-rose-500 text-white'
                    }`}
                  >
                    {props.preJoinMicEnabled ? 'Mic' : 'Mic off'}
                  </button>
                  <button
                    type="button"
                    onClick={props.onTogglePreJoinCam}
                    className={`rounded-full px-3 py-1 text-sm ${
                      props.preJoinCamEnabled ? 'studio-chip-surface text-slate-100' : 'bg-rose-500 text-white'
                    }`}
                  >
                    {props.preJoinCamEnabled ? 'Cam' : 'Cam off'}
                  </button>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <label className="studio-input-surface block rounded-xl px-3 py-2 text-sm">
                  <span className="mb-1 block text-xs text-slate-400">Camera</span>
                  <select
                    value={props.selectedCameraId}
                    onChange={(event) => props.onSelectedCameraIdChange(event.target.value)}
                    className="w-full bg-transparent outline-none"
                  >
                    {props.cameraDevices.length === 0 && <option value="">Default camera</option>}
                    {props.cameraDevices.map((device) => (
                      <option key={device.id} value={device.id}>
                        {device.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="studio-input-surface block rounded-xl px-3 py-2 text-sm">
                  <span className="mb-1 block text-xs text-slate-400">Microphone</span>
                  <select
                    value={props.selectedMicId}
                    onChange={(event) => props.onSelectedMicIdChange(event.target.value)}
                    className="w-full bg-transparent outline-none"
                  >
                    {props.micDevices.length === 0 && <option value="">Default microphone</option>}
                    {props.micDevices.map((device) => (
                      <option key={device.id} value={device.id}>
                        {device.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="studio-input-surface block rounded-xl px-3 py-2 text-sm">
                  <span className="mb-1 block text-xs text-slate-400">Speaker</span>
                  <select
                    value={props.selectedSpeakerId}
                    onChange={(event) => props.onSelectedSpeakerIdChange(event.target.value)}
                    className="w-full bg-transparent outline-none"
                  >
                    {props.speakerDevices.length === 0 && <option value="">Default speakers</option>}
                    {props.speakerDevices.map((device) => (
                      <option key={device.id} value={device.id}>
                        {device.label}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  onClick={props.onRefreshPreview}
                  className="studio-control-surface w-full rounded-xl px-3 py-2 text-sm text-slate-200"
                >
                  {props.preJoinStatus === 'starting' ? 'Refreshing preview...' : 'Refresh preview'}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
