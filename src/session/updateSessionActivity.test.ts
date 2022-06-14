import { it, expect, beforeAll, afterEach, vi, MockedFunction } from 'vitest';

import * as CreateSession from './createSession';
import * as FetchSession from './fetchSession';
import * as SaveSession from './saveSession';
import { updateSessionActivity } from './updateSessionActivity';

vi.spyOn(CreateSession, 'createSession');
vi.spyOn(FetchSession, 'fetchSession');
vi.spyOn(SaveSession, 'saveSession');

const mockCreateSession = CreateSession.createSession as MockedFunction<
  typeof CreateSession.createSession
>;
const mockFetchSession = FetchSession.fetchSession as MockedFunction<
  typeof FetchSession.fetchSession
>;
const mockSaveSession = SaveSession.saveSession as MockedFunction<
  typeof SaveSession.saveSession
>;

beforeAll(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
  mockCreateSession.mockClear();
  mockFetchSession.mockClear();
  mockSaveSession.mockClear();
});

it('does nothing if no sticky session', () => {
  updateSessionActivity({ stickySession: false });

  expect(mockFetchSession).not.toHaveBeenCalled();
  expect(mockCreateSession).not.toHaveBeenCalled();
  expect(mockSaveSession).not.toHaveBeenCalled();
});

it('creates a new session if no existing one', () => {
  updateSessionActivity({ stickySession: true });

  expect(mockFetchSession).toHaveBeenCalled();
  expect(mockCreateSession).toHaveBeenCalled();
  expect(mockSaveSession).toHaveBeenCalled();
});

it('updates an existing session', () => {
  const now = new Date().getTime();
  const lastActivity = now - 10000;

  mockSaveSession({
    id: 'transaction_id',
    lastActivity,
    started: lastActivity,
    sequenceId: 0,
  });
  // Clear mock because it will get called again
  mockSaveSession.mockClear();

  updateSessionActivity({ stickySession: true });

  expect(mockFetchSession).toHaveBeenCalled();
  expect(mockCreateSession).not.toHaveBeenCalled();
  expect(mockSaveSession.mock.calls[0][0].lastActivity).toBeGreaterThan(
    lastActivity
  );
});
