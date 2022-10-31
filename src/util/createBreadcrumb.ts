import type { Breadcrumb } from '@sentry/types';

type RequiredProperties = 'category' | 'message';

export function createBreadcrumb(
  breadcrumb: Pick<Breadcrumb, RequiredProperties> &
    Partial<Omit<Breadcrumb, RequiredProperties>>
): Breadcrumb {
  return {
    timestamp: new Date().getTime() / 1000,
    type: 'default',
    ...breadcrumb,
  };
}
