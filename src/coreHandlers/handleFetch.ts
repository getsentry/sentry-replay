import { ReplaySpan } from '@/types';
import { isIngestHost } from '@/util/isIngestHost';

export function handleFetch(handlerData: any): ReplaySpan {
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
    startTimestamp: handlerData.startTimestamp / 1000,
    endTimestamp: handlerData.endTimestamp / 1000,
    data: {
      statusCode: handlerData.response.status,
    },
  };
}
