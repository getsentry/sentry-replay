import { vi, it, expect, MockedFunction } from 'vitest';

import type { Scope } from '@sentry/hub';
import type { Breadcrumb } from '@sentry/types';
import * as HandleScope from './handleScope';

vi.spyOn(HandleScope, 'handleScope');
const mockHandleScope = HandleScope.handleScope as MockedFunction<
  typeof HandleScope.handleScope
>;

it('returns a breadcrumb only if last breadcrumb has changed (unit)', function () {
  const scope = {
    _breadcrumbs: [],
  } as unknown as Scope;

  function addBreadcrumb(breadcrumb: Breadcrumb) {
    // @ts-expect-error using private member
    scope._breadcrumbs.push(breadcrumb);
  }

  const testMsg = {
    timestamp: new Date().getTime() / 1000,
    message: 'testing',
    category: 'console',
  };

  addBreadcrumb(testMsg);
  // integration testing here is a bit tricky, because the core SDK can
  // interfere with console output from test runner
  HandleScope.handleScope(scope);
  expect(mockHandleScope).toHaveBeenCalledTimes(1);
  expect(mockHandleScope).toHaveReturnedWith(
    expect.objectContaining({ message: 'testing', category: 'console' })
  );

  // This will trigger breadcrumb/scope listener, but handleScope should return
  // null because breadcrumbs has not changed
  mockHandleScope.mockClear();
  HandleScope.handleScope(scope);
  expect(mockHandleScope).toHaveBeenCalledTimes(1);
  expect(mockHandleScope).toHaveReturnedWith(null);

  mockHandleScope.mockClear();
  addBreadcrumb({
    message: 'f00',
    category: 'console',
  });
  HandleScope.handleScope(scope);
  expect(mockHandleScope).toHaveBeenCalledTimes(1);
  expect(mockHandleScope).toHaveReturnedWith(
    expect.objectContaining({ message: 'f00', category: 'console' })
  );
});
