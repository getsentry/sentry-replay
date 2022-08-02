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
      logger.log('using compression worker');
      return new EventBufferCompressionWorker(new Worker(workerUrl));
    } catch {
      // catch and ignore, fallback to simple event buffer
    }
  }

  logger.log('falling back to simple event buffer');
  return new EventBufferArray();
}

export interface IEventBuffer {
  get length(): number;
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
  private worker: Worker;
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
      const listener = ({ data }: MessageEvent<WorkerResponse>) => {
        if (data.method !== method) {
          return;
        }

        // There can be multiple listeners for a single method, the id ensures
        // that the response matches the caller.
        if (data.id !== id) {
          return;
        }

        if (!data.success) {
          // TODO: Do some error handling, not sure what
          logger.error(data.response);

          reject(new Error('Error in compression worker'));
          return;
        }

        resolve(data.response);
        this.worker.removeEventListener('message', listener);
      };

      // Note: we can't use `once` option because it's possible it needs to
      // listen to multiple messages
      this.worker.addEventListener('message', listener);
      this.worker.postMessage({ id, method, args });
    });
  }

  init() {
    this.postMessage({ id: this.id, method: 'init', args: [] });
    logger.log('Message posted to worker');
  }

  destroy() {
    this.worker.terminate();
    this.worker = null;
  }

  /**
   * Note that this may not reflect what is actually in the event buffer. This
   * is only a local count of the buffer size sincce `addEvent` is async.
   */
  get length() {
    return this.eventBufferItemLength;
  }

  addEvent(event: RecordingEvent, isCheckout?: boolean) {
    // If not a checkout, send event to worker
    if (!isCheckout) {
      return this.sendEventToWorker(event);
    }

    // This event is a checkout, make sure worker buffer is cleared before
    // proceeding.
    //
    // XXX: There is an assumption here that init will always complete before
    // the message in `sendEventToWorker`
    this.postMessage({
      id: this.id,
      method: 'init',
      args: [],
    });

    // Worker has been re-initialized, can add event now
    this.sendEventToWorker(event);
  }

  sendEventToWorker(event: RecordingEvent) {
    const promise = this.postMessage({
      id: this.id,
      method: 'addEvent',
      args: [event],
    });

    logger.log('Message posted to worker');

    // XXX: See note in `get length()`
    this.eventBufferItemLength++;

    return promise;
  }

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
