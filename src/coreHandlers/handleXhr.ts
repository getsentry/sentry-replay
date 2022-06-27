import { ReplaySpan } from '@/types';
import { isIngestHost } from '@/util/isIngestHost';

export function handleXhr(handlerData: any): ReplaySpan {
  if (handlerData.startTimestamp) {
    handlerData.xhr.__sentry_xhr__.startTimestamp = handlerData.startTimestamp;
  }

  if (!handlerData.endTimestamp) {
    return null;
  }

  const [op, description] = handlerData.args;

  // Ignore requests to Sentry's backend
  if (isIngestHost(description)) {
    return null;
  }

  return {
    description,
    op,
    startTimestamp:
      handlerData.xhr.__sentry_xhr__.startTimestamp / 1000 ||
      handlerData.endTimestamp / 1000.0,
    endTimestamp: handlerData.endTimestamp / 1000.0,
    data: {
      statusCode: handlerData.response.status,
    },
  };
}
