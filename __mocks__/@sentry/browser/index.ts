import { vi } from 'vitest';

const captureEvent = vi.fn();
const getCurrentHub = vi.fn(() => ({
  captureEvent,
  getClient: vi.fn(() => ({
    getDsn: vi.fn(),
  })),
}));

const addGlobalEventProcessor = vi.fn();
const configureScope = vi.fn();

export { getCurrentHub, addGlobalEventProcessor, configureScope };
