import type { eventWithTime } from 'rrweb/typings/types';

import { SentryReplay } from '@';
import { ReplaySession } from '@/session';
import { BASE_TIMESTAMP } from './test';

type RRWebEvent = eventWithTime;

const ATTACHMENTS_URL_REGEX = new RegExp(
  'https://ingest.f00.f00/api/1/events/[^/]+/attachments/\\?sentry_key=dsn&sentry_version=7&sentry_client=replay'
);

beforeAll(async () => {
  jest.setSystemTime(new Date(BASE_TIMESTAMP));
});

afterEach(() => {
  jest.setSystemTime(new Date(BASE_TIMESTAMP));
});

expect.extend({
  toHaveSameSession(
    received: jest.Mocked<SentryReplay>,
    expected: ReplaySession
  ) {
    const pass = this.equals(received.session, expected);

    const options = {
      isNot: this.isNot,
      promise: this.promise,
    };

    return pass
      ? {
          pass: true,
          message: () =>
            this.utils.matcherHint(
              'toHaveSameSession',
              undefined,
              undefined,
              options
            ) +
            '\n\n' +
            `Expected: not ${this.utils.printExpected(expected)}\n` +
            `Received: ${this.utils.printReceived(received.session)}`,
        }
      : {
          pass: false,
          message: () =>
            this.utils.matcherHint(
              'toHaveSameSession',
              undefined,
              undefined,
              options
            ) +
            '\n\n' +
            `Expected: ${this.utils.printExpected(expected)}\n` +
            `Received: ${this.utils.printReceived(received.session)}`,
        };
  },

  /**
   * Checks the last call to `sendReplayRequest` and ensures a replay was uploaded
   */
  toHaveSentReplay(
    received: jest.Mocked<SentryReplay>,
    expected: RRWebEvent[]
  ) {
    const { calls } = received.sendReplayRequest.mock;
    const lastCall = calls[calls.length - 1];

    const pass =
      lastCall &&
      ATTACHMENTS_URL_REGEX.test(lastCall[0]) &&
      this.equals(expected, lastCall[1]);

    const options = {
      isNot: this.isNot,
      promise: this.promise,
    };

    return pass
      ? {
          pass: true,
          message: () =>
            !lastCall
              ? 'Expected Replay to not have been sent, but a request was attempted'
              : this.utils.matcherHint(
                  'toHaveSentReplay',
                  undefined,
                  undefined,
                  options
                ) +
                '\n\n' +
                `Expected: not ${this.utils.printExpected(expected)}\n` +
                `Received: ${this.utils.printReceived(lastCall[1])}`,
        }
      : {
          pass: false,
          message: () =>
            !lastCall
              ? 'Expected Replay to have been sent, but a request was not attempted'
              : this.utils.matcherHint(
                  'toHaveSentReplay',
                  undefined,
                  undefined,
                  options
                ) +
                '\n\n' +
                `Expected: ${this.utils.printExpected(expected)}\n` +
                `Received: ${this.utils.printReceived(lastCall[1])}`,
        };
  },
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toHaveSentReplay(expected?: RRWebEvent[]): CustomMatcherResult;
      toHaveSameSession(expected: ReplaySession): CustomMatcherResult;
    }
  }
}
