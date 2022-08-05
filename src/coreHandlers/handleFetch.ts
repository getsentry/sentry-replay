import { ReplayPerformanceEntry } from '@/createPerformanceEntry';

interface FetchHandlerData {
  args: Parameters<typeof fetch>;
  fetchData: {
    method: string;
    url: string;
  };
  response: {
    type: string;
    url: string;
    redirected: boolean;
    status: number;
    ok: boolean;
  };
  startTimestamp: number;
  endTimestamp?: number;
}

export function handleFetch(
  handlerData: FetchHandlerData
): ReplayPerformanceEntry {
  if (!handlerData.endTimestamp) {
    return null;
  }

  const { startTimestamp, endTimestamp, fetchData, response } = handlerData;

  return {
    type: 'resource.fetch',
    start: startTimestamp / 1000,
    end: endTimestamp / 1000,
    name: fetchData.url,
    data: {
      method: fetchData.method,
      statusCode: response.status,
    },
  };
}
