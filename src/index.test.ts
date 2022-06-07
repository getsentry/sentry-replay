jest.mock('rrweb', () => {
  const mockRecordFn: jest.Mock & Partial<RecordAdditionalProperties> = jest.fn(
    ({ emit }) => {
      mockRecordFn._emitter = emit;
    }
  );
  mockRecordFn.takeFullSnapshot = jest.fn((isCheckout) => {
    if (!mockRecordFn._emitter) {
      return;
    }

    mockRecordFn._emitter(
      {
        data: { isCheckout },
        timestamp: BASE_TIMESTAMP,
        type: 2,
      },
      isCheckout
    );
  });

  return {
    record: mockRecordFn as RecordMock,
  };
});

import * as Sentry from '@sentry/browser';
import * as SentryUtils from '@sentry/utils';
import * as rrweb from 'rrweb';

import { SentryReplay } from '@';
import {
  SESSION_IDLE_DURATION,
  VISIBILITY_CHANGE_TIMEOUT,
} from '@/session/constants';
import { BASE_TIMESTAMP } from '@test';
import { RRWebEvent } from '@/types';
import { Transport } from '@sentry/types';

type RecordAdditionalProperties = {
  takeFullSnapshot: jest.Mock;

  // Below are not mocked
  addCustomEvent: () => void;
  freezePage: () => void;
  mirror: unknown;

  // Custom property to fire events in tests, does not exist in rrweb.record
  _emitter: (event: RRWebEvent, ...args: any[]) => void;
};
type RecordMock = jest.MockedFunction<typeof rrweb.record> &
  RecordAdditionalProperties;

jest.unmock('@sentry/browser');
// jest.mock('./session/createSession');

const mockRecord = rrweb.record as RecordMock;

jest.useFakeTimers({ advanceTimers: true });

async function advanceTimers(time: number) {
  jest.advanceTimersByTime(time);
  await new Promise(process.nextTick);
}

class mockTransport implements Transport {
  async send() {
    return;
  }
  async flush() {
    return true;
  }
  async sendEvent(e: Event) {
    return {
      status: 'skipped',
      event: 'ok',
      type: 'transaction',
    };
  }
  async sendSession() {
    return;
  }
  async recordLostEvent() {
    return;
  }
  async close() {
    return;
  }
}

describe('SentryReplay', () => {
  let replay: SentryReplay;
  type MockSendReplayRequest = jest.MockedFunction<
    typeof replay.sendReplayRequest
  >;
  let mockSendReplayRequest: MockSendReplayRequest;
  let domHandler: (args: any) => any;

  beforeAll(() => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    jest
      .spyOn(SentryUtils, 'addInstrumentationHandler')
      .mockImplementation((_type, handler: (args: any) => any) => {
        domHandler = handler;
      });

    // XXX: We can only call `Sentry.init` once, not sure how to destroy it
    // after it has been in initialized
    window.__SENTRY_USE_ARRAY_BUFFER = true;
    replay = new SentryReplay({
      stickySession: true,
      rrwebConfig: { ignoreClass: 'sr-test' },
    });
    Sentry.init({
      dsn: 'https://dsn@ingest.f00.f00/1',
      tracesSampleRate: 1.0,
      integrations: [replay],
      autoSessionTracking: false,
      sendClientReports: false,
      transport: () => new mockTransport(),
    });
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
  });

  afterEach(() => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    sessionStorage.clear();
    replay.clearSession();
    replay.loadSession({ expiry: SESSION_IDLE_DURATION });
    mockRecord.takeFullSnapshot.mockClear();
  });

  afterAll(() => {
    replay && replay.destroy();
  });

  it('calls rrweb.record with custom options', async () => {
    expect(mockRecord.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
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

    jest.advanceTimersByTime(VISIBILITY_CHANGE_TIMEOUT + 1);

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
    jest.advanceTimersByTime(VISIBILITY_CHANGE_TIMEOUT - 1);
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

  it('uploads a replay event when document becomes hidden', async () => {
    mockRecord.takeFullSnapshot.mockClear();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });
    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    jest.advanceTimersByTime(ELAPSED);

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
      jest.advanceTimersByTime(4000);
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
    jest.advanceTimersByTime(15 * 60000);

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
    await advanceTimers(5000);

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
    jest.spyOn(console, 'error').mockImplementation(jest.fn());
    const mockConsole = console.error as jest.MockedFunction<
      typeof console.error
    >;
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

describe('SentryReplay (no sticky)', () => {
  let replay: SentryReplay;
  type MockSendReplayRequest = jest.MockedFunction<
    typeof replay.sendReplayRequest
  >;
  let mockSendReplayRequest: MockSendReplayRequest;

  beforeAll(() => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    // XXX: We can only call `Sentry.init` once, not sure how to destroy it
    // after it has been in initialized
    replay = new SentryReplay({
      stickySession: false,
      rrwebConfig: { ignoreClass: 'sr-test' },
    });

    const hub = new Sentry.Hub();
    global.fetch = jest.fn();
    const client = new Sentry.BrowserClient({
      dsn: 'https://dsn@ingest.f00.f00/1',
      transport: Sentry.makeFetchTransport,
      stackParser: Sentry.defaultStackParser,
      // tracesSampleRate: 1.0,
      integrations: [replay],
    });
    hub.bindClient(client);

    jest.spyOn(Sentry, 'getCurrentHub');

    (
      Sentry.getCurrentHub as jest.MockedFunction<typeof Sentry.getCurrentHub>
    ).mockImplementation(() => hub);

    // XXX: we cannot call `Sentry.init()` again in the same test file
    // So we have to fake the init with existing SDK client with a different plugin instance
    replay.setup();

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
  });

  afterEach(() => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    replay.clearSession();
    replay.loadSession({ expiry: SESSION_IDLE_DURATION });
    mockRecord.takeFullSnapshot.mockClear();
  });

  afterAll(() => {
    replay && replay.destroy();
  });

  it('creates a new session and triggers a full dom snapshot when document becomes visible after [VISIBILITY_CHANGE_TIMEOUT]ms', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'visible';
      },
    });

    const initialSession = replay.session;

    jest.advanceTimersByTime(VISIBILITY_CHANGE_TIMEOUT + 1);

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
    jest.advanceTimersByTime(VISIBILITY_CHANGE_TIMEOUT - 1);
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

  it('uploads a replay event when document becomes hidden', async () => {
    mockRecord.takeFullSnapshot.mockClear();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });

    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    jest.advanceTimersByTime(ELAPSED);

    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 2 };
    replay.eventBuffer.addEvent(TEST_EVENT);

    document.dispatchEvent(new Event('visibilitychange'));

    await new Promise(process.nextTick);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();

    expect(replay).toHaveSentReplay(JSON.stringify([TEST_EVENT]));

    // Session's last activity should be updated
    expect(replay.session.lastActivity).toBe(BASE_TIMESTAMP + ELAPSED);
    expect(replay.session.sequenceId).toBe(1);

    // events array should be empty
    expect(replay.eventBuffer.length).toBe(0);
  });

  it('uploads a replay event if 5 seconds have elapsed since the last replay event occurred', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);
    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    await advanceTimers(ELAPSED);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();

    expect(replay).toHaveSentReplay(JSON.stringify([TEST_EVENT]));

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
      jest.advanceTimersByTime(4000);
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
    jest.advanceTimersByTime(15 * 60000);

    // TBD: We are currently deciding that this event will get dropped, but
    // this could/should change in the future.
    const TEST_EVENT = {
      data: { name: 'lost event' },
      timestamp: BASE_TIMESTAMP,
      type: 3,
    };
    mockRecord._emitter(TEST_EVENT);

    await new Promise(process.nextTick);

    expect(replay).not.toHaveSentReplay();

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
});
