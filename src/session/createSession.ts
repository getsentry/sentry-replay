import * as Sentry from '@sentry/browser';

import { logger } from '@/util/logger';
import { saveSession } from './saveSession';
import type { ReplaySession } from './types';
import { REPLAY_EVENT_NAME, ROOT_REPLAY_NAME } from './constants';
import { dateTimestampInSeconds, uuid4 } from '@sentry/utils';
import { captureEvent } from '@sentry/browser';
import { createEvent } from '@/util/createEvent';
import { sendEvent } from '@/util/sendEvent';
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


  const session = {
    id: uuid4()
    traceId: uuid4(),
    spanId: uuid4().substring(16),
    started: currentDate,
    lastActivity: currentDate,
  };

  const replayEvent = createEvent(session.id,ROOT_REPLAY_NAME,session.traceId,session.spanId, {
    isReplayRoot:'yes'
  },[])
  sendEvent(replayEvent)
  logger.log(`Creating new session: ${session.id}`);

  if (stickySession) {
    saveSession(session);
  }

  return session;
}
