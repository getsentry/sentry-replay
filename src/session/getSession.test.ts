import { it, expect, vi, beforeAll, afterEach } from 'vitest';

import * as CreateSession from './createSession';
import * as FetchSession from './fetchSession';
import { getSession } from './getSession';
import { saveSession } from './saveSession';

vi.mock('@sentry/utils', () => {
  return {
    ...require('@sentry/utils'),
    uuid4: vi.fn(() => 'test_session_id'),
  };
});

function createMockSession(when: number = new Date().getTime()) {
  return {
    id: 'test_session_id',
    sequenceId: 0,
    lastActivity: when,
    started: when,
  };
}

beforeAll(() => {
  vi.spyOn(CreateSession, 'createSession');
  vi.spyOn(FetchSession, 'fetchSession');
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
  (CreateSession.createSession as vi.Mock).mockClear();
  (FetchSession.fetchSession as vi.Mock).mockClear();
});

it('creates a non-sticky session when one does not exist', function () {
  const session = getSession({ expiry: 900000, stickySession: false });

  expect(FetchSession.fetchSession).not.toHaveBeenCalled();
  expect(CreateSession.createSession).toHaveBeenCalled();

  expect(session).toEqual({
    id: 'test_session_id',
    sequenceId: 0,
    lastActivity: expect.any(Number),
    started: expect.any(Number),
  });

  // Should not have anything in storage
  expect(FetchSession.fetchSession()).toBe(null);
});

it('creates a non-sticky session, regardless of session existing in sessionStorage', function () {
  saveSession(createMockSession(new Date().getTime() - 10000));

  const session = getSession({ expiry: 1000, stickySession: false });

  expect(FetchSession.fetchSession).not.toHaveBeenCalled();
  expect(CreateSession.createSession).toHaveBeenCalled();

  expect(session).toBeDefined();
});

it('creates a non-sticky session, when one is expired', function () {
  const session = getSession({
    expiry: 1000,
    stickySession: false,
    currentSession: {
      id: 'old_session_id',
      lastActivity: new Date().getTime() - 1001,
      started: new Date().getTime() - 1001,
      sequenceId: 0,
    },
  });

  expect(FetchSession.fetchSession).not.toHaveBeenCalled();
  expect(CreateSession.createSession).toHaveBeenCalled();

  expect(session).toBeDefined();
  expect(session.id).not.toBe('old_session_id');
});

it('creates a sticky session when one does not exist', function () {
  expect(FetchSession.fetchSession()).toBe(null);

  const session = getSession({ expiry: 900000, stickySession: true });

  expect(FetchSession.fetchSession).toHaveBeenCalled();
  expect(CreateSession.createSession).toHaveBeenCalled();

  expect(session).toEqual({
    id: 'test_session_id',
    sequenceId: 0,
    lastActivity: expect.any(Number),
    started: expect.any(Number),
  });

  // Should not have anything in storage
  expect(FetchSession.fetchSession()).toEqual({
    id: 'test_session_id',
    sequenceId: 0,
    lastActivity: expect.any(Number),
    started: expect.any(Number),
  });
});

it('fetches an existing sticky session', function () {
  const now = new Date().getTime();
  saveSession(createMockSession(now));

  const session = getSession({ expiry: 1000, stickySession: true });

  expect(FetchSession.fetchSession).toHaveBeenCalled();
  expect(CreateSession.createSession).not.toHaveBeenCalled();

  expect(session).toEqual({
    id: 'test_session_id',
    sequenceId: 0,
    lastActivity: now,
    started: now,
  });
});

it('fetches an expired sticky session', function () {
  const now = new Date().getTime();
  saveSession(createMockSession(new Date().getTime() - 2000));

  const session = getSession({ expiry: 1000, stickySession: true });

  expect(FetchSession.fetchSession).toHaveBeenCalled();
  expect(CreateSession.createSession).toHaveBeenCalled();

  expect(session.id).toBe('test_session_id');
  expect(session.lastActivity).toBeGreaterThanOrEqual(now);
  expect(session.started).toBeGreaterThanOrEqual(now);
  expect(session.sequenceId).toBe(0);
});

it('fetches a non-expired non-sticky session', function () {
  const session = getSession({
    expiry: 1000,
    stickySession: false,
    currentSession: {
      id: 'test_session_id_2',
      lastActivity: +new Date() - 500,
      started: +new Date() - 500,
      sequenceId: 0,
    },
  });

  expect(FetchSession.fetchSession).not.toHaveBeenCalled();
  expect(CreateSession.createSession).not.toHaveBeenCalled();

  expect(session.id).toBe('test_session_id_2');
  expect(session.sequenceId).toBe(0);
});
