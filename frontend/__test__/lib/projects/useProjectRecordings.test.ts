import { buildProjectRecordingCards } from '@/lib/projects/useProjectRecordings';

describe('useProjectRecordings helpers', () => {
  it('filters out the current project and keeps archive cards minimal', () => {
    const cards = buildProjectRecordingCards(
      [
        {
          id: 'rec_current',
          title: 'Current project',
          status: 'ready',
          createdAt: '2026-03-30T10:00:00.000Z',
        },
        {
          id: 'rec_other',
          title: 'Other project',
          status: 'processing',
          createdAt: '2026-03-29T10:00:00.000Z',
        },
      ],
      'rec_current'
    );

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: 'rec_other',
      href: '/projects/rec_other',
      state: 'processing',
    });
  });
});
