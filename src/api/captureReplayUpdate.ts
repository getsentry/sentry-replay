import { captureEvent } from '@sentry/browser';

import type { Session } from '@/session/Session';

export function captureReplayUpdate(session: Session) {
  captureEvent({
    // @ts-expect-error replay_event is a new event type
    type: 'replay_event',

    // message: `${REPLAY_EVENT_NAME}-${uuid4().substring(16)}`, // We shouldn't need this anymore as we can query for type
    replay_id: session.id,
    sequence_id: ++session.sequenceId,

    // TODO: Is this still necessary?
    tags: {
      replayId: session.id,
    },
  });
}
