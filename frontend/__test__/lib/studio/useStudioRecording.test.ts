import { resolveFinalTrackSeq } from '@/lib/studio/useStudioRecording';

describe('resolveFinalTrackSeq', () => {
  it('uses the highest observed sequence when recovery is absent', () => {
    expect(resolveFinalTrackSeq(7)).toBe(7);
  });

  it('uses the recovered final sequence when it is higher than observed', () => {
    expect(resolveFinalTrackSeq(3, 9)).toBe(8);
  });

  it('prefers the observed sequence when recovery lags behind', () => {
    expect(resolveFinalTrackSeq(6, 5)).toBe(6);
  });

  it('clamps invalid recovered values to zero contribution', () => {
    expect(resolveFinalTrackSeq(2, Number.NaN)).toBe(2);
    expect(resolveFinalTrackSeq(0, 0)).toBe(0);
  });
});
