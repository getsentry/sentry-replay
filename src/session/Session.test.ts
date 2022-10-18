vi.mock('./saveSession');

import * as Sentry from '@sentry/browser';
import { afterEach, beforeEach, expect, it, MockedFunction, vi } from 'vitest';

import { saveSession } from './saveSession';
import { Session } from './Session';

type captureEventMockType = MockedFunction<typeof Sentry.captureEvent>;

vi.mock('@sentry/browser');

vi.mock('@sentry/utils', async () => {
  return {
    ...((await vi.importActual('@sentry/utils')) as { string: unknown }),
    uuid4: vi.fn(() => 'test_session_id'),
  };
});

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  (Sentry.getCurrentHub().captureEvent as captureEventMockType).mockReset();
});

it('non-sticky Session does not save to local storage', function () {
  const newSession = new Session(undefined, { stickySession: false });

  expect(saveSession).not.toHaveBeenCalled();
  expect(newSession.id).toBe('test_session_id');
  expect(newSession.segmentId).toBe(0);

  newSession.segmentId++;
  expect(saveSession).not.toHaveBeenCalled();
  expect(newSession.segmentId).toBe(1);
});

it('sticky Session saves to local storage', function () {
  const newSession = new Session(undefined, { stickySession: true });

  expect(saveSession).toHaveBeenCalledTimes(0);
  expect(newSession.id).toBe('test_session_id');
  expect(newSession.segmentId).toBe(0);

  (saveSession as vi.Mock).mockClear();

  newSession.segmentId++;
  expect(saveSession).toHaveBeenCalledTimes(1);
  expect(saveSession).toHaveBeenCalledWith(
    expect.objectContaining({
      segmentId: 1,
    })
  );
  expect(newSession.segmentId).toBe(1);
});
