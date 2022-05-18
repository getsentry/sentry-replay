import * as Sentry from '@sentry/browser';

import { logger } from '@/util/logger';
import { saveSession } from './saveSession';
import type { ReplaySession } from './types';
import { REPLAY_EVENT_NAME, ROOT_REPLAY_NAME } from './constants';
import { dateTimestampInSeconds, uuid4 } from '@sentry/utils';
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
export async function createSession({
  stickySession = false,
}: CreateSessionParams): ReplaySession {
  const currentDate = new Date().getTime();

  const session = {
    traceId: uuid4(),
    spanId: uuid4().substring(16),
    started: currentDate,
    lastActivity: currentDate,
  };

  const replayEvent = {
    type: 'transaction',
    transaction: ROOT_REPLAY_NAME,
    spans: [],
    breadcrumbs: [],
    timestamp: dateTimestampInSeconds() + 1,
    start_timestamp: dateTimestampInSeconds(),
    contexts: {
      trace: {
        trace_id: session.traceId,
        span_id: session.spanId,
        tags: {
          isReplayRoot: 'yes',
        },
      },
    },
  };

  const rd = await captureEvent(replayEvent);
  logger.log(`Creating new session: ${rd}`);
  session.id = rd;

  if (stickySession) {
    saveSession(session);
  }

  return session;
}
