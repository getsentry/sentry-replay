import { ReplayPerformanceEntry } from '@/createPerformanceEntry';

// From sentry-javascript
type XHRSendInput =
  | null
  | Blob
  | BufferSource
  | FormData
  | URLSearchParams
  | string;
interface SentryWrappedXMLHttpRequest extends XMLHttpRequest {
  [key: string]: any;
  __sentry_xhr__?: {
    method?: string;
    url?: string;
    status_code?: number;
    body?: XHRSendInput;
    startTimestamp?: number; // This is unique to replay SDK
  };
}

interface XhrHandlerData {
  args: [method: string, url: string];
  xhr: SentryWrappedXMLHttpRequest;
  startTimestamp: number;
  endTimestamp?: number;
}

export function handleXhr(handlerData: XhrHandlerData): ReplayPerformanceEntry {
  if (handlerData.xhr.__sentry_own_request__) {
    // Taken from sentry-javascript
    // Only capture non-sentry requests
    return;
  }

  if (handlerData.startTimestamp) {
    // TODO: See if this is still needed
    handlerData.xhr.__sentry_xhr__.startTimestamp = handlerData.startTimestamp;
  }

  if (!handlerData.endTimestamp) {
    return null;
  }

  const {
    method,
    url,
    status_code: statusCode,
  } = handlerData.xhr.__sentry_xhr__ || {};

  return {
    type: 'resource.xhr',
    name: url,
    start:
      handlerData.xhr.__sentry_xhr__.startTimestamp / 1000 ||
      handlerData.endTimestamp / 1000.0,
    end: handlerData.endTimestamp / 1000.0,
    data: {
      method,
      statusCode,
    },
  };
}
