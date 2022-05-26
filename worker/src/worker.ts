import { Deflate, constants } from 'pako';

class Worker {
  deflate: Deflate;
  constructor() {
    this.deflate = new Deflate();
  }

  init() {
    postMessage('ok');
  }

  addEvent(data: string) {
    this.deflate.push(data, constants.Z_SYNC_FLUSH);
    postMessage('ok');
  }

  finish() {
    this.deflate.push('', constants.Z_FINISH);
    postMessage({ final: this.deflate.result });
    this.deflate = new Deflate();
  }
}

const compressor = new Worker();

addEventListener('message', function (e) {
  const method = e.data.method as string;
  const args = e.data.args;
  compressor[method as 'add' | 'finish'](...args);

  // console.log('Message received from main script');
  // console.log('Posting message back to main script');
  // postMessage('test');
});
