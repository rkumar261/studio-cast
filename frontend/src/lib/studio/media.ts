import { Track, type Participant } from 'livekit-client';

export type MediaSource =
  | { kind: 'livekit'; track: Track | null }
  | { kind: 'media'; stream: MediaStream | null };

export type Tile = {
  key: string;
  label: string;
  badge: string;
  video: MediaSource;
  audio?: MediaSource;
  muted?: boolean;
  micOff?: boolean;
};

export const mediaSource = (stream: MediaStream | null): MediaSource => ({
  kind: 'media',
  stream,
});

export const livekitSource = (track: Track | null): MediaSource => ({
  kind: 'livekit',
  track,
});

// LiveKit exposes the underlying MediaStreamTrack on the client track instance.
// Guard the readyState so we do not build recorder/preview streams from ended tracks.
export function livekitTrackToStream(track: Track | null): MediaStream | null {
  const mediaStreamTrack = (track as any)?.mediaStreamTrack as MediaStreamTrack | undefined;
  if (!mediaStreamTrack) return null;
  if (mediaStreamTrack.readyState !== 'live') return null;
  return new MediaStream([mediaStreamTrack]);
}

export function selectTracksAsStream(
  stream: MediaStream | null,
  kind: 'audio' | 'video'
): MediaStream | null {
  if (!stream) return null;
  const tracks = kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks();
  if (tracks.length === 0) return null;
  return new MediaStream(tracks);
}

export function getTrack(participant: Participant, source: Track.Source): Track | null {
  const publication = participant.getTrackPublication(source);
  return publication?.track ?? null;
}
