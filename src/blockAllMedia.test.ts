import { mockSdk } from '@test';
import { beforeEach, expect, it, vi } from 'vitest';

import { Replay } from './';

let replay: Replay;

beforeEach(() => {
  vi.resetModules();
});

it('sets the correct configuration when `blockAllMedia` is disabled', async () => {
  ({ replay } = await mockSdk({ replayOptions: { blockAllMedia: false } }));

  expect(replay.recordingOptions.blockSelector).toBe('[data-sentry-block]');
});

it('sets the correct configuration when `blockSelector` is empty and `blockAllMedia` is enabled', async () => {
  ({ replay } = await mockSdk({ replayOptions: { blockSelector: '' } }));

  expect(replay.recordingOptions.blockSelector).toMatchInlineSnapshot(
    `"img,image,svg,path,rect,area,video,object,picture,embed,map,audio"`
  );
});

it('preserves `blockSelector` when `blockAllMedia` is enabled', async () => {
  ({ replay } = await mockSdk({
    replayOptions: { blockSelector: '[data-test-blockSelector]' },
  }));

  expect(replay.recordingOptions.blockSelector).toMatchInlineSnapshot(
    `"[data-test-blockSelector],img,image,svg,path,rect,area,video,object,picture,embed,map,audio"`
  );
});
