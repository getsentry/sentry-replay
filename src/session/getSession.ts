import { isSessionExpired } from '@/util/isSessionExpired';
import { logger } from '@/util/logger';
import { createSession } from './createSession';
import { fetchSession } from './fetchSession';
import { Session } from './Session';

interface GetSessionParams {
  /**
   * The length of time (in ms) which we will consider the session to be expired.
   */
  expiry: number;
  /**
   * Should save session to sessionStorage?
   */
  stickySession: boolean;

  /**
   * The current session (e.g. if stickySession is off)
   */
  currentSession?: Session;
}

/**
 * Get or create a session
 */
export function getSession({
  expiry,
  currentSession,
  stickySession,
}: GetSessionParams) {
  const session = stickySession ? fetchSession() : currentSession;

  if (session) {
    // If there is a session, check if it is valid (e.g. "last activity" time should be within the "session idle time")
    // TODO: We should probably set a max age on this as well
    const isExpired = isSessionExpired(session, expiry);

    if (!isExpired) {
      logger.log(`Using existing session: ${session.id}`);

      // we want to preserve the `isNew` option from currentSession, as all
      // sessions returned from `fetchSession()` will not be considered new.
      // however, it's possible that `getSession` is called multiple times
      // before a root replay is created, meaning we will end up having a
      // session where isNew is false and not having a root session created.
      if (currentSession) {
        session.options.isNew = currentSession.options.isNew;
      }
      return session;
    } else {
      logger.log(`Session has expired`);
    }
    // Otherwise continue to create a new session
  }

  const newSession = createSession({ stickySession });

  return newSession;
}
