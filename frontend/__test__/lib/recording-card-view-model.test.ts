import {
  buildRecordingCardViewModel,
  formatRecordingTitle,
  toRecordingCardState,
} from '@/lib/recording-card-view-model';

describe('recording-card-view-model', () => {
  it('maps consumer states into simplified card states', () => {
    expect(toRecordingCardState('ready')).toBe('ready');
    expect(toRecordingCardState('processing')).toBe('processing');
    expect(toRecordingCardState('action required')).toBe('error');
    expect(toRecordingCardState('invited')).toBe('draft');
  });

  it('normalizes blank titles and canonical project hrefs', () => {
    const card = buildRecordingCardViewModel({
      id: 'rec_123',
      title: '   ',
      state: 'upload complete',
      createdAt: '2026-03-30T10:00:00.000Z',
    });

    expect(formatRecordingTitle('')).toBe('Untitled project');
    expect(card.title).toBe('Untitled project');
    expect(card.href).toBe('/projects/rec_123');
    expect(card.state).toBe('processing');
    expect(card.stateLabel).toBe('Upload complete');
  });
});
