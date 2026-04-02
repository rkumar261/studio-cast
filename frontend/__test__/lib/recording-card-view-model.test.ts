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
      participantNames: ['Rakesh', 'Raw Man'],
      state: 'upload complete',
      createdAt: '2026-03-30T10:00:00.000Z',
    });

    expect(formatRecordingTitle('', ['Rakesh', 'Raw Man'])).toBe('Rakesh & Raw Man');
    expect(card.title).toBe('Rakesh & Raw Man');
    expect(card.href).toBe('/projects/rec_123');
    expect(card.state).toBe('processing');
    expect(card.stateLabel).toBe('Upload complete');
  });

  it('falls back to the recording date when no title or participant names exist', () => {
    expect(formatRecordingTitle('', [], '2026-03-30T10:00:00.000Z')).toBe(
      'Recording — Mar 30, 2026'
    );
  });
});
