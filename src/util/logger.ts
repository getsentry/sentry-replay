import { logger as sentryLogger } from '@sentry/utils';

import { IS_DEBUG_BUILD } from '../flags';

function wrapLogger(logFn: typeof sentryLogger[keyof typeof sentryLogger]) {
  return function wrappedLog(...args: any[]) {
    if (!IS_DEBUG_BUILD) {
      return;
    }
    return logFn.call(sentryLogger, '[Replay]', ...args);
  };
}

const logger = {
  ...console,
  error: wrapLogger(sentryLogger.error),
  warn: wrapLogger(sentryLogger.warn),
  log: console.log,
};

export { logger };
