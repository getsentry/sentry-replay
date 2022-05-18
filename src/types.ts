import { Breadcrumb } from '@sentry/types';
import type { eventWithTime } from 'rrweb/typings/types';

export type RRWebEvent = eventWithTime;

export interface ReplaySpan {
  data: {
    size: number;
  };
  description: string;
  op: string;
  parent_span_id: string;
  span_id: string;
  trace_id: string;
  start_timestamp: number;
  timestamp: number;
  // trace_id: 'c0056b1e75834053a40a79e261dc39bc',
}

export interface Tags {
  [key: string]: string;
}
export interface ReplayEvent {
  request: {
    url: string;
  };
  event_id: string;
  type: string;
  transaction: string;
  spans: ReplaySpan[];
  breadcrumbs: Breadcrumb[];
  timestamp: number;
  start_timestamp: number;
  contexts: {
    trace: {
      trace_id: string;
      span_id: string;
      tags: { replayId: string };
    };
  };
  tags: Tags;
}
