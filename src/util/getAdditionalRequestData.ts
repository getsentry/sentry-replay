import { ReplayPerformanceEntry } from '@/createPerformanceEntry';

function getData(
  entry: ReplayPerformanceEntry,
  coreRequests: ReplayPerformanceEntry[]
) {
  if (
    entry.type !== 'resource.fetch' &&
    entry.type !== 'resource.xmlhttprequest'
  ) {
    return entry;
  }

  const found = coreRequests.filter(
    (coreRequest) => coreRequest.name === entry.name
  );

  // Multiple requests with same URL found... give up
  // TODO: Return the "closest" request 😬
  if (found.length > 1) {
    return entry;
  }

  if (found.length === 0) {
    return entry;
  }

  return {
    ...entry,
    data: {
      ...entry.data,
      ...found[0].data,
    },
  };
}

export function getAdditionalRequestData(
  entries: ReplayPerformanceEntry[],
  coreRequests: ReplayPerformanceEntry[]
): ReplayPerformanceEntry[] {
  return entries.map((entry) => getData(entry, coreRequests));
}
