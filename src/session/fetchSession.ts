import { REPLAY_SESSION_KEY } from './constants';
import { Session } from './Session';

export function fetchSession(): Session | null {
  const hasSessionStorage = 'sessionStorage' in window;

  if (!hasSessionStorage) {
    return null;
  }

  try {
    return new Session(
      JSON.parse(window.sessionStorage.getItem(REPLAY_SESSION_KEY)),
      { stickySession: true }
    );
  } catch {
    return null;
  }
}
