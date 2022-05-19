import { logger } from '@/util/logger';
import { saveSession } from './saveSession';
import type { ReplaySession } from './types';
import { ROOT_REPLAY_NAME } from './constants';
import { captureEvent } from '@sentry/browser';

interface CreateSessionParams {
  /**
   * Should save to sessionStorage?
   */
  stickySession: boolean;
}

/**
 * Create a new session, which in its current implementation is a Sentry event
 * that all replays will be saved to as attachments. Currently, we only expect
 * one of these Sentry events per "replay session".
 */
export function createSession({
  stickySession = false,
}: CreateSessionParams): ReplaySession {
  const currentDate = new Date().getTime();
  const id = captureEvent({
    message: ROOT_REPLAY_NAME,
  });
  const session = {
    id: id,
    started: currentDate,
    lastActivity: currentDate,
  };

  // const replayEvent = createEvent(
  //   session.id,
  //   ROOT_REPLAY_NAME,
  //   session.traceId,
  //   session.spanId,
  //   {
  //     isReplayRoot: 'yes',
  //   },
  //   []
  // );
  // sendEvent(replayEvent);

  logger.log(`Creating new session: ${session.id}`);

  if (stickySession) {
    saveSession(session);
  }

  return session;
}
