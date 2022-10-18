import { afterEach, beforeAll, expect, it } from 'vitest';

import { REPLAY_SESSION_KEY } from './constants';
import { saveSession } from './saveSession';
import { Session } from './Session';

beforeAll(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
});

it('saves a valid session', function () {
  const session = new Session({
    id: 'fd09adfc4117477abc8de643e5a5798a',
    segmentId: 0,
    started: 1648827162630,
    lastActivity: 1648827162658,
  });
  saveSession(session);

  expect(window.sessionStorage.getItem(REPLAY_SESSION_KEY)).toEqual(
    JSON.stringify(session)
  );
});
