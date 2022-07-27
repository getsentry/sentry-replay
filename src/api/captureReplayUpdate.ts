import { captureEvent } from '@sentry/browser';

import type { Session } from '@/session/Session';

export function captureReplayUpdate(session: Session, timestamp: number) {
  captureEvent({
    // @ts-expect-error replay_event is a new event type
    type: 'replay_event',
    timestamp,

    replay_id: session.id,
    sequence_id: ++session.sequenceId,

    // TODO: Is this still necessary?
    tags: {
      replayId: session.id,
    },
  });
}
