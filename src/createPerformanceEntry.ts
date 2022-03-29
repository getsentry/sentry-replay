type EntryType =
  | 'element'
  | 'navigation'
  | 'resource'
  | 'mark'
  | 'measure'
  | 'paint'
  | 'longtask';

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
  data?: Record<string, any>;
}

// Map entryType -> function to normalize data for event
const ENTRY_TYPES: Record<
  string,
  (entry: PerformanceEntry) => ReplayPerformanceEntry
> = {
  resource: createResourceEntry,
  paint: createPaintEntry,
  navigation: createNavigationEntry,
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
  // duration: 0
  // entryType: "paint"
  // name: "first-paint"
  // startTime: 240.89999997615814

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
  // {
  // connectEnd: 2.5
  // connectStart: 2.5
  // decodedBodySize: 1711
  // domComplete: 3726
  // domContentLoadedEventEnd: 2359.600000023842
  // domContentLoadedEventStart: 2359.2000000476837
  // domInteractive: 1501.5
  // domainLookupEnd: 2.5
  // domainLookupStart: 2.5
  // duration: 3726
  // encodedBodySize: 850
  // entryType: "navigation"
  // fetchStart: 2.5
  // initiatorType: "navigation"
  // loadEventEnd: 3726
  // loadEventStart: 3726
  // name: "http://localhost:3000/"
  // nextHopProtocol: ""
  // redirectCount: 0
  // redirectEnd: 0
  // redirectStart: 0
  // requestStart: 806.1000000238419
  // responseEnd: 822.5
  // responseStart: 822
  // secureConnectionStart: 0
  // serverTiming: []
  // startTime: 0
  // transferSize: 1150
  // type: "back_forward"
  // unloadEventEnd: 0
  // unloadEventStart: 0
  // workerStart: 0
  // }

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
  // {
  // connectEnd: 69.60000002384186
  // connectStart: 69.60000002384186
  // decodedBodySize: 2322245
  // domainLookupEnd: 69.60000002384186
  // domainLookupStart: 69.60000002384186
  // duration: 103.29999995231628
  // encodedBodySize: 468975
  // entryType: "resource"
  // fetchStart: 69.60000002384186
  // initiatorType: "script"
  // name: "http://localhost:3000/static/js/bundle.js"
  // nextHopProtocol: "http/1.1"
  // redirectEnd: 0
  // redirectStart: 0
  // requestStart: 78.60000002384186
  // responseEnd: 172.89999997615814
  // responseStart: 86.60000002384186
  // secureConnectionStart: 0
  // serverTiming: []
  // startTime: 69.60000002384186
  // transferSize: 469275
  // workerStart: 0
  // }

  const {
    entryType,
    initiatorType,
    name,
    responseEnd,
    startTime,
    transferSize,
  } = entry;

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
  entry: PerformanceEntry & { size: number }
) {
  // duration: 0
  // element: h1
  // entryType: "largest-contentful-paint"
  // id: ""
  // loadTime: 0
  // name: ""
  // renderTime: 309.799
  // size: 52870
  // startTime: 309.799
  // url: ""
  //

  const { duration, entryType, startTime, size } = entry;

  const start = getAbsoluteTime(startTime);
  return {
    type: entryType,
    name: entryType,
    start,
    end: start + duration,
    data: {
      size,
    },
  };
}
