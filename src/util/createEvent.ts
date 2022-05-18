import { ReplaySpan, Tags } from '@/types';
import { Breadcrumb } from '@sentry/types';
import { dateTimestampInSeconds } from '@sentry/utils';

export function createEvent(
  id: string,
  name: string,
  traceId: string,
  spanId: string,
  tags: Tags,
  breadcrumbs: Breadcrumb[] = [],
  spans: ReplaySpan[] = []
) {
  const e = {
    request: {
      url: window.location.href,
    },
    event_id: id,
    type: 'transaction',
    transaction: name,
    spans: spans,
    breadcrumbs: breadcrumbs,
    timestamp: dateTimestampInSeconds() + 1,
    start_timestamp: dateTimestampInSeconds(),
    contexts: {
      trace: {
        trace_id: traceId,
        span_id: spanId,
        tags: { replayId: tags.replayId || id },
      },
    },
    tags: tags,
  };
  return e;
}
