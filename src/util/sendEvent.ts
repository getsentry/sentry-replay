import { ReplayEvent } from '@/types';
import * as Sentry from '@sentry/browser';
import { Scope } from '@sentry/types';
import { _addContext } from './addContext';

export function sendEvent(replayEvent: ReplayEvent) {
  const hub = Sentry.getCurrentHub();
  const { scope, client } = hub.getStackTop();
  _addContext(replayEvent, scope);
  // @ts-expect-error using private normalize method
  const normalized = client._normalizeEvent(replayEvent, 3);
  // @ts-expect-error using private backend method
  console.log(normalized);
  client._backend.sendEvent(normalized);
}
