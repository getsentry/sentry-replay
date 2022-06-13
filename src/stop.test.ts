import * as SentryUtils from '@sentry/utils';
// mock functions need to be imported first
import { BASE_TIMESTAMP, mockRrweb, mockSdk } from '@test';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  MockedFunction,
  vi,
} from 'vitest';

import { SESSION_IDLE_DURATION } from './session/constants';
import { Replay } from './';

vi.useFakeTimers();

describe('Replay - stop', () => {
  let replay: Replay;
  const prevLocation = window.location;

  type MockAddInstrumentationHandler = MockedFunction<
    typeof SentryUtils.addInstrumentationHandler
  >;
  const { record: mockRecord } = mockRrweb();

  let mockAddInstrumentationHandler: MockAddInstrumentationHandler;

  beforeAll(async () => {
    vi.setSystemTime(new Date(BASE_TIMESTAMP));
    vi.mock('@sentry/utils', async () => {
      const actual = (await vi.importActual(
        '@sentry/utils'
      )) as typeof SentryUtils;
      return {
        ...actual,
        logger: actual.logger,
        addInstrumentationHandler: vi.fn(),
      };
    });
    mockAddInstrumentationHandler =
      SentryUtils.addInstrumentationHandler as MockAddInstrumentationHandler;

    ({ replay } = await mockSdk());
    vi.spyOn(replay, 'sendReplayRequest');
    vi.runAllTimers();
  });

  beforeEach(() => {
    vi.setSystemTime(new Date(BASE_TIMESTAMP));
    replay.eventBuffer?.destroy();
  });

  afterEach(async () => {
    vi.runAllTimers();
    // await new Promise(process.nextTick);
    vi.setSystemTime(new Date(BASE_TIMESTAMP));
    sessionStorage.clear();
    replay.clearSession();
    replay.loadSession({ expiry: SESSION_IDLE_DURATION });
    mockRecord.takeFullSnapshot.mockClear();
    mockAddInstrumentationHandler.mockClear();
    Object.defineProperty(window, 'location', {
      value: prevLocation,
      writable: true,
    });
  });

  afterAll(() => {
    replay && replay.stop();
  });

  it('does not upload replay if it was stopped and can resume replays afterwards', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });
    const ELAPSED = 5000;
    const EXTRA_TICKS = 0;
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 2 };

    // stop replays
    replay.stop();

    // Pretend 5 seconds have passed
    vi.advanceTimersByTime(ELAPSED);

    replay.addEvent(TEST_EVENT);
    window.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay.sendReplayRequest).not.toHaveBeenCalled();
    expect(replay).not.toHaveSentReplay();
    // Session's last activity should not be updated
    expect(replay.session?.lastActivity).toEqual(BASE_TIMESTAMP);
    // eventBuffer is destroyed
    expect(replay.eventBuffer).toBe(null);

    // re-enable replay
    replay.start();

    vi.advanceTimersByTime(ELAPSED);

    const timestamp =
      +new Date(BASE_TIMESTAMP + ELAPSED + ELAPSED + EXTRA_TICKS) / 1000;

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

    replay.addEvent(TEST_EVENT);
    window.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);
    expect(replay.sendReplayRequest).toHaveBeenCalled();
    expect(replay).toHaveSentReplay({
      events: JSON.stringify([TEST_EVENT, hiddenBreadcrumb]),
    });
    // Session's last activity is last updated when we call `setup()` and *NOT*
    // when tab is blurred
    expect(replay.session?.lastActivity).toBe(BASE_TIMESTAMP + ELAPSED);
  });

  it('does not buffer events when stopped', async function () {
    window.dispatchEvent(new Event('blur'));
    expect(replay.eventBuffer?.length).toBe(1);

    // stop replays
    replay.stop();

    expect(replay.eventBuffer?.length).toBe(undefined);

    window.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);

    expect(replay.eventBuffer?.length).toBe(undefined);
    expect(replay).not.toHaveSentReplay();
  });

  it('does not call core SDK `addInstrumentationHandler` after initial setup', async function () {
    // NOTE: We clear addInstrumentationHandler mock after every test
    replay.stop();
    replay.start();
    replay.stop();
    replay.start();

    expect(mockAddInstrumentationHandler).not.toHaveBeenCalled();
  });
});
