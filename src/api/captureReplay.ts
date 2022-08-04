import { captureEvent } from '@sentry/core';

import { REPLAY_EVENT_NAME } from '@/session/constants';
import type { Session } from '@/session/Session';
import { InitialState } from '@/types';

interface CaptureReplayParams {
  session: Session;
  initialState: InitialState;
  errorIds: string[];
}

export function captureReplay({
  session,
  initialState,
  errorIds,
}: CaptureReplayParams) {
  captureEvent(
    {
      // @ts-expect-error replay_event is a new event type
      type: REPLAY_EVENT_NAME,
      replay_start_timestamp: initialState.timestamp / 1000,
      error_ids: errorIds,
      replay_id: session.id,
      segment_id: session.segmentId, // TODO: Should this increment?
      tags: { url: initialState.url },
    },
    { event_id: session.id }
  );
}
