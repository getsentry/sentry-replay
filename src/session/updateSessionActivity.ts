import { createSession } from './createSession';
import { fetchSession } from './fetchSession';

export function updateSessionActivity({
  stickySession,
}: {
  stickySession: boolean;
}) {
  // Nothing to do if there are no sticky sessions
  if (!stickySession) {
    return;
  }

  const existingSession = fetchSession();

  // If user manually deleted from session storage, create a new session
  if (!existingSession) {
    // TBD: There was an issue here where sessions weren't saving and this
    // caused lots of transactions to be created
    createSession({ stickySession });
    return;
  }

  existingSession.lastActivity = new Date().getTime();
}
