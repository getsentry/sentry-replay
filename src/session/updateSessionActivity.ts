import { createSession } from './createSession';
import { fetchSession } from './fetchSession';
import { saveSession } from './saveSession';

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
    return createSession({ stickySession });
  }

  const newSession = {
    ...existingSession,
    lastActivity: new Date().getTime(),
  };

  saveSession(newSession);

  return newSession;
}
