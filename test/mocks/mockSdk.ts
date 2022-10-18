import { vi } from 'vitest';

vi.unmock('@sentry/browser');

import { BrowserOptions, init } from '@sentry/browser';
import { Transport } from '@sentry/types';

import { ReplayConfiguration } from '../../src/types';

interface MockSdkParams {
  replayOptions?: ReplayConfiguration;
  sentryOptions?: BrowserOptions;
}

class MockTransport implements Transport {
  async send() {
    return;
  }
  async flush() {
    return true;
  }
  async sendEvent(_e: Event) {
    return {
      status: 'skipped',
      event: 'ok',
      type: 'transaction',
    };
  }
  async sendSession() {
    return;
  }
  async recordLostEvent() {
    return;
  }
  async close() {
    return;
  }
}

export async function mockSdk({
  replayOptions = {
    stickySession: true,
    ignoreClass: 'sentry-test-ignore',
  },
  sentryOptions = {
    dsn: 'https://dsn@ingest.f00.f00/1',
    autoSessionTracking: false,
    sendClientReports: false,
    transport: () => new MockTransport(),
  },
}: MockSdkParams = {}) {
  const { Replay } = await import('../../src');
  const replay = new Replay(replayOptions);

  init({ ...sentryOptions, integrations: [replay] });
  vi.spyOn(replay, 'sendReplayRequest');

  return { replay };
}
