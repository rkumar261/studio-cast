import type { UploadKind } from '@/lib/api';

const AUDIO_EXTENSIONS = new Set(['aac', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'wav']);
const VIDEO_EXTENSIONS = new Set(['m4v', 'mkv', 'mov', 'mp4', 'webm']);

export const ACCEPTED_UPLOAD_TYPES = [
  '.mp4',
  '.mov',
  '.webm',
  '.m4v',
  '.mkv',
  '.wav',
  '.mp3',
  '.m4a',
  '.aac',
  '.ogg',
  '.oga',
  '.flac',
].join(',');

function getExtension(name: string) {
  const parts = name.toLowerCase().split('.');
  return parts.length > 1 ? parts.at(-1) ?? '' : '';
}

export function sanitizeProjectTitleFromFile(fileName: string) {
  const normalized = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || 'Untitled upload';
}

export function detectUploadKind(file: Pick<File, 'name' | 'type'>): UploadKind {
  const type = file.type.toLowerCase();
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';

  const ext = getExtension(file.name);
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';

  return 'video';
}

export function isSupportedUploadFile(file: Pick<File, 'name' | 'type'>) {
  const type = file.type.toLowerCase();
  if (type.startsWith('audio/') || type.startsWith('video/')) {
    return true;
  }

  const ext = getExtension(file.name);
  return AUDIO_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext);
}
