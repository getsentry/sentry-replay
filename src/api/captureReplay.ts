import { getCurrentHub } from '@sentry/core';

import type { Session } from '@/session/Session';
import { InitialState } from '@/types';

export function captureReplay(session: Session, initialState: InitialState) {
  const hub = getCurrentHub();

  hub.captureEvent(
    {
      // @ts-expect-error replay_event is a new event type
      type: 'replay_event',

      // message: ROOT_REPLAY_NAME, // Shouldn't be needed now
      replay_id: session.id,
      sequence_id: session.sequenceId, // TODO: Should this increment?
      tags: { url: initialState.url },
      timestamp: initialState.timestamp,
    },
    { event_id: session.id }
  );
}
