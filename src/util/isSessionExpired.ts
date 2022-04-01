import { ReplaySession } from '@/session';

/**
 * Checks to see if session is expired
 */
export function isSessionExpired(
  session: ReplaySession,
  expiry: number,
  targetTime = +new Date()
) {
  return session.lastActivity + expiry <= targetTime;
}
