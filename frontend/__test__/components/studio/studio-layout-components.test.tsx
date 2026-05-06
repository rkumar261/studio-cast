import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { MeetControlBar } from '@/components/studio/MeetControlBar';
import { MeetContextMenu } from '@/components/studio/MeetContextMenu';
import { MeetHeaderBar } from '@/components/studio/MeetHeaderBar';
import { MeetPeoplePanel } from '@/components/studio/MeetPeoplePanel';
import { MeetStageArea } from '@/components/studio/MeetStageArea';
import { MeetStatusBanners } from '@/components/studio/MeetStatusBanners';
import { StudioGuestWelcome } from '@/components/studio/StudioGuestWelcome';
import { StudioInviteModal } from '@/components/studio/StudioInviteModal';
import { StudioInviteSidePanel } from '@/components/studio/StudioInviteSidePanel';
import { StudioPeopleSidebar } from '@/components/studio/StudioPeopleSidebar';
import { StudioPreJoinSetup } from '@/components/studio/StudioPreJoinSetup';
import { StudioHeaderBar } from '@/components/studio/StudioHeaderBar';
import { StudioRetryUploadsButton } from '@/components/studio/StudioRetryUploadsButton';
import { StudioStageArea } from '@/components/studio/StudioStageArea';
import { StudioStatusBanners } from '@/components/studio/StudioStatusBanners';

describe('studio layout components', () => {
  it('renders invite modal content when open', () => {
    const html = renderToStaticMarkup(
      <StudioInviteModal
        open
        inviteLink="https://example.com/invite"
        inviteRole="guest"
        inviteEmail="guest@example.com"
        inviteNotice="Invite sent"
        copyState="copied"
        onInviteRoleChange={() => {}}
        onInviteEmailChange={() => {}}
        onCopyLink={() => {}}
        onSendInvite={() => {}}
        onClose={() => {}}
      />
    );

    expect(html).toContain('Invite people');
    expect(html).toContain('Copied');
    expect(html).toContain('Invite sent');
  });

  it('renders people sidebar content and add participant entry points', () => {
    const html = renderToStaticMarkup(
      <StudioPeopleSidebar
        showPanel
        showAddParticipantPanel
        canManageParticipants
        isRecording
        stoppedUploadingPhase
        people={[
          {
            id: 'guest-1',
            label: 'Guest One',
            role: 'Guest',
            percent: 45,
            note: '45% uploaded',
            showProgressBar: true,
          },
        ]}
        onClosePanel={() => {}}
        onTogglePanel={() => {}}
        onToggleAddParticipantPanel={() => {}}
        onOpenInviteModal={() => {}}
        onShowInPersonGuestPanel={() => {}}
        onRemoveParticipant={() => {}}
      />
    );

    expect(html).toContain('People');
    expect(html).toContain('Guest One');
    expect(html).toContain('Remote guest');
    expect(html).toContain('Add participant');
  });

  it('renders invite side panel content', () => {
    const html = renderToStaticMarkup(
      <StudioInviteSidePanel
        inviteLink="https://example.com/studio/invite"
        inviteRole="guest"
        copyState="idle"
        onInviteRoleChange={() => {}}
        onCopyLink={() => {}}
        onClose={() => {}}
      />
    );

    expect(html).toContain('Invite someone to join remotely');
    expect(html).toContain('Copy link');
    expect(html).toContain('Add an in-person guest');
  });

  it('renders stage fallback when no visible tiles are present', () => {
    const html = renderToStaticMarkup(
      <StudioStageArea
        isScreenShareDominant={false}
        screenTiles={[]}
        webcamTiles={[]}
        visibleTiles={[]}
        stageGridClass="grid-cols-1 auto-rows-fr"
        centerConstrained={false}
        tileClassName="h-full"
        pinnedTileKey={null}
        shouldFillTiles
        localMicEnabled
        onToggleLocalMic={() => {}}
        onTogglePin={() => {}}
      />
    );

    expect(html).toContain('Waiting for camera feed');
  });

  it('renders studio header and status banners', () => {
    const headerHtml = renderToStaticMarkup(
      <StudioHeaderBar
        displayName="Rakesh"
        recordingTitle="Untitled Recording"
        isRecording
        recordingClock="00:42"
        showUploadChip
        uploadChipLabel="→ Processing"
        canUseBroadcastControls
        canSendInvites
        onOpenInviteModal={() => {}}
      />
    );
    const bannersHtml = renderToStaticMarkup(
      <StudioStatusBanners
        streamWarning="Camera issue"
        stoppedUploadingPhase
        localStudioRole="host"
        fallbackNotice="Fallback active"
        sessionError={null}
        recorderError="Recorder issue"
        chunkUploadError="Chunk issue"
        activeError={null}
      />
    );

    expect(headerHtml).toContain('STUDIO CAST');
    expect(headerHtml).toContain('REC 00:42');
    expect(headerHtml).toContain('Invite');
    expect(bannersHtml).toContain('Camera issue');
    expect(bannersHtml).toContain('Fallback active');
    expect(bannersHtml).toContain('Upload queue: Chunk issue');
  });

  it('renders meet header, banners, control bar, and retry strip', () => {
    const headerHtml = renderToStaticMarkup(
      <MeetHeaderBar
        recordingId="rec-123"
        statusLabel="Live"
        participantCount={3}
        showViewMenu
        fitLabel="Fill screen"
        showPeopleLabel="Hide people"
        hasRemoteStage
        selfPreviewLabel="Hide self"
        showSelfPreviewSizeAction
        selfPreviewSizeLabel="Maximize self"
        onToggleViewMenu={() => {}}
        onToggleFit={() => {}}
        onToggleFullscreen={() => {}}
        onTogglePeoplePanel={() => {}}
        onToggleSelfPreview={() => {}}
        onToggleSelfPreviewSize={() => {}}
      />
    );
    const bannersHtml = renderToStaticMarkup(
      <MeetStatusBanners fallbackNotice="Fallback active" activeError="Meet error" />
    );
    const controlsHtml = renderToStaticMarkup(
      <MeetControlBar
        isConnected
        isJoining={false}
        micEnabled
        cameraEnabled={false}
        screenSharing={false}
        onToggleMic={() => {}}
        onToggleCamera={() => {}}
        onToggleScreen={() => {}}
        onJoinLeave={() => {}}
      />
    );
    const retryHtml = renderToStaticMarkup(
      <StudioRetryUploadsButton failedCount={2} onRetry={() => {}} />
    );

    expect(headerHtml).toContain('roomId: rec-123');
    expect(headerHtml).toContain('Participants: 3');
    expect(bannersHtml).toContain('Meet error');
    expect(controlsHtml).toContain('Mic on');
    expect(controlsHtml).toContain('Camera off');
    expect(retryHtml).toContain('Retry failed uploads');
  });

  it('renders meet stage fallback elements and people panel', () => {
    const stageHtml = renderToStaticMarkup(
      <MeetStageArea
        meetMainTile={{
          key: 'main',
          label: 'Main tile',
          badge: 'You',
          video: { kind: 'media', stream: null },
          muted: true,
        }}
        meetStageFit="contain"
        pinnedTileKey="main"
        meetVisibleSecondaryTiles={[]}
        meetLocalTileKey="local"
        meetSelfPreviewExpanded={false}
        onOpenMainContextMenu={() => {}}
        onOpenSecondaryContextMenu={() => {}}
      />
    );
    const peopleHtml = renderToStaticMarkup(
      <MeetPeoplePanel
        open
        people={[
          { id: 'p1', label: 'Rakesh', role: 'You', tileKey: 'local' },
          { id: 'p2', label: 'Guest One', role: 'Guest', tileKey: 'remote-1' },
        ]}
        onClose={() => {}}
        onPin={() => {}}
      />
    );

    expect(stageHtml).toContain('Pinned');
    expect(stageHtml).toContain('Main tile');
    expect(peopleHtml).toContain('People');
    expect(peopleHtml).toContain('Guest One');
    expect(peopleHtml).toContain('In the meeting');
  });

  it('renders guest welcome and prejoin setup surfaces', () => {
    const welcomeHtml = renderToStaticMarkup(
      <StudioGuestWelcome hasGuestToken={false} onContinue={() => {}} />
    );
    const prejoinHtml = renderToStaticMarkup(
      <StudioPreJoinSetup
        isGuestStudioFlow
        displayName="Rakesh"
        studioOwnerLabel="Rakesh"
        guestEmail="guest@example.com"
        localStudioRole="guest"
        localStudioRoleLabel="Guest"
        usingHeadphones
        joiningFromPreJoin={false}
        guestNameMissing={false}
        guestJoinError="Guest join failed"
        preJoinError="Preview failed"
        previewVideoRef={{ current: null }}
        preJoinMicEnabled
        preJoinCamEnabled={false}
        preJoinStatus="ready"
        cameraDevices={[{ id: 'camera-1', label: 'Built-in camera' }]}
        micDevices={[{ id: 'mic-1', label: 'Built-in mic' }]}
        speakerDevices={[{ id: 'speaker-1', label: 'Built-in speakers' }]}
        selectedCameraId="camera-1"
        selectedMicId="mic-1"
        selectedSpeakerId="speaker-1"
        onDisplayNameChange={() => {}}
        onGuestEmailChange={() => {}}
        onSetUsingHeadphones={() => {}}
        onJoin={() => {}}
        onTogglePreJoinMic={() => {}}
        onTogglePreJoinCam={() => {}}
        onSelectedCameraIdChange={() => {}}
        onSelectedMicIdChange={() => {}}
        onSelectedSpeakerIdChange={() => {}}
        onRefreshPreview={() => {}}
      />
    );

    expect(welcomeHtml).toContain('Join this recording as a guest');
    expect(welcomeHtml).toContain('Guest invite token is missing');
    expect(prejoinHtml).toContain('Let&#x27;s check your cam and mic');
    expect(prejoinHtml).toContain('Built-in camera');
    expect(prejoinHtml).toContain('Guest join failed');
    expect(prejoinHtml).toContain('Preview failed');
  });

  it('renders meet context menu actions', () => {
    const html = renderToStaticMarkup(
      <MeetContextMenu
        menu={{ x: 10, y: 20, tileKey: 'local', isMain: false }}
        pinnedTileKey={null}
        meetLocalTileKey="local"
        hasRemoteStage
        meetSelfPreviewExpanded={false}
        onPin={() => {}}
        onUnpin={() => {}}
        onHideSelfPreview={() => {}}
        onToggleSelfPreviewSize={() => {}}
        onToggleFullscreen={() => {}}
        onClose={() => {}}
      />
    );

    expect(html).toContain('Pin to screen');
    expect(html).toContain('Minimize');
    expect(html).toContain('Maximize preview');
    expect(html).toContain('Full screen');
  });
});
