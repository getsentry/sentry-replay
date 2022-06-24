import { getCurrentHub } from '@sentry/browser';

import type { Session } from '@/session/Session';

export function captureReplay(session: Session) {
  const hub = getCurrentHub();

  hub.captureEvent(
    {
      // @ts-expect-error replay_event is a new event type
      type: 'replay_event',

      // message: ROOT_REPLAY_NAME, // Shouldn't be needed now
      replay_id: session.id,
      sequence_id: session.sequenceId, // TODO: Should this increment?
    },
    { event_id: session.id }
  );
}
