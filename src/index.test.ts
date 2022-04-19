import { SentryReplay } from '@';

jest.mock('rrweb', () => ({
  record: jest.fn(),
}));

jest.mock('@sentry/browser');

const rrweb = require('rrweb');

const recordMock = rrweb.record as jest.Mock;

describe('SentryReplay', () => {
  beforeEach(() => {
    recordMock.mockClear();
  });

  it('calls rrweb.record with default options', () => {
    const replay = new SentryReplay();
    replay.setup();

    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(recordMock.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "blockClass": "sr-block",
        "emit": [Function],
        "ignoreClass": "sr-ignore",
        "maskAllInputs": true,
        "maskTextClass": "sr-mask",
      }
    `);
  });

  it('calls rrweb.record with custom options', () => {
    const replay = new SentryReplay({
      rrwebConfig: {
        ignoreClass: 'test',
        maskAllInputs: false,
      },
    });
    replay.setup();

    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(recordMock.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "blockClass": "sr-block",
        "emit": [Function],
        "ignoreClass": "test",
        "maskAllInputs": false,
        "maskTextClass": "sr-mask",
      }
    `);
  });
});
