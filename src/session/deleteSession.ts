import { REPLAY_SESSION_KEY } from './constants';

/**
 * Fetches a session from storage
 */
export function deleteSession(): void {
  const hasSessionStorage = 'sessionStorage' in window;

  if (!hasSessionStorage) {
    return;
  }

  window.sessionStorage.removeItem(REPLAY_SESSION_KEY);
}
