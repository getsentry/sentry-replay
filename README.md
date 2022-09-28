# sentry-replay

This integration is a WIP.

## Pre-Requisites

For the sentry-replay integration to work, you must have the [Sentry browser SDK package](https://www.npmjs.com/package/@sentry/browser) installed.

## Installation

To install the stable version:

with npm:

```shell
npm install --save @sentry/browser @sentry/replay
```

with yarn:

```shell
yarn add @sentry/browser @sentry/replay
```

## Setup

To set up the integration add the following to your Sentry initialization. Several options are supported and passable via the integration constructor.
See the [configuration section](#configuration) below for more details.

```javascript
import * as Sentry from '@sentry/browser';
import { Replay } from '@sentry/replay';

Sentry.init({
  dsn: '__DSN__',
  integrations: [new Replay()],
  // ...
});
```

### Stop Recording

Replay recording only starts automatically when it is included in the `integrations` key when calling `Sentry.init`. Otherwise you can initialize the plugin and manually call the `start()` method on the integration instance. To stop recording you can call the `stop()`.

```javascript
const replay = new Replay(); // This will *NOT* begin recording replays

replay.start(); // Start recording

replay.stop(); // Stop recording
```

## Configuration

### General Configuration

| key                 | type    | default | description                                                                                                                                                                                                                   |
| ------------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| captureOnlyOnError  | boolean | `false` | Only capture the recording when an error happens.                                                                                                                                                                             |
| initialFlushDelay   | number  | `5000`  | The amount of time to wait (in ms) before sending the initial recording payload. This helps drop recordings where users visit and close the page quickly.                                                                     |
| replaysSamplingRate | number  | `1.0`   | The rate at which to sample replays. (1.0 will collect all replays, 0 will collect no replays).                                                                                                                               |
| stickySession       | boolean | `true`  | Keep track of the user across page loads. Note a single user using multiple tabs will result in multiple sessions. Closing a tab will result in the session being closed as well.                                             |

### Privacy Configuration

| key              | type                     | default                             | description                                                                                                                                                                                         |
| ---------------- | ------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| maskAllText      | boolean                  | `true`                             | Mask _all_ text content. Will pass text content through `maskTextFn` before sending to server                                                                                                       |
| maskTextFn       | (text: string) => string | `(text) => '*'.repeat(text.length)` | Function to customize how text content is masked before sending to server. By default, masks text with `*`.                                                                                         |
| maskAllInputs    | boolean                  | `true`                              | Mask values of `<input>` elements. Passes input values through `maskInputFn` before sending to server                                                                                               |
| maskInputOptions | Record<string, boolean>  | `{ password: true }`                | Customize which inputs `type` to mask. <br /> Available `<input>` types: `color, date, datetime-local, email, month, number, range, search, tel, text, time, url, week, textarea, select, password` |
| maskInputFn      | (text: string) => string | `(text) => '*'.repeat(text.length)` | Function to customize how form input values are masked before sending to server. By default, masks values with `*`.                                                                                 |
| blockClass       | string \| RegExp         | `'sentry-block'`                    | Redact all elements that match the class name. See [privacy](#blocking) section for an example.                                                                                                                                                      |
| blockSelector    | string                   | `[data-sentry-block]`               | Redact all elements that match the DOM selector. See [privacy](#blocking) section for an example.                                                                                                                                                     |
| ignoreClass      | string \| RegExp         | `'sentry-ignore'`                   | Ignores all events on the matching input field. See [privacy](#ignoring) section for an example.                                                                                                                                                     |
| maskTextClass    | string \| RegExp         | `'sentry-mask'`                     | Mask all elements that match the class name. See [privacy](#masking) section for an example.                                                                                                                                                        |

### Optimization Configuration

| key              | type                    | default | description                                                                                                                                                                                                                  |
| ---------------- | ----------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| collectFonts     | boolean                 | `false` | Should collect fonts used on the website                                                                                                                                                                                     |
| inlineImages     | boolean                 | `false` | Should inline `<image>` content                                                                                                                                                                                              |
| inlineStylesheet | boolean                 | `true`  | Should inline stylesheets used in the recording                                                                                                                                                                              |
| recordCanvas     | boolean                 | `false` | Should record `<canvas>` elements                                                                                                                                                                                            |
| slimDOMOptions   | Record<string, boolean> | `{}`    | Remove unnecessary parts of the DOM <br /> Available keys: `script, comment, headFavicon, headWhitespace, headMetaDescKeywords, headMetaSocial, headMetaRobots, headMetaHttpEquiv, headMetaAuthorship, headMetaVerification` |

## Privacy
There are several ways to deal with PII. By default, the integration will mask all text content with `*`. This can be disabled by setting `maskAllText` to `false`. It is also possible to add the following CSS classes to specific DOM elements to prevent recording its contents: `sentry-block`, `sentry-ignore`, and `sentry-mask`. The following sections will show examples of how content is handled by the differing methods.

### Masking
Masking replaces the text content with something else. The default masking behavior is to replace each character with a `*`.
![Masking example](https://user-images.githubusercontent.com/79684/192808500-cedb3d25-a3bb-4962-b2f5-fe15f6f4d522.png)

### Blocking
Blocking replaces the element with a placeholder that has the same dimensions. The recording will show an empty space where the content was.
![image](https://user-images.githubusercontent.com/79684/192809669-b0b6f989-2c78-4e36-aa2a-d2fe959f4516.png)

### Ignoring
Ignoring only applies to form inputs. Events will be ignored on the input element so that the replay does not show what occurs inside of the input. In the below example, notice how the results in the table below the input changes, but no text is visible in the input.

https://user-images.githubusercontent.com/79684/192815134-a6451c3f-d3cb-455f-a699-7c3fe04d0a2e.mov

