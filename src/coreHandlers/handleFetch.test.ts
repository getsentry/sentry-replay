import { mockSdk } from '@test';
import { beforeAll, expect, it, vi } from 'vitest';

import { handleFetch } from './handleFetch';

vi.unmock('@sentry/browser');

beforeAll(function () {
  mockSdk();
});

const DEFAULT_DATA = {
  args: [
    '/api/0/organizations/sentry/',
    { method: 'GET', headers: {}, credentials: 'include' },
  ] as Parameters<typeof fetch>,
  endTimestamp: 15000,
  fetchData: {
    method: 'GET',
    url: '/api/0/organizations/sentry/',
  },
  response: {
    type: 'basic',
    url: '',
    redirected: false,
    status: 200,
    ok: true,
  },
  startTimestamp: 10000,
};

it('formats fetch calls from core SDK to replay breadcrumbs', function () {
  expect(handleFetch(DEFAULT_DATA)).toEqual({
    type: 'resource.fetch',
    name: '/api/0/organizations/sentry/',
    start: 10,
    end: 15,
    data: {
      method: 'GET',
      statusCode: 200,
    },
  });
});

it('ignores fetches that have not completed yet', function () {
  const data = {
    ...DEFAULT_DATA,
  };

  // @ts-expect-error: The operand of a 'delete' operator must be optional.ts(2790)
  delete data.endTimestamp;
  // @ts-expect-error: The operand of a 'delete' operator must be optional.ts(2790)
  delete data.response;

  expect(handleFetch(data)).toEqual(null);
});
