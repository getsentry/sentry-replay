import * as HandleScope from './handleScope';
import { mockSdk } from '@test';
import { getCurrentHub } from '@sentry/core';

let mockHandleScope: jest.MockedFunction<typeof HandleScope.handleScope>;

jest.useFakeTimers();

beforeAll(function () {
  mockSdk();
  jest.spyOn(HandleScope, 'handleScope');
  mockHandleScope = HandleScope.handleScope as jest.MockedFunction<
    typeof HandleScope.handleScope
  >;

  jest.runAllTimers();
});

it('returns a breadcrumb only if last breadcrumb has changed (integration)', function () {
  getCurrentHub().getScope().addBreadcrumb({ message: 'testing' });

  expect(mockHandleScope).toHaveBeenCalledTimes(1);
  expect(mockHandleScope).toHaveReturnedWith(
    expect.objectContaining({ message: 'testing' })
  );

  mockHandleScope.mockClear();

  // This will trigger breadcrumb/scope listener, but handleScope should return
  // null because breadcrumbs has not changed
  getCurrentHub().getScope().setUser({ email: 'foo@foo.com' });
  expect(mockHandleScope).toHaveBeenCalledTimes(1);
  expect(mockHandleScope).toHaveReturnedWith(null);
});
