import { captureEvent } from '@sentry/core';

import { REPLAY_EVENT_NAME } from '@/session/constants';
import type { Session } from '@/session/Session';

export function captureReplayUpdate(session: Session, timestamp: number) {
  captureEvent({
    // @ts-expect-error replay_event is a new event type
    type: REPLAY_EVENT_NAME,
    timestamp,
    replay_id: session.id,
    segment_id: ++session.segmentId,
  });
}
