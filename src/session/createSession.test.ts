import * as Sentry from '@sentry/core';
import * as SentryUtils from '@sentry/utils';
import { afterEach, beforeAll, expect, it, MockedFunction, vi } from 'vitest';

import { createSession } from './createSession';
import { saveSession } from './saveSession';

vi.mock('./saveSession');

vi.mock('@sentry/utils', async () => {
  const actual = (await vi.importActual('@sentry/utils')) as typeof SentryUtils;
  return {
    ...actual,
    logger: actual.logger,
    uuid4: vi.fn(() => 'test_session_id'),
  };
});

type captureEventMockType = MockedFunction<typeof Sentry.captureEvent>;

const captureEventMock: captureEventMockType = vi.fn();

vi.mock('@sentry/core', async () => {
  const actual = (await vi.importActual('@sentry/core')) as typeof Sentry;
  return {
    ...actual,
    getCurrentHub: vi.fn(() => ({
      captureEvent: captureEventMock,
    })),
  };
});

beforeAll(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  captureEventMock.mockReset();
});

it('creates a new session with no sticky sessions', function () {
  const newSession = createSession({ stickySession: false });
  expect(captureEventMock).not.toHaveBeenCalled();

  expect(saveSession).not.toHaveBeenCalled();

  expect(newSession.id).toBe('test_session_id');
  expect(newSession.started).toBeGreaterThan(0);
  expect(newSession.lastActivity).toEqual(newSession.started);
});

it('creates a new session with sticky sessions', function () {
  const newSession = createSession({ stickySession: true });
  expect(captureEventMock).not.toHaveBeenCalled();

  expect(saveSession).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'test_session_id',
      segmentId: 0,
      started: expect.any(Number),
      lastActivity: expect.any(Number),
    })
  );

  expect(newSession.id).toBe('test_session_id');
  expect(newSession.started).toBeGreaterThan(0);
  expect(newSession.lastActivity).toEqual(newSession.started);
});
