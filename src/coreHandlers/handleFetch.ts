import { ReplaySpan } from '@/types';

export function handleFetch(handlerData: any): ReplaySpan {
  if (!handlerData.endTimestamp) {
    return null;
  }

  return {
    description: handlerData.args[1],
    op: handlerData.args[0],
    statusCode: handlerData.response.status,
    startTimestamp: handlerData.startTimestamp / 1000,
    endTimestamp: handlerData.endTimestamp / 1000,
  };
}
