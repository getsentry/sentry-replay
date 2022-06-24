import * as Sentry from '@sentry/browser';
import { createSession } from './createSession';
import { saveSession } from './saveSession';

type captureEventMockType = jest.MockedFunction<typeof Sentry.captureEvent>;

jest.mock('./saveSession');
jest.mock('@sentry/browser');

jest.mock('@sentry/utils', () => {
  return {
    ...(jest.requireActual('@sentry/utils') as { string: unknown }),
    uuid4: jest.fn(() => 'test_session_id'),
  };
});

beforeAll(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  (Sentry.getCurrentHub().captureEvent as captureEventMockType).mockReset();
});

it('creates a new session with no sticky sessions', function () {
  const newSession = createSession({ stickySession: false });
  expect(Sentry.getCurrentHub().captureEvent).toHaveBeenCalledWith(
    { replay_id: 'test_session_id', sequence_id: 0, type: 'replay_event' },
    { event_id: 'test_session_id' }
  );

  expect(saveSession).not.toHaveBeenCalled();

  expect(newSession.id).toBe('test_session_id');
  expect(newSession.started).toBeGreaterThan(0);
  expect(newSession.lastActivity).toEqual(newSession.started);
});

it('creates a new session with sticky sessions', function () {
  const newSession = createSession({ stickySession: true });
  expect(Sentry.getCurrentHub().captureEvent).toHaveBeenCalledWith(
    { replay_id: 'test_session_id', sequence_id: 0, type: 'replay_event' },
    { event_id: 'test_session_id' }
  );

  expect(saveSession).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'test_session_id',
      sequenceId: 0,
      started: expect.any(Number),
      lastActivity: expect.any(Number),
    })
  );

  expect(newSession.id).toBe('test_session_id');
  expect(newSession.started).toBeGreaterThan(0);
  expect(newSession.lastActivity).toEqual(newSession.started);
});
