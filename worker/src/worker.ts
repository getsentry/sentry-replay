import { Compressor } from './Compressor';

const compressor = new Compressor();

const handlers: Record<string, (args: any[]) => void> = {
  addEvent: (data: Record<string, any>) => {
    compressor.addEvent(data);
    postMessage('ok');
  },

  finish: () => {
    try {
      const result = compressor.finish();

      postMessage({ final: result });
    } catch (err) {
      console.error(err);
    }
  },
};

addEventListener('message', function (e) {
  const method = e.data.method as string;
  const [data] = e.data.args || [];

  if (method in handlers && typeof handlers[method] === 'function') {
    handlers[method](data);
  }
});
