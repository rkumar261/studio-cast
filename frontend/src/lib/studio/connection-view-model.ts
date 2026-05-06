'use client';

import { Track, type RemoteParticipant } from 'livekit-client';
import { livekitSource, type Tile } from '@/lib/studio/media';
import type { StudioPeerSummary } from '@/lib/studio/stage-view-model';

function getParticipantTrack(participant: RemoteParticipant, source: Track.Source) {
  return participant.getTrackPublication(source)?.track ?? null;
}

export function buildLivekitTiles(remoteParticipants: RemoteParticipant[]): Tile[] {
  return remoteParticipants.flatMap((participant) => {
    const label = participant.name || participant.identity || 'Guest';
    const micPublication = participant.getTrackPublication(Track.Source.Microphone);
    const micTrack = micPublication?.track ?? null;
    const micOff = !micTrack || !!micPublication?.isMuted;
    const screenAudio = getParticipantTrack(participant, Track.Source.ScreenShareAudio);
    const cameraTrack = getParticipantTrack(participant, Track.Source.Camera);
    const screenTrack = getParticipantTrack(participant, Track.Source.ScreenShare);

    const tiles: Tile[] = [];
    if (screenTrack) {
      tiles.push({
        key: `${participant.sid}-screen`,
        label,
        badge: 'Screen',
        video: livekitSource(screenTrack),
        audio: screenAudio || micTrack ? livekitSource(screenAudio || micTrack) : undefined,
        micOff,
      });
    }
    if (cameraTrack) {
      tiles.push({
        key: `${participant.sid}-camera`,
        label,
        badge: 'Camera',
        video: livekitSource(cameraTrack),
        audio: micTrack ? livekitSource(micTrack) : undefined,
        micOff,
      });
    }
    if (!cameraTrack && !screenTrack) {
      tiles.push({
        key: `${participant.sid}-audio`,
        label,
        badge: 'Audio only',
        video: livekitSource(null),
        audio: micTrack ? livekitSource(micTrack) : undefined,
        micOff,
      });
    }

    return tiles;
  });
}

export function buildLivekitPeers(remoteParticipants: RemoteParticipant[]): StudioPeerSummary[] {
  return remoteParticipants.map((participant) => ({
    id: participant.sid,
    label: participant.name || participant.identity || 'Guest',
  }));
}
