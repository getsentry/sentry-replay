import { PerformanceEntryNavigation } from '@test/fixtures/performanceEntry/navigation';

import { dedupeNavigationEntries } from './dedupeNavigationEntries';

it('does nothing with a single entry', function () {
  const entries = [PerformanceEntryNavigation()];
  expect(dedupeNavigationEntries([], entries)).toEqual(entries);
});

it('dedupes 2 duplicate entries correctly', function () {
  const entries = [PerformanceEntryNavigation(), PerformanceEntryNavigation()];
  expect(dedupeNavigationEntries([], entries)).toEqual([entries[0]]);
});

it('dedupes multiple entries from new list', function () {
  const a = PerformanceEntryNavigation();
  const b = PerformanceEntryNavigation({ name: 'https://foo.bar/' });
  const c = PerformanceEntryNavigation({ type: 'reload' });
  const entries = [a, a, b, b, c];
  expect(dedupeNavigationEntries([], entries)).toEqual([a, b, c]);
});

it('dedupes from initial list and new list', function () {
  const a = PerformanceEntryNavigation();
  const b = PerformanceEntryNavigation({ name: 'https://foo.bar/' });
  const c = PerformanceEntryNavigation({ type: 'reload' });
  const d = PerformanceEntryNavigation({ startTime: 1000 });
  const entries = [a, a, b, b, c];
  expect(dedupeNavigationEntries([a, d], entries)).toEqual([b, c]);
});
