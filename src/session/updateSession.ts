import { saveSession } from './saveSession';
import { ReplaySession } from './types';

export function updateSession(
  session: ReplaySession,
  { stickySession }: { stickySession: boolean }
) {
  // TBD: Use session from localStorage? e.g. if you delete session from
  // localStorage manually, we could end up in a bad state as it'll rewrite
  // with session in memory
  const newSession = {
    ...session,
    lastActivity: new Date().getTime(),
  };

  if (stickySession) {
    saveSession(newSession);
  }

  return newSession;
}
