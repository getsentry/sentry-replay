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
