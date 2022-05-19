import { Breadcrumb } from '@sentry/types';
import type { eventWithTime } from 'rrweb/typings/types';

export type RRWebEvent = eventWithTime;

export interface ReplaySpan {
  description: string;
  op: string;
  startTimestamp: number;
  endTimestamp: number;
  data?: Record<string, unknown>;
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
