import * as CreateSession from './createSession';
import * as FetchSession from './fetchSession';
import { getSession } from './getSession';
import { saveSession } from './saveSession';

jest.mock('@sentry/browser', () => {
  const startTransaction = jest.fn(() => ({
    finish: jest.fn(() => 'transaction_id'),
  }));
  const getCurrentHub = jest.fn(() => ({
    startTransaction,
  }));
  return {
    getCurrentHub,
  };
});

// jest.mock('./createSession');

beforeAll(() => {
  jest.spyOn(CreateSession, 'createSession');
  jest.spyOn(FetchSession, 'fetchSession');
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
  (CreateSession.createSession as jest.Mock).mockClear();
  (FetchSession.fetchSession as jest.Mock).mockClear();
});

it('creates a non-sticky session when one does not exist', function () {
  const session = getSession({ expiry: 900000, stickySession: false });

  expect(FetchSession.fetchSession).not.toHaveBeenCalled();
  expect(CreateSession.createSession).toHaveBeenCalled();

  expect(session).toEqual({
    id: 'transaction_id',
    isNew: true,
    lastActivity: expect.any(Number),
    started: expect.any(Number),
  });

  // Should not have anything in storage
  expect(FetchSession.fetchSession()).toBe(null);
});

it('creates a non-sticky session, regardless of session existing in sessionStorage', function () {
  saveSession({
    id: 'transaction_id',
    lastActivity: new Date().getTime() - 10000,
    started: new Date().getTime() - 10000,
  });

  const session = getSession({ expiry: 1000, stickySession: false });

  expect(FetchSession.fetchSession).not.toHaveBeenCalled();
  expect(CreateSession.createSession).toHaveBeenCalled();

  expect(session).toBeDefined();
});

it('creates a sticky session when one does not exist', function () {
  expect(FetchSession.fetchSession()).toBe(null);

  const session = getSession({ expiry: 900000, stickySession: true });

  expect(FetchSession.fetchSession).toHaveBeenCalled();
  expect(CreateSession.createSession).toHaveBeenCalled();

  expect(session).toEqual({
    id: 'transaction_id',
    isNew: true,
    lastActivity: expect.any(Number),
    started: expect.any(Number),
  });

  // Should not have anything in storage
  expect(FetchSession.fetchSession()).toEqual({
    id: 'transaction_id',
    lastActivity: expect.any(Number),
    started: expect.any(Number),
  });
});

it('creates a sticky session when one does not exist', function () {
  expect(FetchSession.fetchSession()).toBe(null);

  const session = getSession({ expiry: 900000, stickySession: true });

  expect(FetchSession.fetchSession).toHaveBeenCalled();
  expect(CreateSession.createSession).toHaveBeenCalled();

  expect(session).toEqual({
    id: 'transaction_id',
    isNew: true,
    lastActivity: expect.any(Number),
    started: expect.any(Number),
  });

  // Should not have anything in storage
  expect(FetchSession.fetchSession()).toEqual({
    id: 'transaction_id',
    lastActivity: expect.any(Number),
    started: expect.any(Number),
  });
});

it('fetches an existing sticky session', function () {
  const now = new Date().getTime();
  saveSession({
    id: 'transaction_id',
    lastActivity: now,
    started: now,
  });

  const session = getSession({ expiry: 1000, stickySession: true });

  expect(FetchSession.fetchSession).toHaveBeenCalled();
  expect(CreateSession.createSession).not.toHaveBeenCalled();

  expect(session).toEqual({
    id: 'transaction_id',
    lastActivity: now,
    started: now,
  });
});

it('fetches an expired sticky session', function () {
  const now = new Date().getTime();
  saveSession({
    id: 'transaction_id',
    lastActivity: now - 2000,
    started: now - 2000,
  });

  const session = getSession({ expiry: 1000, stickySession: true });

  expect(FetchSession.fetchSession).toHaveBeenCalled();
  expect(CreateSession.createSession).toHaveBeenCalled();

  expect(session).toEqual({
    id: 'transaction_id',
    isNew: true,
    lastActivity: now,
    started: now,
  });
});
