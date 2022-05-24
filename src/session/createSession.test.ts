import * as Sentry from '@sentry/browser';

import { createSession } from './createSession';
import { saveSession } from './saveSession';

type captureEventMockType = jest.MockedFunction<typeof Sentry.captureEvent>;

jest.mock('@sentry/browser', () => {
  const mockCaptureEvent = jest.fn();
  const mockGetCurrentHub = jest.fn(() => {
    return {
      captureEvent: mockCaptureEvent,
    };
  });
  return {
    getCurrentHub: mockGetCurrentHub,
  };
});
jest.mock('./saveSession');

jest.mock('@sentry/utils', () => {
  return {
    ...(jest.requireActual('@sentry/utils') as { string: unknown }),
    uuid4: jest.fn(() => 'test_session_id'),
  };
});

beforeAll(() => {
  window.sessionStorage.clear();
});

it('creates a new session with no sticky sessions', function () {
  const newSession = createSession({ stickySession: false });

  expect(Sentry.getCurrentHub().captureEvent).toHaveBeenCalledWith(
    { message: 'sentry-replay' },
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
    { message: 'sentry-replay' },
    { event_id: 'test_session_id' }
  );

  expect(saveSession).toHaveBeenCalledWith({
    id: 'test_session_id',
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
