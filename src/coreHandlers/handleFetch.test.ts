import { handleFetch } from './handleFetch';
import { mockSdk } from '@test';

jest.unmock('@sentry/browser');

beforeAll(function () {
  mockSdk();
});

it('ignores fetches that have not completed yet', function () {
  const data = {
    args: ['resource.fetch', 'https://foo.bar'],
    startTimestamp: 10000,
    endTimestamp: 15000,
    response: {
      status: 200,
    },
  };

  expect(handleFetch(data)).toEqual({
    op: 'resource.fetch',
    description: 'https://foo.bar',
    startTimestamp: 10,
    endTimestamp: 15,
    data: {
      statusCode: 200,
    },
  });
});

it('ignores sdks own requests', function () {
  const data = {
    args: ['resource.fetch', 'https://ingest.f00.f00/envelope/etc/'],
    startTimestamp: 10000,
    endTimestamp: 15000,
    response: {
      status: 200,
    },
  };

  expect(handleFetch(data)).toEqual(null);
});
