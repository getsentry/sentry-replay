// mock functions need to be imported first
import { BASE_TIMESTAMP, mockRrweb, mockSdk } from '@test';

import { SentryReplay } from '@';
import { SESSION_IDLE_DURATION } from '@/session/constants';

jest.useFakeTimers({ advanceTimers: true });

describe('SentryReplay - stop', () => {
  let replay: SentryReplay;
  const prevLocation = window.location;

  type MockSendReplayRequest = jest.MockedFunction<
    typeof replay.sendReplayRequest
  >;
  let mockSendReplayRequest: MockSendReplayRequest;
  const { record: mockRecord } = mockRrweb();

  beforeAll(() => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    ({ replay } = mockSdk());
    jest.spyOn(replay, 'sendReplayRequest');
    mockSendReplayRequest = replay.sendReplayRequest as MockSendReplayRequest;
    mockSendReplayRequest.mockImplementation(
      jest.fn(async () => {
        return;
      })
    );
    jest.runAllTimers();
  });

  beforeEach(() => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    mockSendReplayRequest.mockClear();
    replay.eventBuffer?.destroy();
  });

  afterEach(async () => {
    jest.runAllTimers();
    await new Promise(process.nextTick);
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    sessionStorage.clear();
    replay.clearSession();
    replay.loadSession({ expiry: SESSION_IDLE_DURATION });
    mockRecord.takeFullSnapshot.mockClear();
    // @ts-expect-error: The operand of a 'delete' operator must be optional.ts(2790)
    delete window.location;
    Object.defineProperty(window, 'location', {
      value: prevLocation,
      writable: true,
    });
  });

  afterAll(() => {
    replay && replay.destroy();
  });

  it('does not upload replay if it was stopped and can resume replays afterwards', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });
    const ELAPSED = 5000;
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 2 };

    // stop replays
    replay.destroy();

    // Pretend 5 seconds have passed
    jest.advanceTimersByTime(ELAPSED);

    replay.addEvent(TEST_EVENT);
    window.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay.sendReplayRequest).not.toHaveBeenCalled();
    expect(replay).not.toHaveSentReplay();
    // Session's last activity should be updated
    expect(replay.session?.lastActivity).toEqual(BASE_TIMESTAMP);
    // eventBuffer is destroyed
    expect(replay.eventBuffer).toBe(null);

    // re-enable replay
    replay.setup();

    // Not sure where the .02 comes from tbh
    const timestamp =
      +new Date(BASE_TIMESTAMP + ELAPSED + ELAPSED) / 1000 + 0.02;
    const hiddenBreadcrumb = {
      type: 5,
      timestamp,
      data: {
        tag: 'breadcrumb',
        payload: {
          timestamp,
          type: 'default',
          category: 'ui.blur',
        },
      },
    };

    jest.advanceTimersByTime(ELAPSED);
    replay.addEvent(TEST_EVENT);
    window.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);
    expect(replay.sendReplayRequest).toHaveBeenCalled();
    expect(replay).toHaveSentReplay(
      JSON.stringify([TEST_EVENT, hiddenBreadcrumb])
    );
    // Session's last activity should be updated
    expect(replay.session?.lastActivity).toBeGreaterThan(
      BASE_TIMESTAMP + ELAPSED + ELAPSED
    );
  });
});
