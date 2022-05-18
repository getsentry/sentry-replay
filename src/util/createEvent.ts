import { dateTimestampInSeconds, uuid4 } from '@sentry/utils';

export function createEvent(id, name, traceId, spanId, tags, breadcrumbs = []) {
  const e = {
    request: {
      url: window.location.href,
    },
    event_id: id,
    type: 'transaction',
    transaction: name,
    spans: [],
    breadcrumbs: breadcrumbs,
    timestamp: dateTimestampInSeconds() + 1,
    start_timestamp: dateTimestampInSeconds(),
    contexts: {
      trace: {
        trace_id: traceId,
        span_id: spanId,
        tags: tags,
      },
    },
  };
  return e;
}
