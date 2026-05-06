'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ParticipantsAPI } from '@/lib/participants.api';
import { buildStudioInviteLink, tokenFromMagicLink } from '@/lib/studio/invites';

type StudioInviteRole = 'guest' | 'host';
type StudioSessionMode = 'meet' | 'studio';

type UseStudioInviteControlsArgs = {
  sessionMode: StudioSessionMode;
  requestedStudioRole: StudioInviteRole | null;
  recordingId: string;
  displayName: string;
  profileName?: string | null;
  recordingSessionHostParticipantId?: string | null;
  onError?: (message: string) => void;
};

type EnsureInviteParticipantResult = {
  participantId: string;
  guestToken?: string;
};

export function useStudioInviteControls(args: UseStudioInviteControlsArgs) {
  const {
    sessionMode,
    requestedStudioRole,
    recordingId,
    displayName,
    profileName,
    recordingSessionHostParticipantId,
    onError,
  } = args;
  const [inviteRole, setInviteRole] = useState<StudioInviteRole>('guest');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [localHostParticipantId, setLocalHostParticipantId] = useState<string | null>(null);
  const [createdInviteParticipantIdByRole, setCreatedInviteParticipantIdByRole] = useState<
    Partial<Record<StudioInviteRole, string>>
  >({});
  const [createdInviteGuestToken, setCreatedInviteGuestToken] = useState<string | null>(null);
  const hostParticipantEnsureRef = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    setInviteRole('guest');
    setInviteEmail('');
    setInviteNotice(null);
    setCopyState('idle');
    setLocalHostParticipantId(null);
    setCreatedInviteParticipantIdByRole({});
    setCreatedInviteGuestToken(null);
  }, [recordingId]);

  const ensureLocalHostParticipantId = useCallback(async () => {
    if (sessionMode !== 'studio' || requestedStudioRole === 'guest') return null;
    if (recordingSessionHostParticipantId) {
      setLocalHostParticipantId(recordingSessionHostParticipantId);
      return recordingSessionHostParticipantId;
    }
    if (localHostParticipantId) return localHostParticipantId;
    if (hostParticipantEnsureRef.current) return hostParticipantEnsureRef.current;

    // Studio joins and recording controls can race with host-participant creation.
    // Serialize the lookup/create path so repeated clicks do not create duplicate hosts.
    const resolvePromise = (async () => {
      const listed = await ParticipantsAPI.list(recordingId);
      const existingHost = listed.participants.find((participant) => participant.role === 'host');
      if (existingHost) {
        setLocalHostParticipantId(existingHost.id);
        return existingHost.id;
      }

      const created = await ParticipantsAPI.create(recordingId, {
        role: 'host',
        displayName: displayName?.trim() || profileName?.trim() || 'Host',
      });
      setLocalHostParticipantId(created.participant.id);
      setCreatedInviteParticipantIdByRole((prev) => ({
        ...prev,
        host: prev.host ?? created.participant.id,
      }));
      return created.participant.id;
    })();

    hostParticipantEnsureRef.current = resolvePromise;
    try {
      return await resolvePromise;
    } finally {
      if (hostParticipantEnsureRef.current === resolvePromise) {
        hostParticipantEnsureRef.current = null;
      }
    }
  }, [
    displayName,
    localHostParticipantId,
    profileName,
    recordingId,
    recordingSessionHostParticipantId,
    requestedStudioRole,
    sessionMode,
  ]);

  useEffect(() => {
    if (sessionMode !== 'studio' || requestedStudioRole === 'guest') return;
    if (recordingSessionHostParticipantId) {
      setLocalHostParticipantId(recordingSessionHostParticipantId);
      return;
    }
    void ensureLocalHostParticipantId().catch((err) => {
      onError?.((err as Error)?.message ?? 'Failed to resolve host participant.');
    });
  }, [
    ensureLocalHostParticipantId,
    onError,
    recordingSessionHostParticipantId,
    requestedStudioRole,
    sessionMode,
  ]);

  const ensureInviteParticipantId = useCallback(
    async (role: StudioInviteRole): Promise<EnsureInviteParticipantResult> => {
      const existing = createdInviteParticipantIdByRole[role];
      if (existing) {
        return {
          participantId: existing,
          guestToken: role === 'guest' ? createdInviteGuestToken ?? undefined : undefined,
        };
      }

      if (role === 'host') {
        const hostId = await ensureLocalHostParticipantId();
        if (!hostId) {
          throw new Error('Host participant is not available.');
        }
        setCreatedInviteParticipantIdByRole((prev) => ({ ...prev, host: hostId }));
        return { participantId: hostId };
      }

      const result = await ParticipantsAPI.create(recordingId, {
        role,
        displayName: `Guest ${Date.now()}`,
      });
      const participantId = result.participant.id;
      const guestToken = tokenFromMagicLink(result.magicLink);
      setCreatedInviteParticipantIdByRole((prev) => ({ ...prev, [role]: participantId }));
      setCreatedInviteGuestToken(guestToken);
      return { participantId, guestToken: guestToken ?? undefined };
    },
    [
      createdInviteGuestToken,
      createdInviteParticipantIdByRole,
      ensureLocalHostParticipantId,
      recordingId,
    ]
  );

  const inviteLink = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return buildStudioInviteLink({
      origin: window.location.origin,
      recordingId,
      role: inviteRole,
      participantId: createdInviteParticipantIdByRole[inviteRole] ?? null,
      guestToken: inviteRole === 'guest' ? createdInviteGuestToken : null,
    });
  }, [createdInviteGuestToken, createdInviteParticipantIdByRole, inviteRole, recordingId]);

  const handleCopyInviteLink = useCallback(async () => {
    if (typeof window === 'undefined') return;
    try {
      const invite = await ensureInviteParticipantId(inviteRole);
      const link = buildStudioInviteLink({
        origin: window.location.origin,
        recordingId,
        role: inviteRole,
        participantId: invite.participantId,
        guestToken: inviteRole === 'guest' ? invite.guestToken ?? null : null,
      });
      await navigator.clipboard.writeText(link);
      setCopyState('copied');
      setInviteNotice(null);
    } catch {
      setCopyState('error');
      setInviteNotice('Could not create/copy invite link.');
    }
  }, [ensureInviteParticipantId, inviteRole, recordingId]);

  const handleInviteByEmail = useCallback(() => {
    if (!inviteEmail.trim()) {
      setInviteNotice('Enter an email to send invite.');
      return;
    }
    setInviteNotice('Email invite API is not wired yet. Link sharing is active.');
  }, [inviteEmail]);

  return {
    inviteRole,
    setInviteRole,
    inviteEmail,
    setInviteEmail,
    inviteNotice,
    setInviteNotice,
    copyState,
    setCopyState,
    localHostParticipantId,
    createdInviteParticipantIdByRole,
    createdInviteGuestToken,
    inviteLink,
    ensureLocalHostParticipantId,
    handleCopyInviteLink,
    handleInviteByEmail,
  };
}
