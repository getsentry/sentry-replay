import { captureEvent } from '@sentry/core';

import { REPLAY_EVENT_NAME } from '@/session/constants';
import type { Session } from '@/session/Session';
import { InitialState } from '@/types';

interface CaptureReplayParams {
  session: Session;
  initialState: InitialState;
}

export function captureReplay({ session, initialState }: CaptureReplayParams) {
  captureEvent(
    {
      // @ts-expect-error replay_event is a new event type
      type: REPLAY_EVENT_NAME,
      timestamp: initialState.timestamp / 1000,
      replay_id: session.id,
      segment_id: session.segmentId, // TODO: Should this increment?
      tags: { url: initialState.url },
    },
    { event_id: session.id }
  );
}
