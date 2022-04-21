import * as Sentry from '@sentry/browser';
import '@sentry/tracing';
import { SentryReplay } from '@';
import {
  SESSION_IDLE_DURATION,
  VISIBILITY_CHANGE_TIMEOUT,
} from './session/constants';
import { BASE_TIMESTAMP } from '@test';
import type { RRWebEvent } from './types';

type RecordAdditionalProperties = {
  takeFullSnapshot: jest.Mock;
  _emitter: (event: RRWebEvent) => void;
};
type RecordMock = jest.Mock & RecordAdditionalProperties;

jest.mock('rrweb', () => {
  const recordMockFn: jest.Mock & Partial<RecordAdditionalProperties> = jest.fn(
    ({ emit }) => {
      recordMockFn._emitter = emit;
    }
  );
  recordMockFn.takeFullSnapshot = jest.fn((isCheckout) => {
    if (!recordMockFn._emitter) {
      return;
    }

    if (!isCheckout) {
      return;
    }

    // This is probably not a good mock, I don't know what `isCheckout` param
    // does
    recordMockFn._emitter({
      data: { isCheckout },
      timestamp: BASE_TIMESTAMP,
      type: 2,
    });
  });

  return {
    record: recordMockFn as RecordMock,
  };
});
jest.unmock('@sentry/browser');

// eslint-disable-next-line
const rrweb = require('rrweb');

const recordMock = rrweb.record as RecordMock;

jest.useFakeTimers();

describe('SentryReplay', () => {
  let replay: SentryReplay;
  // let emitter: (event: RRWebEvent, isCheckout?: boolean) => void;

  beforeAll(() => {
    // XXX: We can only call `Sentry.init` once, not sure how to destroy it
    // after it has been in initialized
    replay = new SentryReplay({
      stickySession: true,
      rrwebConfig: { ignoreClass: 'sr-test' },
    });
    Sentry.init({
      dsn: 'https://dsn@ingest.f00.f00/1',
      tracesSampleRate: 1.0,
      integrations: [replay],
    });
    jest.spyOn(replay, 'sendReplayRequest');
    (replay.sendReplayRequest as jest.Mock).mockImplementation(
      jest.fn(async () => {
        return;
      })
    );
    jest.runAllTimers();
  });

  beforeEach(async () => {
    (replay?.sendReplayRequest as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    sessionStorage.clear();
    replay.loadSession({ expiry: SESSION_IDLE_DURATION });
    recordMock.takeFullSnapshot.mockClear();
  });

  afterAll(() => {
    replay && replay.teardown();
  });

  it('calls rrweb.record with custom options', () => {
    expect(recordMock.mock.calls[0][0]).toMatchInlineSnapshot(`
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
    expect(replay.session.spanId).toBeDefined();
    expect(replay.session.traceId).toBeDefined();
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

    expect(recordMock.takeFullSnapshot).toHaveBeenLastCalledWith(true);

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
    expect(recordMock.takeFullSnapshot).not.toHaveBeenCalled();
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

    expect(recordMock.takeFullSnapshot).not.toHaveBeenCalled();
    // Should NOT have created a new session
    expect(replay).toHaveSameSession(initialSession);
  });

  it('uploads a replay event when document becomes hidden', () => {
    recordMock.takeFullSnapshot.mockClear();
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
    replay.events = [TEST_EVENT];

    document.dispatchEvent(new Event('visibilitychange'));

    expect(recordMock.takeFullSnapshot).not.toHaveBeenCalled();

    const regex = new RegExp(
      'https://ingest.f00.f00/api/1/events/[^/]+/attachments/\\?sentry_key=dsn&sentry_version=7&sentry_client=replay'
    );
    expect(replay.sendReplayRequest).toHaveBeenCalledWith(
      expect.stringMatching(regex),
      [TEST_EVENT]
    );

    // Session's last activity should be updated
    expect(replay.session.lastActivity).toBe(BASE_TIMESTAMP + ELAPSED);

    // events array should be empty
    expect(replay.events).toHaveLength(0);
  });

  it('uploads a replay event if 5 seconds have elapsed since the last replay event occurred', () => {
    jest.spyOn(replay, 'sendReplayRequest');
    (replay.sendReplayRequest as jest.Mock).mockImplementationOnce(
      jest.fn(async () => {
        return;
      })
    );

    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 2 };
    rrweb.record._emitter(TEST_EVENT);

    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    jest.advanceTimersByTime(ELAPSED);

    expect(recordMock.takeFullSnapshot).not.toHaveBeenCalled();

    const regex = new RegExp(
      'https://ingest.f00.f00/api/1/events/[^/]+/attachments/\\?sentry_key=dsn&sentry_version=7&sentry_client=replay'
    );
    expect(replay.sendReplayRequest).toHaveBeenCalledWith(
      expect.stringMatching(regex),
      [TEST_EVENT]
    );

    // No activity has occurred, session's last activity should remain the same
    expect(replay.session.lastActivity).toBe(BASE_TIMESTAMP);

    // events array should be empty
    expect(replay.events).toHaveLength(0);
  });

  it('uploads a replay event if 15 seconds have elapsed since the last replay upload', () => {
    jest.spyOn(replay, 'sendReplayRequest');
    (replay.sendReplayRequest as jest.Mock).mockImplementation(
      jest.fn(async () => {
        return;
      })
    );

    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    // Fire a new event every 4 seconds, 4 times
    [...Array(4)].forEach(() => {
      rrweb.record._emitter(TEST_EVENT);
      jest.advanceTimersByTime(4000);
    });

    // We are at time = +16seconds now (relative to BASE_TIMESTAMP)
    // The next event should cause an upload immediately
    rrweb.record._emitter(TEST_EVENT);
    expect(replay).toHaveSentReplay([...Array(5)].map(() => TEST_EVENT));

    // There should also not be another attempt at an upload 5 seconds after the last replay event
    (replay.sendReplayRequest as jest.Mock).mockClear();
    jest.advanceTimersByTime(5000);
    expect(replay).not.toHaveSentReplay();

    expect(replay.session.lastActivity).toBe(BASE_TIMESTAMP + 16000);
    // events array should be empty
    expect(replay.events).toHaveLength(0);

    // Let's make sure it continues to work
    (replay.sendReplayRequest as jest.Mock).mockClear();
    rrweb.record._emitter(TEST_EVENT);
    jest.advanceTimersByTime(5000);
    expect(replay).toHaveSentReplay([TEST_EVENT]);

    // Clean-up
    (replay.sendReplayRequest as jest.Mock).mockReset();
  });

  it('create a new session if user has been idle for more than 15 minutes and comes back to move their mouse', () => {
    const initialSession = replay.session;

    expect(initialSession.id).toBeDefined();
    expect(initialSession.spanId).toBeDefined();
    expect(initialSession.traceId).toBeDefined();

    // Idle for 15 minutes
    jest.advanceTimersByTime(15 * 60000);

    // TBD: We are currently deciding that this event will get dropped, but
    // this could/should change in the future.
    const TEST_EVENT = {
      data: { name: 'lost event' },
      timestamp: BASE_TIMESTAMP,
      type: 3,
    };
    rrweb.record._emitter(TEST_EVENT);
    expect(replay).not.toHaveSentReplay();

    // Instead of recording the above event, a full snapshot will occur.
    //
    // TODO: We could potentially figure out a way to save the last session,
    // and produce a checkout based on a previous checkout + updates, and then
    // replay the event on top. Or maybe replay the event on top of a refresh
    // snapshot.
    expect(recordMock.takeFullSnapshot).toHaveBeenCalledWith(true);

    expect(replay).toHaveSentReplay([
      { data: { isCheckout: true }, timestamp: BASE_TIMESTAMP, type: 2 },
    ]);

    // Should be a new session
    expect(replay).not.toHaveSameSession(initialSession);

    (replay.sendReplayRequest as jest.Mock).mockReset();
  });
});
