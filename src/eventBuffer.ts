import { ReplaySpan, RRWebEvent } from './types';
import { logger } from './util/logger';
import workerString from './worker/worker.js';
import { Breadcrumb } from '@sentry/types';
declare global {
  interface Window {
    __SENTRY_USE_ARRAY_BUFFER: boolean;
  }
}

export function createEventBuffer() {
  if (window.Worker && !window.__SENTRY_USE_ARRAY_BUFFER) {
    logger.log('using compression worker');
    return new EventBufferCompressionWorker();
  }
  logger.log('falling back to simple event buffer');
  return new EventBufferArray();
}

export class EventBufferArray {
  events: RRWebEvent[];

  constructor() {
    this.events = [];
  }

  get length() {
    return this.events.length;
  }

  addEvent(event: RRWebEvent) {
    this.events.push(event);
  }

  finish() {
    return new Promise<string>((resolve) => {
      const eventsRet = this.events;
      this.events = [];
      resolve(JSON.stringify(eventsRet));
    });
  }
}

export class EventBufferCompressionWorker {
  private worker: Worker;
  private eventBufferItemLength = 0;
  constructor() {
    const workerBlob = new Blob([workerString]);
    const workerUrl = URL.createObjectURL(workerBlob);

    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(workerUrl);
    } else {
      throw new Error('Web worker is not available in browser');
    }
  }

  init() {
    this.worker.postMessage({ method: 'init', args: [] });
    logger.log('Message posted to worker');
  }

  get length() {
    return this.eventBufferItemLength;
  }

  addEvent(data: RRWebEvent) {
    this.worker.postMessage({
      method: 'addEvent',
      args: [data],
    });
    logger.log('Message posted to worker');
    this.eventBufferItemLength++;
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
