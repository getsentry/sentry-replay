import { MockedFunction, SpyInstance, vi } from 'vitest';

import { RecordingEvent } from '../../src/types';

type RecordAdditionalProperties = {
  takeFullSnapshot: jest.Mock;

  // Below are not mocked
  addCustomEvent: () => void;
  freezePage: () => void;
  mirror: unknown;

  // Custom property to fire events in tests, does not exist in rrweb.record
  _emitter: (event: RecordingEvent, ...args: any[]) => void;
};

export type RecordMock = MockedFunction<typeof rrweb.record> &
  RecordAdditionalProperties;

vi.mock('rrweb', async () => {
  const actual = (await vi.importActual('rrweb')) as typeof rrweb;
  const mockRecordFn: SpyInstance & Partial<RecordAdditionalProperties> = vi.fn(
    ({ emit }) => {
      mockRecordFn._emitter = emit;
    }
  );
  mockRecordFn.takeFullSnapshot = vi.fn((isCheckout) => {
    if (!mockRecordFn._emitter) {
      return;
    }

    mockRecordFn._emitter(
      {
        data: { isCheckout },
        timestamp: new Date().getTime(),
        type: isCheckout ? 2 : 3,
      },
      isCheckout
    );
  });

  return {
    ...actual,
    record: mockRecordFn as RecordMock,
  };
});

// XXX: Intended to be after `mock('rrweb')`
import * as rrweb from 'rrweb';

export function mockRrweb() {
  return {
    record: rrweb.record as RecordMock,
  };
}
