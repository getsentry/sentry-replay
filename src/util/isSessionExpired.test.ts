import { isSessionExpired } from './isSessionExpired';

it('session last activity is older than expiry time', function () {
  expect(
    isSessionExpired(
      { id: 'id', traceId: 'trace', started: 0, lastActivity: 0 },
      100,
      200
    )
  ).toBe(true); // Session expired at ts = 100
});

it('session last activity is not older than expiry time', function () {
  expect(
    isSessionExpired(
      { id: 'id', traceId: 'trace', started: 0, lastActivity: 100 },
      150,
      200
    )
  ).toBe(false); // Session expires at ts >= 250
});

it('session is expired when last activity reaches exactly the expiry time', function () {
  expect(
    isSessionExpired(
      { id: 'id', traceId: 'trace', started: 0, lastActivity: 100 },
      150,
      250
    )
  ).toBe(true); // Session expires at ts >= 250
});
