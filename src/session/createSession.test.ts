import { it, expect, vi, beforeAll, MockedFunction } from 'vitest';

import * as Sentry from '@sentry/browser';
import * as SentryUtils from '@sentry/utils';

import { createSession } from './createSession';
import { saveSession } from './saveSession';

type captureEventMockType = MockedFunction<typeof Sentry.captureEvent>;

vi.mock('./saveSession');
vi.mock('@sentry/browser');

vi.mock('@sentry/utils', async () => {
  const actual = (await vi.importActual('@sentry/utils')) as typeof SentryUtils;
  return {
    ...actual,
    logger: actual.logger,
    uuid4: vi.fn(() => 'test_session_id'),
  };
});

beforeAll(() => {
  window.sessionStorage.clear();
});

it('creates a new session with no sticky sessions', function () {
  const newSession = createSession({ stickySession: false });
  expect(Sentry.getCurrentHub().captureEvent).toHaveBeenCalledWith(
    { message: 'sentry-replay', tags: { sequenceId: 0 } },
    { event_id: 'test_session_id' }
  );

  expect(saveSession).not.toHaveBeenCalled();

  expect(newSession.id).toBe('test_session_id');
  expect(newSession.started).toBeGreaterThan(0);
  expect(newSession.lastActivity).toEqual(newSession.started);

  const captureEventMock = Sentry.getCurrentHub()
    .captureEvent as captureEventMockType;
  captureEventMock.mockReset();
});

it('creates a new session with sticky sessions', function () {
  const newSession = createSession({ stickySession: true });
  expect(Sentry.getCurrentHub().captureEvent).toHaveBeenCalledWith(
    { message: 'sentry-replay', tags: { sequenceId: 0 } },
    { event_id: 'test_session_id' }
  );

  expect(saveSession).toHaveBeenCalledWith({
    id: 'test_session_id',
    sequenceId: 0,
    started: expect.any(Number),
    lastActivity: expect.any(Number),
  });

  expect(newSession.id).toBe('test_session_id');
  expect(newSession.started).toBeGreaterThan(0);
  expect(newSession.lastActivity).toEqual(newSession.started);
  const captureMock = Sentry.getCurrentHub()
    .captureEvent as captureEventMockType;

  captureMock.mockReset();
});
