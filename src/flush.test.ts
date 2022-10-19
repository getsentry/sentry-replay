// mock functions need to be imported first
import * as SentryUtils from '@sentry/utils';
import { BASE_TIMESTAMP, mockRrweb, mockSdk } from '@test';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  MockedFunction,
  vi,
} from 'vitest';

import { SESSION_IDLE_DURATION } from './session/constants';
import { createPerformanceEntries } from './createPerformanceEntry';
import { Replay } from './';

vi.useFakeTimers();

async function advanceTimers(time: number) {
  vi.advanceTimersByTime(time);
  await new Promise(process.nextTick);
}

type MockSendReplay = MockedFunction<typeof Replay.prototype.sendReplay>;
type MockAddPerformanceEntries = MockedFunction<
  typeof Replay.prototype.addPerformanceEntries
>;
type MockAddMemoryEntry = MockedFunction<
  typeof Replay.prototype.addMemoryEntry
>;
type MockEventBufferFinish = MockedFunction<
  Exclude<typeof Replay.prototype.eventBuffer, null>['finish']
>;
type MockFlush = MockedFunction<typeof Replay.prototype.flush>;
type MockRunFlush = MockedFunction<typeof Replay.prototype.runFlush>;

const prevLocation = window.location;
let domHandler: (args: any) => any;

const { record: mockRecord } = mockRrweb();

let replay: Replay;
let mockSendReplay: MockSendReplay;
let mockFlush: MockFlush;
let mockRunFlush: MockRunFlush;
let mockEventBufferFinish: MockEventBufferFinish;
let mockAddMemoryEntry: MockAddMemoryEntry;
let mockAddPerformanceEntries: MockAddPerformanceEntries;

beforeAll(async () => {
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
  (
    SentryUtils.addInstrumentationHandler as MockedFunction<
      typeof SentryUtils.addInstrumentationHandler
    >
  ).mockImplementation((_type, handler: (args: any) => any) => {
    if (_type === 'dom') {
      domHandler = handler;
    }
  });

  ({ replay } = await mockSdk());
  vi.spyOn(replay, 'sendReplay');
  mockSendReplay = replay.sendReplay as MockSendReplay;
  mockSendReplay.mockImplementation(
    vi.fn(async () => {
      return true;
    })
  );

  vi.spyOn(replay, 'flush');
  mockFlush = replay.flush as MockFlush;

  vi.spyOn(replay, 'runFlush');
  mockRunFlush = replay.runFlush as MockRunFlush;

  vi.spyOn(replay, 'addPerformanceEntries');
  mockAddPerformanceEntries =
    replay.addPerformanceEntries as MockAddPerformanceEntries;

  mockAddPerformanceEntries.mockImplementation(async () => {
    return [];
  });

  vi.spyOn(replay, 'addMemoryEntry');
  mockAddMemoryEntry = replay.addMemoryEntry as MockAddMemoryEntry;
});

beforeEach(() => {
  vi.runAllTimers();
  vi.setSystemTime(new Date(BASE_TIMESTAMP));
  mockSendReplay.mockClear();
  replay.eventBuffer?.destroy();
  mockAddPerformanceEntries.mockClear();
  mockFlush.mockClear();
  mockRunFlush.mockClear();
  mockAddMemoryEntry.mockClear();

  if (replay.eventBuffer) {
    vi.spyOn(replay.eventBuffer, 'finish');
  }
  mockEventBufferFinish = replay.eventBuffer?.finish as MockEventBufferFinish;
  mockEventBufferFinish.mockClear();
});

afterEach(async () => {
  vi.runAllTimers();
  await new Promise(process.nextTick);
  vi.setSystemTime(new Date(BASE_TIMESTAMP));
  sessionStorage.clear();
  replay.clearSession();
  replay.loadSession({ expiry: SESSION_IDLE_DURATION });
  mockRecord.takeFullSnapshot.mockClear();
  Object.defineProperty(window, 'location', {
    value: prevLocation,
    writable: true,
  });
});

afterAll(() => {
  replay && replay.stop();
});

it('flushes twice after multiple flush() calls)', async () => {
  // blur events cause an immediate flush (as well as a flush due to adding a
  // breadcrumb) -- this means that the first blur event will be flushed and
  // the following blur events will all call a debounced flush function, which
  // should end up queueing a second flush

  window.dispatchEvent(new Event('blur'));
  window.dispatchEvent(new Event('blur'));
  window.dispatchEvent(new Event('blur'));
  window.dispatchEvent(new Event('blur'));

  expect(replay.flush).toHaveBeenCalledTimes(4);

  vi.runAllTimers();
  await new Promise(process.nextTick);
  expect(replay.runFlush).toHaveBeenCalledTimes(1);

  vi.runAllTimers();
  await new Promise(process.nextTick);
  expect(replay.runFlush).toHaveBeenCalledTimes(2);

  vi.runAllTimers();
  await new Promise(process.nextTick);
  expect(replay.runFlush).toHaveBeenCalledTimes(2);
});

it('long first flush enqueues following events', async () => {
  // Mock this to resolve after 20 seconds so that we can queue up following flushes
  mockAddPerformanceEntries.mockImplementationOnce(async () => {
    return await new Promise((resolve) => setTimeout(resolve, 20000));
  });

  expect(mockAddPerformanceEntries).not.toHaveBeenCalled();

  // flush #1 @ t=0s - due to blur
  window.dispatchEvent(new Event('blur'));
  expect(replay.flush).toHaveBeenCalledTimes(1);
  expect(replay.runFlush).toHaveBeenCalledTimes(1);

  // This will attempt to flush in 5 seconds (flushMinDelay)
  domHandler({
    name: 'click',
  });
  await advanceTimers(5000);
  // flush #2 @ t=5s - due to click
  expect(replay.flush).toHaveBeenCalledTimes(2);

  await advanceTimers(1000);
  // flush #3 @ t=6s - due to blur
  window.dispatchEvent(new Event('blur'));
  expect(replay.flush).toHaveBeenCalledTimes(3);

  // NOTE: Blur also adds a breadcrumb which calls `addUpdate`, meaning it will
  // flush after `flushMinDelay`, but this gets cancelled by the blur
  await advanceTimers(8000);
  expect(replay.flush).toHaveBeenCalledTimes(3);

  // flush #4 @ t=14s - due to blur
  window.dispatchEvent(new Event('blur'));
  expect(replay.flush).toHaveBeenCalledTimes(4);

  expect(replay.runFlush).toHaveBeenCalledTimes(1);
  await advanceTimers(6000);
  // t=20s
  // addPerformanceEntries is finished, `flushLock` promise is resolved, calls
  // debouncedFlush, which will call `flush` in 1 second
  expect(replay.flush).toHaveBeenCalledTimes(4);
  // sendReplay is called with replayId, events, segment
  expect(mockSendReplay).toHaveBeenLastCalledWith({
    events: expect.any(String),
    replayId: expect.any(String),
    includeReplayStartTimestamp: true,
    segmentId: 0,
  });

  // Add this to test that segment ID increases
  mockAddPerformanceEntries.mockImplementationOnce(async () => {
    return replay.createPerformanceSpans(
      createPerformanceEntries([
        {
          name: 'https://sentry.io/foo.js',
          entryType: 'resource',
          startTime: 176.59999990463257,
          duration: 5.600000023841858,
          initiatorType: 'link',
          nextHopProtocol: 'h2',
          workerStart: 177.5,
          redirectStart: 0,
          redirectEnd: 0,
          fetchStart: 177.69999992847443,
          domainLookupStart: 177.69999992847443,
          domainLookupEnd: 177.69999992847443,
          connectStart: 177.69999992847443,
          connectEnd: 177.69999992847443,
          secureConnectionStart: 177.69999992847443,
          requestStart: 177.5,
          responseStart: 181,
          responseEnd: 182.19999992847443,
          transferSize: 0,
          encodedBodySize: 0,
          decodedBodySize: 0,
          serverTiming: [],
        } as unknown as PerformanceResourceTiming,
      ])
    );
  });
  // flush #5 @ t=25s - debounced flush calls `flush`
  // 20s + `flushMinDelay` which is 5 seconds
  await advanceTimers(5000);
  expect(replay.flush).toHaveBeenCalledTimes(5);
  expect(replay.runFlush).toHaveBeenCalledTimes(2);
  expect(mockSendReplay).toHaveBeenLastCalledWith({
    events: expect.any(String),
    replayId: expect.any(String),
    includeReplayStartTimestamp: false,
    segmentId: 1,
  });

  // Make sure there's no other calls
  vi.runAllTimers();
  await new Promise(process.nextTick);
  expect(mockSendReplay).toHaveBeenCalledTimes(2);
});
