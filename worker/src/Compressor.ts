import { Deflate, constants } from 'pako';

export class Compressor {
  /**
   * pako deflator instance
   */
  deflate: Deflate;

  /**
   * Number of added events
   */
  added: number;

  constructor() {
    this.createDeflator();
  }

  createDeflator() {
    this.added = 0;
    this.deflate = new Deflate();
    // Fake an array
    this.deflate.push('[', constants.Z_SYNC_FLUSH);
  }

  init() {
    return true;
  }

  addEvent(data: Record<string, any>) {
    // If the event is not the first event, we need to prefix it with a `,` so
    // that we end up with a list of events
    const prefix = this.added > 0 ? ',' : '';
    this.deflate.push(prefix + JSON.stringify(data), constants.Z_SYNC_FLUSH);
    this.added++;

    return true;
  }

  finish() {
    // We should always have a list, it can be empty
    this.deflate.push(']', constants.Z_FINISH);

    if (this.deflate.err) {
      throw this.deflate.err;
    }

    // Copy result before we create a new deflator and return the compressed
    // result
    const result = this.deflate.result;

    this.createDeflator();

    return result;
  }
}
