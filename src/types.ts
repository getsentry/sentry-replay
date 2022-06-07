import { Breadcrumb } from '@sentry/types';
import type { eventWithTime } from 'rrweb/typings/types';

import { record } from 'rrweb';

export type RRWebEvent = eventWithTime;
export type RRWebOptions = Parameters<typeof record>[0];

export interface ReplaySpan {
  description: string;
  op: string;
  startTimestamp: number;
  endTimestamp: number;
  data?: Record<string, unknown>;
}

export interface ReplayRequest {
  endpoint: string;
  events: Uint8Array | string;
}

export type InstrumentationType = 'scope' | 'dom' | 'fetch' | 'xhr';

/**
 * The request payload to worker
 */
export interface WorkerRequest {
  method: string;
  args: any[];
}

/**
 * The response from the worker
 */
export interface WorkerResponse {
  method: string;
  success: boolean;
  response: string | Uint8Array;
}
