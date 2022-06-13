import { describe, expect, it, vi } from 'vitest';

vi.unmock('@sentry/browser');

// mock functions need to be imported first
import { mockRrweb, mockSdk } from '@test';

vi.useFakeTimers({ advanceTimers: true });

describe('Replay (sampling)', () => {
  it('does nothing if not sampled', async () => {
    const { record: mockRecord } = mockRrweb();
    const { replay } = await mockSdk({
      replayOptions: { stickySession: true, replaysSamplingRate: 0.0 },
    });

    vi.spyOn(replay, 'loadSession');
    vi.spyOn(replay, 'addListeners');
    // @ts-expect-error private
    expect(replay.initialState).toEqual(undefined);
    vi.runAllTimers();

    expect(replay.session?.sampled).toBe(false);
    // @ts-expect-error private
    expect(replay.initialState).toEqual({
      timestamp: expect.any(Number),
      url: 'http://localhost:3000/',
    });
    expect(mockRecord).not.toHaveBeenCalled();
    expect(replay.addListeners).not.toHaveBeenCalled();
  });
});
