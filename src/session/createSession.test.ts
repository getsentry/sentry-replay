import * as Sentry from '@sentry/core';
import * as SentryUtils from '@sentry/utils';
import { beforeAll, expect, it, MockedFunction, vi } from 'vitest';

import { createSession } from './createSession';
import { saveSession } from './saveSession';

type captureEventMockType = MockedFunction<typeof Sentry.captureEvent>;

vi.mock('./saveSession');

vi.mock('@sentry/utils', async () => {
  const actual = (await vi.importActual('@sentry/utils')) as typeof SentryUtils;
  return {
    ...actual,
    logger: actual.logger,
    uuid4: vi.fn(() => 'test_session_id'),
  };
});

type captureEventMockType = vi.MockedFunction<typeof Sentry.captureEvent>;

const captureEventMock: captureEventMockType = vi.fn();

beforeAll(() => {
  window.sessionStorage.clear();
  vi.spyOn(Sentry, 'getCurrentHub');
  (Sentry.getCurrentHub as vi.Mock).mockImplementation(() => ({
    captureEvent: captureEventMock,
  }));
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
