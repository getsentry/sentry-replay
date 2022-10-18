import { expect, it } from 'vitest';

import { Session } from '../session/Session';

import { isSessionExpired } from './isSessionExpired';

function createSession(extra?: Record<string, any>) {
  return new Session({
    started: 0,
    lastActivity: 0,
    segmentId: 0,
    ...extra,
  });
}

it('session last activity is older than expiry time', function () {
  expect(isSessionExpired(createSession(), 100, 200)).toBe(true); // Session expired at ts = 100
});

it('session last activity is not older than expiry time', function () {
  expect(isSessionExpired(createSession({ lastActivity: 100 }), 150, 200)).toBe(
    false
  ); // Session expires at ts >= 250
});
