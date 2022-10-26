import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import * as SentryUtils from '@sentry/utils';
import { BASE_TIMESTAMP, mockRrweb, mockSdk } from '@test';
import { PerformanceEntryResource } from '@test/fixtures/performanceEntry/resource';

import {
  MAX_SESSION_LIFE,
  REPLAY_SESSION_KEY,
  SESSION_IDLE_DURATION,
  VISIBILITY_CHANGE_TIMEOUT,
} from './session/constants';
import * as CaptureInternalException from './util/captureInternalException';
import { Replay } from './';

jest.useFakeTimers({ advanceTimers: true });

async function advanceTimers(time: number) {
  jest.advanceTimersByTime(time);
  await new Promise(process.nextTick);
}

type MockFetch = jest.MockedFunction<typeof fetch>;
describe('Replay', () => {
  let replay: Replay;
  const prevLocation = window.location;

  type MockSendReplayRequest = jest.MockedFunction<
    typeof replay.sendReplayRequest
  >;
  let mockSendReplayRequest: MockSendReplayRequest;
  let domHandler: (args: any) => any;
  const { record: mockRecord } = mockRrweb();
  let mockFetch: MockFetch;

  jest.spyOn(CaptureInternalException, 'captureInternalException');

  beforeAll(async () => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    jest
      .spyOn(SentryUtils, 'addInstrumentationHandler')
      .mockImplementation((type, handler: (args: any) => any) => {
        if (type === 'dom') {
          domHandler = handler;
        }
      });

    ({ replay } = await mockSdk());
    jest.runAllTimers();
    jest.spyOn(replay, 'flush');
    jest.spyOn(replay, 'runFlush');
    mockFetch = global.fetch as MockFetch;
  });

  beforeEach(() => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    replay.eventBuffer?.destroy();
    jest.spyOn(replay, 'sendReplayRequest');
    mockSendReplayRequest = replay.sendReplayRequest as MockSendReplayRequest;
  });

  afterEach(async () => {
    jest.runAllTimers();
    await new Promise(process.nextTick);
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    // @ts-expect-error: The operand of a 'delete' operator must be optional.ts(2790)
    delete window.location;
    Object.defineProperty(window, 'location', {
      value: prevLocation,
      writable: true,
    });
    sessionStorage.clear();
    replay.clearSession();
    replay.loadSession({ expiry: SESSION_IDLE_DURATION });
    jest.clearAllMocks();
    mockSendReplayRequest.mockRestore();
    mockRecord.takeFullSnapshot.mockClear();
    // @ts-expect-error private
    replay.lastActivity = BASE_TIMESTAMP;
  });

  afterAll(() => {
    replay && replay.stop();
  });

  it('calls rrweb.record with custom options', async () => {
    expect(mockRecord.mock.calls[0][0]).toMatchInlineSnapshot(`
      {
        "blockClass": "sentry-block",
        "blockSelector": "[data-sentry-block],img,image,svg,path,rect,area,video,object,picture,embed,map,audio",
        "emit": [Function],
        "ignoreClass": "sentry-test-ignore",
        "maskAllInputs": true,
        "maskTextClass": "sentry-mask",
        "maskTextSelector": "*",
      }
    `);
  });

  it('should have a session after setup', () => {
    expect(replay.session).toMatchObject({
      lastActivity: BASE_TIMESTAMP,
      started: BASE_TIMESTAMP,
    });
    expect(replay.session?.id).toBeDefined();
    expect(replay.session?.segmentId).toBeDefined();
  });

  it('clears session', () => {
    replay.clearSession();
    expect(window.sessionStorage.getItem(REPLAY_SESSION_KEY)).toBe(null);
    expect(replay.session).toBe(undefined);
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

  it('creates a new session and triggers a full dom snapshot when document becomes focused after [VISIBILITY_CHANGE_TIMEOUT]ms', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'visible';
      },
    });

    const initialSession = replay.session;

    jest.advanceTimersByTime(VISIBILITY_CHANGE_TIMEOUT + 1);

    window.dispatchEvent(new Event('focus'));

    expect(mockRecord.takeFullSnapshot).toHaveBeenLastCalledWith(true);

    // Should have created a new session
    expect(replay).not.toHaveSameSession(initialSession);
  });

  it('does not create a new session if user hides the tab and comes back within [VISIBILITY_CHANGE_TIMEOUT] seconds', () => {
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

  it('uploads a replay event when window is blurred', async () => {
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
    const hiddenBreadcrumb = {
      type: 5,
      timestamp: +new Date(BASE_TIMESTAMP + ELAPSED) / 1000,
      data: {
        tag: 'breadcrumb',
        payload: {
          timestamp: +new Date(BASE_TIMESTAMP + ELAPSED) / 1000,
          type: 'default',
          category: 'ui.blur',
        },
      },
    };

    replay.addEvent(TEST_EVENT);
    window.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay.sendReplayRequest).toHaveBeenCalled();
    expect(replay).toHaveSentReplay({
      events: JSON.stringify([TEST_EVENT, hiddenBreadcrumb]),
    });
    // Session's last activity should not be updated
    expect(replay.session?.lastActivity).toBe(BASE_TIMESTAMP);
    // events array should be empty
    expect(replay.eventBuffer?.length).toBe(0);
  });

  it('uploads a replay event when document becomes hidden', async () => {
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

    replay.addEvent(TEST_EVENT);
    document.dispatchEvent(new Event('visibilitychange'));
    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay.sendReplayRequest).toHaveBeenCalled();
    expect(replay).toHaveSentReplay({ events: JSON.stringify([TEST_EVENT]) });

    // Session's last activity is not updated because we do not consider
    // visibilitystate as user being active
    expect(replay.session?.lastActivity).toBe(BASE_TIMESTAMP);
    // events array should be empty
    expect(replay.eventBuffer?.length).toBe(0);
  });

  it('uploads a replay event if 5 seconds have elapsed since the last replay event occurred', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);
    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    await advanceTimers(ELAPSED);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(1);
    expect(replay).toHaveSentReplay({ events: JSON.stringify([TEST_EVENT]) });

    // No user activity to trigger an update
    expect(replay.session?.lastActivity).toBe(BASE_TIMESTAMP);
    expect(replay.session?.segmentId).toBe(1);

    // events array should be empty
    expect(replay.eventBuffer?.length).toBe(0);
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

    expect(replay).toHaveSentReplay({
      events: JSON.stringify([...Array(5)].map(() => TEST_EVENT)),
    });

    // There should also not be another attempt at an upload 5 seconds after the last replay event
    mockFetch.mockClear();
    await advanceTimers(5000);

    expect(replay).not.toHaveSentReplay();

    expect(replay.session?.lastActivity).toBe(BASE_TIMESTAMP);
    expect(replay.session?.segmentId).toBe(1);
    // events array should be empty
    expect(replay.eventBuffer?.length).toBe(0);

    // Let's make sure it continues to work
    mockFetch.mockClear();
    mockRecord._emitter(TEST_EVENT);
    await advanceTimers(5000);
    expect(replay).toHaveSentReplay({ events: JSON.stringify([TEST_EVENT]) });
  });

  it('creates a new session if user has been idle for 15 minutes and comes back to click their mouse', async () => {
    const initialSession = replay.session;

    expect(initialSession?.id).toBeDefined();
    // @ts-expect-error private member
    expect(replay.initialState).toEqual({
      url: 'http://localhost/',
      timestamp: BASE_TIMESTAMP,
    });

    const url = 'http://dummy/';
    Object.defineProperty(window, 'location', {
      value: new URL(url),
    });

    // Idle for 15 minutes
    const FIFTEEN_MINUTES = 15 * 60000;
    jest.advanceTimersByTime(FIFTEEN_MINUTES);

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

    expect(replay).not.toHaveSentReplay();

    // Should be a new session
    expect(replay).not.toHaveSameSession(initialSession);

    // Now do a click
    domHandler({
      name: 'click',
    });

    await advanceTimers(5000);

    const newTimestamp = BASE_TIMESTAMP + FIFTEEN_MINUTES;
    const breadcrumbTimestamp = newTimestamp + 20; // I don't know where this 20ms comes from

    expect(replay).toHaveSentReplay({
      events: JSON.stringify([
        { data: { isCheckout: true }, timestamp: newTimestamp, type: 2 },
        {
          type: 5,
          timestamp: breadcrumbTimestamp,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: breadcrumbTimestamp / 1000,
              type: 'default',
              category: `ui.click`,
              message: '<unknown>',
              data: {},
            },
          },
        },
      ]),
    });

    // `initialState` should be reset when a new session is created
    // @ts-expect-error private member
    expect(replay.initialState).toEqual({
      url: 'http://dummy/',
      timestamp: newTimestamp,
    });
  });

  it('does not record if user has been idle for more than MAX_SESSION_LIFE and only starts a new session after a user action', async () => {
    const initialSession = replay.session;

    expect(initialSession?.id).toBeDefined();
    // @ts-expect-error private member
    expect(replay.initialState).toEqual({
      url: 'http://localhost/',
      timestamp: BASE_TIMESTAMP,
    });

    const url = 'http://dummy/';
    Object.defineProperty(window, 'location', {
      value: new URL(url),
    });

    // Idle for MAX_SESSION_LIFE
    jest.advanceTimersByTime(MAX_SESSION_LIFE);

    // These events will not get flushed and will eventually be dropped because user is idle and session is expired
    const TEST_EVENT = {
      data: { name: 'lost event' },
      timestamp: MAX_SESSION_LIFE,
      type: 3,
    };
    mockRecord._emitter(TEST_EVENT);
    window.dispatchEvent(new Event('blur'));
    await advanceTimers(5000);

    expect(replay).not.toHaveSentReplay();
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    // Should be the same session because user has been idle and no events have caused a new session to be created
    expect(replay).toHaveSameSession(initialSession);

    // @ts-expect-error private
    expect(replay.stopRecording).toBeUndefined();

    // Now do a click
    domHandler({
      name: 'click',
    });

    // new session is created
    expect(replay).not.toHaveSameSession(initialSession);
    await advanceTimers(5000);

    const newTimestamp = BASE_TIMESTAMP + MAX_SESSION_LIFE + 5000 + 20; // I don't know where this 20ms comes from
    const breadcrumbTimestamp = newTimestamp;

    expect(replay).toHaveSentReplay({
      events: JSON.stringify([
        { data: { isCheckout: true }, timestamp: newTimestamp, type: 2 },
        {
          type: 5,
          timestamp: breadcrumbTimestamp,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: breadcrumbTimestamp / 1000,
              type: 'default',
              category: `ui.click`,
              message: '<unknown>',
              data: {},
            },
          },
        },
      ]),
    });

    // `initialState` should be reset when a new session is created
    // @ts-expect-error private member
    expect(replay.initialState).toEqual({
      url: 'http://dummy/',
      timestamp: newTimestamp,
    });
  });

  it('uploads a dom breadcrumb 5 seconds after listener receives an event', async () => {
    domHandler({
      name: 'click',
    });

    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    await advanceTimers(ELAPSED);

    expect(replay).toHaveSentReplay({
      events: JSON.stringify([
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
      ]),
    });

    expect(replay.session?.segmentId).toBe(1);
  });

  it('fails to upload data on first two calls and succeeds on the third', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    // Suppress console.errors
    jest.spyOn(console, 'error').mockImplementation(jest.fn());
    const mockConsole = console.error as jest.MockedFunction<
      typeof console.error
    >;
    // fail the first and second requests and pass the third one
    mockSendReplayRequest.mockImplementationOnce(() => {
      throw new Error('Something bad happened');
    });
    mockRecord._emitter(TEST_EVENT);

    await advanceTimers(5000);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(1);
    expect(replay).not.toHaveSentReplay();

    mockSendReplayRequest.mockReset();
    mockSendReplayRequest.mockImplementationOnce(() => {
      throw new Error('Something bad happened');
    });
    await advanceTimers(5000);
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(1);
    expect(replay).not.toHaveSentReplay();

    // next tick should retry and succeed
    mockConsole.mockRestore();
    mockSendReplayRequest.mockReset();

    await advanceTimers(8000);
    expect(replay.sendReplayRequest).not.toHaveBeenCalled();
    mockSendReplayRequest.mockRestore();
    await advanceTimers(2000);

    expect(replay).toHaveSentReplay({
      replayEventPayload: expect.objectContaining({
        error_ids: [],
        replay_id: expect.any(String),
        replay_start_timestamp: BASE_TIMESTAMP / 1000,
        // 20seconds = Add up all of the previous `advanceTimers()`
        timestamp: (BASE_TIMESTAMP + 20000) / 1000,
        trace_ids: [],
        urls: ['http://localhost/'],
      }),
      recordingPayloadHeader: { segment_id: 0 },
      events: JSON.stringify([TEST_EVENT]),
    });
    mockFetch.mockClear();

    // No activity has occurred, session's last activity should remain the same
    expect(replay.session?.lastActivity).toBeGreaterThanOrEqual(BASE_TIMESTAMP);
    expect(replay.session?.segmentId).toBe(1);

    // next tick should do nothing
    await advanceTimers(5000);
    expect(replay).not.toHaveSentReplay();
  });

  it('fails to upload data and hits retry max and stops', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    jest.spyOn(replay, 'sendReplay');
    // Suppress console.errors
    jest.spyOn(console, 'error').mockImplementation(jest.fn());
    const mockConsole = console.error as jest.MockedFunction<
      typeof console.error
    >;

    expect(replay.session?.segmentId).toBe(0);

    // fail the first and second requests and pass the third one
    mockSendReplayRequest.mockReset();
    mockSendReplayRequest.mockImplementation(() => {
      throw new Error('Something bad happened');
    });
    mockRecord._emitter(TEST_EVENT);

    await advanceTimers(5000);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(1);

    await advanceTimers(5000);
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(2);

    await advanceTimers(10000);
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(3);

    await advanceTimers(30000);
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(4);
    expect(replay.sendReplay).toHaveBeenCalledTimes(4);

    mockConsole.mockReset();

    // Make sure it doesn't retry again
    jest.runAllTimers();
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(4);
    expect(replay.sendReplay).toHaveBeenCalledTimes(4);

    // Retries = 3 (total tries = 4 including initial attempt)
    // + last exception is max retries exceeded
    expect(
      CaptureInternalException.captureInternalException
    ).toHaveBeenCalledTimes(5);
    expect(
      CaptureInternalException.captureInternalException
    ).toHaveBeenLastCalledWith(
      new Error('Unable to send Replay - max retries exceeded')
    );

    // No activity has occurred, session's last activity should remain the same
    expect(replay.session?.lastActivity).toBe(BASE_TIMESTAMP);

    // segmentId increases despite error
    expect(replay.session?.segmentId).toBe(1);
  });

  it('increases segment id after each event', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });

    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    await advanceTimers(ELAPSED);

    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 2 };

    replay.addEvent(TEST_EVENT);
    window.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);
    expect(replay).toHaveSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
    });
    expect(replay.session?.segmentId).toBe(1);

    replay.addEvent(TEST_EVENT);
    window.dispatchEvent(new Event('blur'));
    jest.runAllTimers();
    await new Promise(process.nextTick);
    expect(replay.session?.segmentId).toBe(2);
    expect(replay).toHaveSentReplay({
      recordingPayloadHeader: { segment_id: 1 },
    });
  });

  it('does not create replay event when there are no events to send', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });

    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(process.nextTick);
    expect(replay).not.toHaveSentReplay();

    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    await advanceTimers(ELAPSED);

    const TEST_EVENT = {
      data: {},
      timestamp: BASE_TIMESTAMP + ELAPSED,
      type: 2,
    };

    replay.addEvent(TEST_EVENT);
    window.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);

    expect(replay).toHaveSentReplay({
      replayEventPayload: expect.objectContaining({
        replay_start_timestamp: BASE_TIMESTAMP / 1000,
        urls: ['http://localhost/'], // this doesn't truly test if we are capturing the right URL as we don't change URLs, but good enough
      }),
    });
  });

  // TODO: ... this doesn't really test anything anymore since replay event and recording are sent in the same envelope
  it('does not create replay event if recording upload completely fails', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    // Suppress console.errors
    jest.spyOn(console, 'error').mockImplementation(jest.fn());
    const mockConsole = console.error as jest.MockedFunction<
      typeof console.error
    >;
    // fail the first and second requests and pass the third one
    mockSendReplayRequest.mockImplementationOnce(() => {
      throw new Error('Something bad happened');
    });
    mockRecord._emitter(TEST_EVENT);

    await advanceTimers(5000);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();

    // Reset console.error mock to minimize the amount of time we are hiding
    // console messages in case an error happens after
    mockConsole.mockClear();
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();

    mockSendReplayRequest.mockImplementationOnce(() => {
      throw new Error('Something bad happened');
    });
    await advanceTimers(5000);
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(2);

    // next tick should retry and fail
    mockConsole.mockClear();

    mockSendReplayRequest.mockImplementationOnce(() => {
      throw new Error('Something bad happened');
    });
    await advanceTimers(10000);
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(3);

    mockSendReplayRequest.mockImplementationOnce(() => {
      throw new Error('Something bad happened');
    });
    await advanceTimers(30000);
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(4);

    // No activity has occurred, session's last activity should remain the same
    expect(replay.session?.lastActivity).toBeGreaterThanOrEqual(BASE_TIMESTAMP);
    expect(replay.session?.segmentId).toBe(1);

    // TODO: Recording should stop and next event should do nothing
  });

  it('has correct timestamps when there events earlier than initial timestamp', async function () {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });

    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(process.nextTick);
    expect(replay.sendReplayRequest).not.toHaveBeenCalled();

    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    await advanceTimers(ELAPSED);

    const TEST_EVENT = {
      data: {},
      timestamp: BASE_TIMESTAMP + ELAPSED,
      type: 2,
    };

    replay.addEvent(TEST_EVENT);

    // Add a fake event that started BEFORE
    replay.addEvent({
      data: {},
      timestamp: (BASE_TIMESTAMP - 10000) / 1000,
      type: 5,
    });

    window.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);
    expect(replay).toHaveSentReplay({
      replayEventPayload: expect.objectContaining({
        replay_start_timestamp: (BASE_TIMESTAMP - 10000) / 1000,
        urls: ['http://localhost/'], // this doesn't truly test if we are capturing the right URL as we don't change URLs, but good enough
      }),
    });
  });

  it('does not have stale `replay_start_timestamp` due to an old time origin', async function () {
    const ELAPSED = 86400000 * 2; // 2 days
    // Change time origin to something very old (this happens in the browser
    // when a tab has sat idle for a long period and user comes back to it)
    // @ts-expect-error read-only
    SentryUtils.browserPerformanceTimeOrigin = BASE_TIMESTAMP - ELAPSED;

    // add a mock performance event
    replay.performanceEvents.push(PerformanceEntryResource());

    // This should be null because `addEvent` has not been called
    // @ts-expect-error private member
    expect(replay.context.earliestEvent).toBe(null);
    expect(global.fetch).toHaveBeenCalledTimes(0);

    // A new checkout occurs (i.e. a new session was started)
    const TEST_EVENT = {
      data: {},
      timestamp: BASE_TIMESTAMP / 1000,
      type: 2,
    };

    replay.addEvent(TEST_EVENT);
    // This event will trigger a flush
    window.dispatchEvent(new Event('blur'));
    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(replay).toHaveSentReplay({
      replayEventPayload: expect.objectContaining({
        // Make sure the old performance event is thrown out
        replay_start_timestamp: BASE_TIMESTAMP / 1000,
      }),
      events: JSON.stringify([
        TEST_EVENT,
        {
          type: 5,
          timestamp: BASE_TIMESTAMP / 1000,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: BASE_TIMESTAMP / 1000,
              type: 'default',
              category: 'ui.blur',
            },
          },
        },
      ]),
    });

    // This gets reset after sending replay
    // @ts-expect-error private member
    expect(replay.context.earliestEvent).toBe(null);
  });

  it('has single flush when checkout flush and debounce flush happen near simultaneously', async () => {
    // click happens first
    domHandler({
      name: 'click',
    });

    // checkout
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 2 };
    mockRecord._emitter(TEST_EVENT);

    await advanceTimers(5000);
    expect(replay.flush).toHaveBeenCalledTimes(1);

    // Make sure there's nothing queued up after
    await advanceTimers(5000);
    expect(replay.flush).toHaveBeenCalledTimes(1);
  });
});
