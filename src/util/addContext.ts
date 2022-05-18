import { ReplayEvent } from '@/types';
import { Scope } from '@sentry/types';

export function _addContext(replayEvent: ReplayEvent, scope: Scope) {
  // @ts-expect-error private access
  if (scope._extra && Object.keys(scope._extra).length) {
    // @ts-expect-error private access
    replayEvent.extra = { ...scope._extra, ...replayEvent.extra };
  }
  // @ts-expect-error private access
  if (scope._tags && Object.keys(scope._tags).length) {
    // @ts-expect-error private access
    replayEvent.tags = { ...scope._tags, ...replayEvent.tags };
  }
  // @ts-expect-error private access
  if (scope._user && Object.keys(scope._user).length) {
    // @ts-expect-error private access
    replayEvent.user = { ...scope._user, ...replayEvent.user };
  }
  // @ts-expect-error private access

  if (scope._contexts && Object.keys(scope._contexts).length) {
    replayEvent.contexts = { ...this._contexts, ...replayEvent.contexts };
  }
}
