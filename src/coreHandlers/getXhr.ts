import { ReplaySpan } from '@/types';

export function getXhr(handlerData: any): ReplaySpan {
  // TODO: add status code into data, etc.

  if (handlerData.startTimestamp) {
    handlerData.xhr.__sentry_xhr__.startTimestamp = handlerData.startTimestamp;
  }

  if (!handlerData.endTimestamp) {
    return null;
  }

  return {
    description: handlerData.args[1],
    op: handlerData.args[0],
    startTimestamp:
      handlerData.xhr.__sentry_xhr__.startTimestamp / 1000 ||
      handlerData.endTimestamp / 1000.0,
    endTimestamp: handlerData.endTimestamp / 1000.0,
  };
}
