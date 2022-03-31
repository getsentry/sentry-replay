import { REPLAY_SESSION_KEY } from './constants';
import { ReplaySession } from './types';

export function saveSession(session: ReplaySession) {
  const hasLocalStorage = 'localStorage' in window;
  if (!hasLocalStorage) {
    return;
  }

  try {
    window.localStorage.setItem(REPLAY_SESSION_KEY, JSON.stringify(session));
  } catch {
    // this shouldn't happen
  }
}
