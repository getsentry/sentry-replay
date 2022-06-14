// mock functions need to be imported first
import { BASE_TIMESTAMP, mockSdk, mockRrweb } from '@test';

import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
  MockedFunction,
} from 'vitest';

import { addInstrumentationHandler } from '@sentry/utils';

import { SentryReplay } from '@';
import {
  SESSION_IDLE_DURATION,
  VISIBILITY_CHANGE_TIMEOUT,
} from '@/session/constants';

vi.useFakeTimers();

async function advanceTimers(time: number) {
  vi.advanceTimersByTime(time);
}

describe('SentryReplay', () => {
  let replay: SentryReplay;
  type MockSendReplayRequest = MockedFunction<typeof replay.sendReplayRequest>;
  let mockSendReplayRequest: MockSendReplayRequest;
  let domHandler: (args: any) => any;
  const { record: mockRecord } = mockRrweb();

  beforeAll(() => {
    vi.setSystemTime(new Date(BASE_TIMESTAMP));
    ({ replay } = mockSdk());
    vi.spyOn(replay, 'sendReplayRequest');
    vi.mock('@sentry/utils', async () => {
      const actual = await vi.importActual('@sentry/utils');
      return {
        ...actual,
        logger: actual.logger,
        addInstrumentationHandler: vi.fn(),
      };
    });
    (
      addInstrumentationHandler as MockedFunction<
        typeof addInstrumentationHandler
      >
    ).mockImplementation((_type, handler: (args: any) => any) => {
      domHandler = handler;
    });
    mockSendReplayRequest = replay.sendReplayRequest as MockSendReplayRequest;
    mockSendReplayRequest.mockImplementation(
      vi.fn(async () => {
        return;
      })
    );
    vi.runAllTimers();
  });

  beforeEach(() => {
    vi.setSystemTime(new Date(BASE_TIMESTAMP));
    mockSendReplayRequest.mockClear();
  });

  afterEach(() => {
    vi.setSystemTime(new Date(BASE_TIMESTAMP));
    sessionStorage.clear();
    replay.clearSession();
    replay.loadSession({ expiry: SESSION_IDLE_DURATION });
    mockRecord.takeFullSnapshot.mockClear();
  });

  afterAll(() => {
    replay && replay.destroy();
    vi.unmock('@sentry/utils');
  });

  it('calls rrweb.record with custom options', async () => {
    expect(mockRecord.mock.calls[0][0]).toMatchInlineSnapshot(`
      {
        "blockClass": "sr-block",
        "emit": [Function],
        "ignoreClass": "sr-test",
        "maskAllInputs": true,
        "maskTextClass": "sr-mask",
      }
    `);
  });

  it('should have a session after setup', () => {
    expect(replay.session).toMatchObject({
      lastActivity: BASE_TIMESTAMP,
      started: BASE_TIMESTAMP,
    });
    expect(replay.session.id).toBeDefined();
    expect(replay.session.sequenceId).toBeDefined();
  });

  it('creates a new session and triggers a full dom snapshot when document becomes visible after [VISIBILITY_CHANGE_TIMEOUT]ms', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'visible';
      },
    });

    const initialSession = replay.session;

    vi.advanceTimersByTime(VISIBILITY_CHANGE_TIMEOUT + 1);

    document.dispatchEvent(new Event('visibilitychange'));

    expect(mockRecord.takeFullSnapshot).toHaveBeenLastCalledWith(true);

    // Should have created a new session
    expect(replay).not.toHaveSameSession(initialSession);
  });

  it('does not create a new session if user hides the tab and comes back within 60 seconds', () => {
    const initialSession = replay.session;

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).toHaveSameSession(initialSession);

    // User comes back before `VISIBILITY_CHANGE_TIMEOUT` elapses
    vi.advanceTimersByTime(VISIBILITY_CHANGE_TIMEOUT - 1);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'visible';
      },
    });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    // Should NOT have created a new session
    expect(replay).toHaveSameSession(initialSession);
  });

  it.only('uploads a replay event when document becomes hidden', async () => {
    mockRecord.takeFullSnapshot.mockClear();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });
    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    vi.advanceTimersByTime(ELAPSED);

    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 2 };
    replay.eventBuffer.addEvent(TEST_EVENT);
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(process.nextTick);
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    const regex = new RegExp(
      'https://ingest.f00.f00/api/1/events/[^/]+/attachments/\\?sentry_key=dsn&sentry_version=7&sentry_client=replay'
    );
    expect(replay.sendReplayRequest).toHaveBeenCalled();
    expect(replay.sendReplayRequest).toHaveBeenCalledWith({
      endpoint: expect.stringMatching(regex),
      events: JSON.stringify([TEST_EVENT]),
    });
    // Session's last activity should be updated
    expect(replay.session.lastActivity).toBeGreaterThan(BASE_TIMESTAMP);
    // // events array should be empty
    expect(replay.eventBuffer.length).toBe(0);
  });

  it('uploads a replay event if 5 seconds have elapsed since the last replay event occurred', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);
    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    await advanceTimers(ELAPSED);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();

    const regex = new RegExp(
      'https://ingest.f00.f00/api/1/events/[^/]+/attachments/\\?sentry_key=dsn&sentry_version=7&sentry_client=replay'
    );

    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(1);
    expect(replay.sendReplayRequest).toHaveBeenCalledWith({
      endpoint: expect.stringMatching(regex),
      events: JSON.stringify([TEST_EVENT]),
    });

    // No activity has occurred, session's last activity should remain the same
    expect(replay.session.lastActivity).toBe(BASE_TIMESTAMP);
    expect(replay.session.sequenceId).toBe(1);

    // events array should be empty
    expect(replay.eventBuffer.length).toBe(0);
  });

  it('uploads a replay event if 15 seconds have elapsed since the last replay upload', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    // Fire a new event every 4 seconds, 4 times
    [...Array(4)].forEach(() => {
      mockRecord._emitter(TEST_EVENT);
      vi.advanceTimersByTime(4000);
    });

    // We are at time = +16seconds now (relative to BASE_TIMESTAMP)
    // The next event should cause an upload immediately
    mockRecord._emitter(TEST_EVENT);
    await new Promise(process.nextTick);

    expect(replay).toHaveSentReplay(
      JSON.stringify([...Array(5)].map(() => TEST_EVENT))
    );

    // There should also not be another attempt at an upload 5 seconds after the last replay event
    mockSendReplayRequest.mockClear();
    await advanceTimers(5000);

    expect(replay).not.toHaveSentReplay();

    expect(replay.session.lastActivity).toBe(BASE_TIMESTAMP + 16000);
    expect(replay.session.sequenceId).toBe(1);
    // events array should be empty
    expect(replay.eventBuffer.length).toBe(0);

    // Let's make sure it continues to work
    mockSendReplayRequest.mockClear();
    mockRecord._emitter(TEST_EVENT);
    await advanceTimers(5000);
    expect(replay).toHaveSentReplay(JSON.stringify([TEST_EVENT]));

    // Clean-up
    mockSendReplayRequest.mockReset();
  });

  it('creates a new session if user has been idle for more than 15 minutes and comes back to move their mouse', async () => {
    const initialSession = replay.session;

    expect(initialSession.id).toBeDefined();

    // Idle for 15 minutes
    vi.advanceTimersByTime(15 * 60000);

    // TBD: We are currently deciding that this event will get dropped, but
    // this could/should change in the future.
    const TEST_EVENT = {
      data: { name: 'lost event' },
      timestamp: BASE_TIMESTAMP,
      type: 3,
    };
    mockRecord._emitter(TEST_EVENT);
    expect(replay).not.toHaveSentReplay();

    await new Promise(process.nextTick);

    // Instead of recording the above event, a full snapshot will occur.
    //
    // TODO: We could potentially figure out a way to save the last session,
    // and produce a checkout based on a previous checkout + updates, and then
    // replay the event on top. Or maybe replay the event on top of a refresh
    // snapshot.
    expect(mockRecord.takeFullSnapshot).toHaveBeenCalledWith(true);

    expect(replay).toHaveSentReplay(
      JSON.stringify([
        { data: { isCheckout: true }, timestamp: BASE_TIMESTAMP, type: 2 },
      ])
    );

    // Should be a new session
    expect(replay).not.toHaveSameSession(initialSession);

    mockSendReplayRequest.mockReset();
  });

  it('uploads a dom breadcrumb 5 seconds after listener receives an event', async () => {
    domHandler({
      name: 'click',
    });

    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    await advanceTimers(ELAPSED);

    expect(replay).toHaveSentReplay(
      JSON.stringify([
        {
          type: 5,
          timestamp: BASE_TIMESTAMP,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: BASE_TIMESTAMP / 1000,
              type: 'default',
              category: `ui.click`,
              message: '<unknown>',
              data: {},
            },
          },
        },
      ])
    );

    expect(replay.session.sequenceId).toBe(1);

    // breadcrumbs array should be empty
    expect(replay.breadcrumbs).toHaveLength(0);
  });

  it('fails to upload data on first call and retries after five seconds, sending successfully', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 2 };
    // Suppress console.errors
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    const mockConsole = console.error as MockedFunction<typeof console.error>;
    // fail the first request and pass the second one
    mockSendReplayRequest.mockImplementationOnce(() => {
      throw new Error('Something bad happened');
    });
    mockRecord._emitter(TEST_EVENT);

    await new Promise(process.nextTick);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(1);
    expect(replay).toHaveSentReplay(JSON.stringify([TEST_EVENT]));

    // Reset console.error mock to minimize the amount of time we are hiding
    // console messages in case an error happens after
    mockConsole.mockClear();
    vi.advanceTimersToNextTimer();
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();

    // next tick should retry and succeed
    mockSendReplayRequest.mockReset();
    mockSendReplayRequest.mockImplementationOnce(() => {
      return Promise.resolve();
    });
    advanceTimers(5000);
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(1);
    expect(replay).toHaveSentReplay(JSON.stringify([TEST_EVENT]));

    // No activity has occurred, session's last activity should remain the same
    expect(replay.session.lastActivity).toBe(BASE_TIMESTAMP);
    expect(replay.session.sequenceId).toBe(1);

    // next tick should do nothing
    mockSendReplayRequest.mockReset();
    mockSendReplayRequest.mockImplementationOnce(() => {
      return Promise.resolve();
    });
    advanceTimers(5000);
    expect(replay.sendReplayRequest).not.toHaveBeenCalled();
  });
});
