import { logger } from '@/util/logger';
import { REPLAY_SESSION_KEY } from './constants';
import { createSession } from './createSession';
import type { ReplaySession } from './types';

interface GetSessionParams {
  /**
   * The length of time (in ms) which we will consider the session to be expired.
   */
  expiry: number;
  /**
   * Should stickySession to localStorage?
   */
  stickySession: boolean;
}

export function getSession({ expiry, stickySession }: GetSessionParams) {
  const hasLocalStorage = 'localStorage' in window;

  const session =
    stickySession &&
    hasLocalStorage &&
    window.localStorage.getItem(REPLAY_SESSION_KEY);

  if (session) {
    // If there is a session, check if it is valid (e.g. "last activity" time should be within the "session idle time")
    try {
      const sessionObj: ReplaySession = JSON.parse(session);
      const isActive = sessionObj.lastActivity + expiry >= new Date().getTime();
      // TODO: We should probably set a max age on this as well
      if (isActive) {
        logger.log(`Using existing session: ${sessionObj.id}`);
        return sessionObj;
      } else {
        logger.log(`Session has expired`);
      }

      // Otherwise continue to create a new session
    } catch {
      // Invalid session in local storage, ignore and create new session
    }
  }

  const newSession = createSession({ stickySession });

  return newSession;
}
