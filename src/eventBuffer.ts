import { ReplaySpan, RRWebEvent } from './types';
import { logger } from './util/logger';
import { SentryReplay } from './index.js';
import workerString from './worker/worker.js';
import { Breadcrumb } from '@sentry/types';

export function createEventBuffer() {
  if (window.Worker) {
    logger.log('using compression worker');
    return new EventBufferCompressionWorker();
  }
  logger.log('falling back to simple event buffer');
  return new EventBufferArray();
}

export class EventBufferArray {
  events: RRWebEvent[];
  replaySpans: ReplaySpan[];
  breadcrumbs: Breadcrumb[];

  constructor() {
    this.events = [];
    this.replaySpans = [];
    this.breadcrumbs = [];
  }

  addEvent(event: RRWebEvent) {
    this.events.push(event);
  }
  addBreadcrumb(breadcrumb: Breadcrumb) {
    this.breadcrumbs.push(breadcrumb);
  }
  addReplaySpan(replaySpan: ReplaySpan) {
    this.replaySpans.push(replaySpan);
  }

  finish() {
    return new Promise<string>((resolve, reject) => {
      const eventsRet = this.events;
      this.events = [];
      this.replaySpans = [];
      this.breadcrumbs = [];
      resolve(JSON.stringify(eventsRet));
    });
  }
}

// TODO: better handling if there's no Worker api available
export class EventBufferCompressionWorker {
  sentryReplay: SentryReplay;
  worker: Worker;
  constructor() {
    const workerBlob = new Blob([workerString]);
    const workerUrl = URL.createObjectURL(workerBlob);
    this.worker = new Worker(workerUrl);
    logger.log(this.worker);
  }

  init() {
    this.worker.postMessage({ method: 'init', args: [] });
    logger.log('Message posted to worker');
  }

  addEvent(data: RRWebEvent) {
    this.worker.postMessage({
      method: 'addEvent',
      args: [JSON.stringify(data)],
    });
    logger.log('Message posted to worker');
  }
  addReplaySpan(data: ReplaySpan) {
    this.worker.postMessage({
      method: 'addReplaySpan',
      args: [JSON.stringify(data)],
    });
    logger.log('Message posted to worker');
  }
  addBreadcrumb(data: Breadcrumb) {
    this.worker.postMessage({
      method: 'addBreadcrumb',
      args: [JSON.stringify(data)],
    });
    logger.log('Message posted to worker');
  }

  finish() {
    return new Promise<Uint8Array>((resolve, reject) => {
      this.worker.postMessage({ method: 'finish', args: [] });
      logger.log('Message posted to worker');
      this.worker.onmessage = function finishListener(e) {
        logger.log('Message received from worker');
        if (e.data.final) {
          logger.log('sending compressed');
          const final = e.data.final as Uint8Array;
          resolve(final);
          this.removeEventListener('onmessage', finishListener);
        }
      };
    });
  }
}
