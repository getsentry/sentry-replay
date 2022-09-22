function isNavigationEntry(
  entry: PerformanceEntry
): entry is PerformanceNavigationTiming {
  return entry.entryType === 'navigation';
}

const NAVIGATION_ENTRY_KEYS: Array<keyof PerformanceNavigationTiming> = [
  'name',
  'type',
  'startTime',
  'transferSize',
  'duration',
];

function isNavigationEntryEqual(a: PerformanceNavigationTiming) {
  return function (b: PerformanceNavigationTiming) {
    return NAVIGATION_ENTRY_KEYS.every((key) => a[key] === b[key]);
  };
}

/**
 * There are some difficulties diagnosing why there are duplicate navigation
 * entries. We've witnessed several intermittent results:
 * - duplicate entries have duration = 0
 * - duplicate entries are the same object reference
 * - none of the above
 *
 * Compare the values of several keys to determine if the entries are duplicates or not.
 */
export function dedupeNavigationEntries(
  currentList: PerformanceEntryList,
  newList: PerformanceNavigationTiming[]
) {
  const existingNavigationEntries = currentList.filter(isNavigationEntry);

  // Ignore any navigation entries with duration 0, as they are likely duplicates
  const newNavigationEntriesWithDuration = newList.filter(
    ({ duration }) => duration > 0
  );

  // Ensure new entries do not already exist in existing entries
  const newNavigationEntries = newNavigationEntriesWithDuration.filter(
    (entry) => !existingNavigationEntries.find(isNavigationEntryEqual(entry))
  );

  // If there is only one result, nothing to de-dupe, carry on
  if (newNavigationEntries.length <= 1) {
    return newNavigationEntries;
  }

  // Otherwise we now need to make sure items in the new list are unique. Can't
  // use a Set because objects refs are different (values are the same)
  return newNavigationEntries.reduce(
    (
      acc: PerformanceNavigationTiming[],
      entry: PerformanceNavigationTiming
    ) => {
      if (!acc.find(isNavigationEntryEqual(entry))) {
        acc.push(entry);
      }
      return acc;
    },
    []
  );
}
