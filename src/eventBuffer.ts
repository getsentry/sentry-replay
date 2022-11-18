import { captureException } from '@sentry/core';

import { logger } from './util/logger';
import workerString from './worker/worker.js';
import { RecordingEvent, WorkerRequest, WorkerResponse } from './types';

interface CreateEventBufferParams {
  useCompression: boolean;
}

export function createEventBuffer({ useCompression }: CreateEventBufferParams) {
  if (useCompression && window.Worker) {
    const workerBlob = new Blob([workerString]);
    const workerUrl = URL.createObjectURL(workerBlob);

    try {
      logger.log('Using compression worker');
      const worker = new Worker(workerUrl);
      if (worker) {
        return new EventBufferCompressionWorker(worker);
      } else {
        captureException(new Error('Unable to create compression worker'));
      }
    } catch {
      // catch and ignore, fallback to simple event buffer
    }
    logger.log('Falling back to simple event buffer');
  }

  logger.log('Using simple buffer');
  return new EventBufferArray();
}

export interface IEventBuffer {
  readonly length: number;
  destroy(): void;
  addEvent(event: RecordingEvent, isCheckout?: boolean): void;
  finish(): Promise<string | Uint8Array>;
}

class EventBufferArray implements IEventBuffer {
  events: RecordingEvent[];

  constructor() {
    this.events = [];
  }

  destroy() {
    this.events = [];
  }

  get length() {
    return this.events.length;
  }

  addEvent(event: RecordingEvent, isCheckout?: boolean) {
    if (isCheckout) {
      this.events = [event];
      return;
    }

    this.events.push(event);
  }

  finish() {
    return new Promise<string>((resolve) => {
      // Make a copy of the events array reference and immediately clear the
      // events member so that we do not lose new events while uploading
      // attachment.
      const eventsRet = this.events;
      this.events = [];
      resolve(JSON.stringify(eventsRet));
    });
  }
}

// exporting for testing
export class EventBufferCompressionWorker implements IEventBuffer {
  private worker: null | Worker;
  private eventBufferItemLength = 0;
  private _id = 0;

  constructor(worker: Worker) {
    this.worker = worker;
  }

  /**
   * Read-only incrementing counter
   */
  get id() {
    return this._id++;
  }

  /**
   * Post message to worker and wait for response before resolving promise.
   */
  postMessage({
    id,
    method,
    args,
  }: WorkerRequest): Promise<WorkerResponse['response']> {
    return new Promise((resolve, reject) => {
      const listener = ({ data }: MessageEvent) => {
        if (data.method !== method) {
          return;
        }

        // There can be multiple listeners for a single method, the id ensures
        // that the response matches the caller.
        if (data.id !== id) {
          return;
        }

        // At this point, we'll always want to remove listener regardless of result status
        this.worker?.removeEventListener('message', listener);

        if (!data.success) {
          // TODO: Do some error handling, not sure what
          logger.error(data.response);

          reject(new Error('Error in compression worker'));
          return;
        }

        resolve(data.response);
      };

      let stringifiedArgs;
      try {
        stringifiedArgs = JSON.stringify(args);
      } catch (err) {
        console.error(err);
        stringifiedArgs = '[]';
      }

      // Note: we can't use `once` option because it's possible it needs to
      // listen to multiple messages
      this.worker?.addEventListener('message', listener);
      this.worker?.postMessage({ id, method, args: stringifiedArgs });
    });
  }

  init() {
    this.postMessage({ id: this.id, method: 'init', args: [] });
    logger.log('Initialized compression worker');
  }

  destroy() {
    logger.log('Destroying compression worker');
    this.worker?.terminate();
    this.worker = null;
  }

  /**
   * Note that this may not reflect what is actually in the event buffer. This
   * is only a local count of the buffer size since `addEvent` is async.
   */
  get length() {
    return this.eventBufferItemLength;
  }

  async addEvent(event: RecordingEvent, isCheckout?: boolean) {
    if (isCheckout) {
      // This event is a checkout, make sure worker buffer is cleared before
      // proceeding.
      await this.postMessage({
        id: this.id,
        method: 'init',
        args: [],
      });
    }

    return this.sendEventToWorker(event);
  }

  sendEventToWorker = (event: RecordingEvent) => {
    const promise = this.postMessage({
      id: this.id,
      method: 'addEvent',
      args: [event],
    });

    // XXX: See note in `get length()`
    this.eventBufferItemLength++;

    return promise;
  };

  finishRequest = async (id: number) => {
    const promise = this.postMessage({ id, method: 'finish', args: [] });

    // XXX: See note in `get length()`
    this.eventBufferItemLength = 0;

    return promise as Promise<Uint8Array>;
  };

  finish() {
    return this.finishRequest(this.id);
  }
}
