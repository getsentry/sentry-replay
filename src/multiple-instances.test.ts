import { SentryReplay } from './';

it('throws on creating multiple instances', function () {
  expect(() => {
    new SentryReplay();
    new SentryReplay();
  }).toThrow();
});
