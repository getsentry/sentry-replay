import { beforeAll, expect, it, jest } from '@jest/globals';
import * as SentryUtils from '@sentry/utils';
import { BASE_TIMESTAMP, mockSdk } from '@test';

jest.useFakeTimers({ advanceTimers: true });

let domHandler: (args: any) => any;
beforeAll(() => {
  jest
    .spyOn(SentryUtils, 'addInstrumentationHandler')
    .mockImplementation((type, handler: (args: any) => any) => {
      if (type === 'dom') {
        domHandler = handler;
      }
    });
});

it('can create multiple instances', async () => {
  jest.setSystemTime(new Date(BASE_TIMESTAMP));
  const { replay, Replay } = await mockSdk();
  new Replay();

  replay.start();
  replay.start();

  domHandler({
    name: 'click',
  });

  jest.advanceTimersByTime(5000);
  await new Promise(process.nextTick);

  expect(replay).toHaveSentReplay({
    events: JSON.stringify([
      { data: { isCheckout: true }, timestamp: BASE_TIMESTAMP, type: 2 },
      {
        type: 5,
        timestamp: BASE_TIMESTAMP,
        data: {
          tag: 'breadcrumb',
          payload: {
            timestamp: BASE_TIMESTAMP / 1000,
            type: 'default',
            category: 'ui.click',
            message: '<unknown>',
            data: {},
          },
        },
      },
    ]),
  });
});
