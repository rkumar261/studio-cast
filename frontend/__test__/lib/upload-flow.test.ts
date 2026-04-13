import {
  detectUploadKind,
  isSupportedUploadFile,
  sanitizeProjectTitleFromFile,
} from '@/lib/upload-flow';

describe('upload-flow helpers', () => {
  it('sanitizes file names into a project title', () => {
    expect(sanitizeProjectTitleFromFile('customer-interview_final.mp4')).toBe('customer interview final');
    expect(sanitizeProjectTitleFromFile('  .mp4')).toBe('Untitled upload');
  });

  it('detects upload kind from mime type and extension', () => {
    expect(detectUploadKind({ name: 'voice.wav', type: 'audio/wav' } as File)).toBe('audio');
    expect(detectUploadKind({ name: 'screen.mov', type: 'video/quicktime' } as File)).toBe('video');
    expect(detectUploadKind({ name: 'fallback.flac', type: '' } as File)).toBe('audio');
  });

  it('accepts supported media files and rejects unsupported ones', () => {
    expect(isSupportedUploadFile({ name: 'episode.mp4', type: 'video/mp4' } as File)).toBe(true);
    expect(isSupportedUploadFile({ name: 'mix.wav', type: '' } as File)).toBe(true);
    expect(isSupportedUploadFile({ name: 'notes.txt', type: 'text/plain' } as File)).toBe(false);
  });
});
