import {
  buildHomeAnalyticsData,
  buildHomeAiTools,
  buildHomeRecordingCards,
  buildHomeSecondaryCta,
} from '@/lib/dashboard/useHomeViewModel';

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

  it('wires AI tools to project anchors when a latest project exists', () => {
    const tools = buildHomeAiTools('/projects/rec_1');

    expect(tools[0]).toMatchObject({
      id: 'translate',
      href: '/projects/rec_1#transcript',
      disabled: false,
    });
    expect(tools[1]).toMatchObject({
      id: 'magic-audio',
      href: '/projects/rec_1#tracks',
      disabled: false,
    });
    expect(tools[2]).toMatchObject({
      id: 'clips',
      disabled: true,
    });
  });

  it('disables non-ready AI tools when no latest project exists', () => {
    const tools = buildHomeAiTools();

    expect(tools[0]?.disabled).toBe(true);
    expect(tools[1]?.disabled).toBe(true);
    expect(tools[2]?.disabled).toBe(true);
  });

  it('builds a neutral workspace CTA using the latest project when available', () => {
    const cta = buildHomeSecondaryCta('/projects/rec_1');

    expect(cta.primaryAction).toEqual({
      label: 'Open latest project',
      href: '/projects/rec_1',
    });
    expect(cta.secondaryAction).toEqual({
      label: 'Upload media',
      href: '/projects/new?mode=upload',
    });
  });

  it('falls back to create-project CTA when no latest project exists', () => {
    const cta = buildHomeSecondaryCta();

    expect(cta.primaryAction).toEqual({
      label: 'Create project',
      href: '/projects',
    });
  });

  it('maps analytics summary into real dashboard metrics', () => {
    const analytics = buildHomeAnalyticsData({
      totalMinutesRecorded: 47,
      projectCount: 3,
      lastRecordingAt: '2026-03-30T10:00:00.000Z',
    });

    expect(analytics).toEqual({
      totalMinutesRecorded: 47,
      projectCount: 3,
      lastRecordingAt: 'Mar 30, 2026',
    });
  });

  it('returns undefined analytics data when the backend summary is missing', () => {
    expect(buildHomeAnalyticsData()).toBeUndefined();
    expect(buildHomeAnalyticsData(null)).toBeUndefined();
  });
});
