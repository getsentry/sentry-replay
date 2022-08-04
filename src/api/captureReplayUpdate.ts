import { captureEvent } from '@sentry/core';

import { REPLAY_EVENT_NAME } from '@/session/constants';
import type { Session } from '@/session/Session';

interface CaptureReplayUpdateParams {
  session: Session;
  /**
   * Timestamp of the event in milliseconds
   */
  timestamp: number;
  errorIds: string[];
}
export function captureReplayUpdate({
  session,
  timestamp,
  errorIds,
}: CaptureReplayUpdateParams) {
  captureEvent({
    // @ts-expect-error replay_event is a new event type
    type: REPLAY_EVENT_NAME,
    replay_start_timestamp: timestamp / 1000,
    error_ids: errorIds,
    replay_id: session.id,
    segment_id: ++session.segmentId,
  });
}
