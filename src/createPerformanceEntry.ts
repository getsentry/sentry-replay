import { browserPerformanceTimeOrigin } from '@sentry/utils';
import { record } from 'rrweb';

import { isIngestHost } from './util/isIngestHost';
import { AllPerformanceEntry } from './types';

export interface ReplayPerformanceEntry {
  /**
   * One of these types https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEntry/entryType
   */
  type: string;

  /**
   * A more specific description of the performance entry
   */
  name: string;

  /**
   * The start timestamp in seconds
   */
  start: number;

  /**
   * The end timestamp in seconds
   */
  end: number;

  /**
   * Additional unstructured data to be included
   */
  data?: Record<string, unknown>;
}

interface MemoryInfo {
  jsHeapSizeLimit: number;
  totalJSHeapSize: number;
  usedJSHeapSize: number;
}

// Map entryType -> function to normalize data for event
const ENTRY_TYPES: Record<
  string,
  (entry: AllPerformanceEntry) => null | ReplayPerformanceEntry
> = {
  resource: createResourceEntry,
  paint: createPaintEntry,
  navigation: createNavigationEntry,
  ['largest-contentful-paint']: createLargestContentfulPaint,
};

export function createPerformanceEntries(entries: AllPerformanceEntry[]) {
  return entries
    .map(createPerformanceEntry)
    .filter(Boolean) as ReplayPerformanceEntry[];
}

function createPerformanceEntry(entry: AllPerformanceEntry) {
  if (ENTRY_TYPES[entry.entryType] === undefined) {
    return null;
  }

  return ENTRY_TYPES[entry.entryType](entry);
}

function getAbsoluteTime(time: number) {
  // browserPerformanceTimeOrigin can be undefined if `performance` or
  // `performance.now` doesn't exist, but this is already checked by this integration
  return (
    ((browserPerformanceTimeOrigin || window.performance.timeOrigin) + time) /
    1000
  );
}

function createPaintEntry(entry: PerformancePaintTiming) {
  const { duration, entryType, name, startTime } = entry;

  const start = getAbsoluteTime(startTime);
  return {
    type: entryType,
    name,
    start,
    end: start + duration,
  };
}

function createNavigationEntry(entry: PerformanceNavigationTiming) {
  // TODO: There looks to be some more interesting bits in here (domComplete, domContentLoaded)
  const {
    entryType,
    name,
    duration,
    domComplete,
    startTime,
    transferSize,
    type,
  } = entry;

  // Ignore entries with no duration, they do not seem to be useful and cause dupes
  if (duration === 0) {
    return null;
  }

  return {
    type: `${entryType}.${type}`,
    start: getAbsoluteTime(startTime),
    end: getAbsoluteTime(domComplete),
    name,
    data: {
      size: transferSize,
      duration,
    },
  };
}
function createResourceEntry(entry: PerformanceResourceTiming) {
  const {
    entryType,
    initiatorType,
    name,
    responseEnd,
    startTime,
    encodedBodySize,
    transferSize,
  } = entry;

  // Do not capture fetches to Sentry ingestion endpoint
  if (isIngestHost(name)) {
    return null;
  }

  // Core SDK handles these
  if (['fetch', 'xmlhttprequest'].includes(initiatorType)) {
    return null;
  }

  return {
    type: `${entryType}.${initiatorType}`,
    start: getAbsoluteTime(startTime),
    end: getAbsoluteTime(responseEnd),
    name,
    data: {
      size: transferSize,
      encodedBodySize,
    },
  };
}

function createLargestContentfulPaint(
  entry: PerformanceEntry & { size: number; element: Node }
) {
  const { duration, entryType, startTime, size } = entry;

  const start = getAbsoluteTime(startTime);

  return {
    type: entryType,
    name: entryType,
    start,
    end: start + duration,
    data: {
      duration,
      size,
      // Not sure why this errors, Node should be correct (Argument of type 'Node' is not assignable to parameter of type 'INode')
      nodeId: record.mirror.getId(entry.element as any),
    },
  };
}

export function createMemoryEntry(memoryEntry: MemoryInfo) {
  const { jsHeapSizeLimit, totalJSHeapSize, usedJSHeapSize } = memoryEntry;
  // we don't want to use `getAbsoluteTime` because it adds the event time to the
  // time origin, so we get the current timestamp instead
  const time = new Date().getTime() / 1000;
  return {
    type: 'memory',
    name: 'memory',
    start: time,
    end: time,
    data: {
      memory: {
        jsHeapSizeLimit,
        totalJSHeapSize,
        usedJSHeapSize,
      },
    },
  };
}
