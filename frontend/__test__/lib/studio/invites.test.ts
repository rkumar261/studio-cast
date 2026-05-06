import { buildStudioInviteLink, tokenFromMagicLink } from '@/lib/studio/invites';

describe('studio invite helpers', () => {
  test('extracts guest token from query param', () => {
    expect(
      tokenFromMagicLink('https://example.com/studio/abc?mode=studio&guestToken=test-token')
    ).toBe('test-token');
  });

  test('extracts guest token from trailing path segment for legacy links', () => {
    expect(tokenFromMagicLink('/invite/legacy-token')).toBe('legacy-token');
  });

  test('builds guest studio invite links with participant and guest token', () => {
    expect(
      buildStudioInviteLink({
        origin: 'https://app.example.com',
        recordingId: 'rec_123',
        role: 'guest',
        participantId: 'part_456',
        guestToken: 'guest_789',
      })
    ).toBe(
      'https://app.example.com/studio/rec_123?mode=studio&role=guest&participantId=part_456&guestToken=guest_789'
    );
  });
});
