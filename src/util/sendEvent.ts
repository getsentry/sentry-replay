import * as Sentry from '@sentry/browser';

export function sendEvent(replayEvent) {
  const hub = Sentry.getCurrentHub();
  const { scope, client } = hub.getStackTop();

  window.client = client;
  window.scope = scope;
  if (scope._extra && Object.keys(scope._extra).length) {
    replayEvent.extra = { ...scope._extra, ...replayEvent.extra };
  }
  if (scope._tags && Object.keys(scope._tags).length) {
    replayEvent.tags = { ...scope._tags, ...replayEvent.tags };
  }
  if (scope._user && Object.keys(scope._user).length) {
    replayEvent.user = { ...scope._user, ...replayEvent.user };
  }
  if (scope._contexts && Object.keys(scope._contexts).length) {
    replayEvent.contexts = { ...this._contexts, ...replayEvent.contexts };
  }
  console.log(replayEvent);

  // client._backend.sendEvent(replayEvent);
}
