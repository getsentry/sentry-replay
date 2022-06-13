import { record } from 'rrweb';
import { getCurrentHub } from '@sentry/browser';

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
  (entry: PerformanceEntry) => ReplayPerformanceEntry
> = {
  resource: createResourceEntry,
  paint: createPaintEntry,
  navigation: createNavigationEntry,
  ['largest-contentful-paint']: createLargestContentfulPaint,
};

export function createPerformanceEntries(entries: PerformanceEntry[]) {
  return entries.map(createPerformanceEntry).filter(Boolean);
}

function createPerformanceEntry(entry: PerformanceEntry) {
  if (ENTRY_TYPES[entry.entryType] === undefined) {
    return null;
  }

  return ENTRY_TYPES[entry.entryType](entry);
}

function getAbsoluteTime(time: number) {
  return (window.performance.timeOrigin + time) / 1000;
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

  const { entryType, name, domComplete, startTime, transferSize, type } = entry;

  return {
    type: `${entryType}.${type}`,
    start: getAbsoluteTime(startTime),
    end: getAbsoluteTime(domComplete),
    name,
    data: {
      size: transferSize,
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
    transferSize,
  } = entry;

  // Do not capture fetches to Sentry ingestion endpoint
  const { host, protocol } = getCurrentHub()?.getClient()?.getDsn() || {};
  if (name.startsWith(`${protocol}:${host}`)) {
    return null;
  }

  console.log(entry);

  return {
    type: `${entryType}.${initiatorType}`,
    start: getAbsoluteTime(startTime),
    end: getAbsoluteTime(responseEnd),
    name,
    data: {
      size: transferSize,
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
      size,
      // Not sure why this errors, Node should be correct (Argument of type 'Node' is not assignable to parameter of type 'INode')
      nodeId: record.mirror.getId(entry.element as any),
    },
  };
}

export function createMemoryEntry(memoryEntry: MemoryInfo) {
  const { jsHeapSizeLimit, totalJSHeapSize, usedJSHeapSize } = memoryEntry;
  // we can't use getAbsoluteTime because it adds the event time to
  // window.performance.timeOrigin, so we get right now instead.
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
