import { buildHomeRecordingCards } from '@/lib/dashboard/useHomeViewModel';

describe('useHomeViewModel helpers', () => {
  it('maps recent recordings to canonical project links', () => {
    const cards = buildHomeRecordingCards([
      {
        id: 'rec_1',
        title: 'Weekly review',
        status: 'ready',
        createdAt: '2026-03-30T10:00:00.000Z',
      },
      {
        id: 'rec_2',
        title: 'Interview',
        status: 'processing',
        createdAt: '2026-03-28T10:00:00.000Z',
      },
      {
        id: 'rec_3',
        title: 'Clip review',
        status: 'ready',
        createdAt: '2026-03-27T10:00:00.000Z',
      },
      {
        id: 'rec_4',
        title: 'Roundtable',
        status: 'ready',
        createdAt: '2026-03-26T10:00:00.000Z',
      },
      {
        id: 'rec_5',
        title: 'Overflow item',
        status: 'ready',
        createdAt: '2026-03-25T10:00:00.000Z',
      },
    ]);

    expect(cards).toHaveLength(4);
    expect(cards[0]?.href).toBe('/projects/rec_1');
    expect(cards[0]?.primaryAction?.label).toBe('Open project');
    expect(cards[1]?.primaryAction?.label).toBe('Continue');
    expect(cards[1]?.state).toBe('processing');
    expect(cards.find((card) => card.id === 'rec_5')).toBeUndefined();
  });
});
