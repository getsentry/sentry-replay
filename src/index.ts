import {
  addGlobalEventProcessor,
  captureEvent,
  getCurrentHub,
} from '@sentry/core';
import { addInstrumentationHandler, uuid4 } from '@sentry/utils';
import { DsnComponents, Event, Integration, Breadcrumb } from '@sentry/types';

import { EventType, record } from 'rrweb';

import {
  createPerformanceEntries,
  createMemoryEntry,
  ReplayPerformanceEntry,
} from './createPerformanceEntry';
import { createEventBuffer, IEventBuffer } from './eventBuffer';
import {
  REPLAY_EVENT_NAME,
  ROOT_REPLAY_NAME,
  SESSION_IDLE_DURATION,
  VISIBILITY_CHANGE_TIMEOUT,
} from './session/constants';
import { getSession } from './session/getSession';
import type {
  InstrumentationType,
  InitialState,
  RecordingEvent,
  RecordingConfig,
  ReplaySpan,
  ReplayRequest,
  SentryReplayPluginOptions,
  SentryReplayConfiguration,
} from './types';
import { isExpired } from './util/isExpired';
import { isSessionExpired } from './util/isSessionExpired';
import { logger } from './util/logger';
import { handleDom, handleScope, handleFetch, handleXhr } from './coreHandlers';
import createBreadcrumb from './util/createBreadcrumb';
import { Session } from './session/Session';
import { captureReplay } from './api/captureReplay';
import { supportsSendBeacon } from './util/supportsSendBeacon';

/**
 * Returns true to return control to calling function, otherwise continue with normal batching
 */
type AddUpdateCallback = () => boolean | void;

const BASE_RETRY_INTERVAL = 5000;
const MAX_RETRY_COUNT = 5;

export class SentryReplay implements Integration {
  /**
   * @inheritDoc
   */
  public static id = 'Replay';

  /**
   * @inheritDoc
   */
  public name: string = SentryReplay.id;

  public eventBuffer: IEventBuffer;

  /**
   * Buffer of breadcrumbs to be uploaded
   */
  public breadcrumbs: Breadcrumb[] = [];

  /**
   * Buffer of replay spans to be uploaded
   */
  public replaySpans: ReplaySpan[] = [];

  /**
   * List of PerformanceEntry from PerformanceObserver
   */
  public performanceEvents: PerformanceEntry[] = [];

  /**
   * Options to pass to `rrweb.record()`
   */
  readonly recordingOptions: RecordingConfig;

  readonly options: SentryReplayPluginOptions;

  /**
   * setTimeout id used for debouncing sending rrweb attachments
   */
  private timeout: number;

  /**
   * The timestamp of the first event since the last flush. This is used to
   * determine if the maximum allowed time has passed before events should be
   * flushed again.
   */
  private initialEventTimestampSinceFlush: number | null = null;

  private performanceObserver: PerformanceObserver | null = null;

  private retryCount = 0;
  private retryInterval = BASE_RETRY_INTERVAL;

  /**
   * Flag to make sure we only create a replay event when
   * necessary (i.e. we only want to have a single replay
   * event per session and it should only be created
   * immediately before sending recording)
   */
  private needsCaptureReplay = false;

  private initialState: InitialState;

  session: Session | undefined;

  static attachmentUrlFromDsn(dsn: DsnComponents, eventId: string) {
    const { host, projectId, protocol, publicKey } = dsn;

    const port = dsn.port !== '' ? `:${dsn.port}` : '';
    const path = dsn.path !== '' ? `/${dsn.path}` : '';

    return `${protocol}://${host}${port}${path}/api/${projectId}/events/${eventId}/attachments/?sentry_key=${publicKey}&sentry_version=7&sentry_client=replay`;
  }

  constructor({
    flushMinDelay = 5000,
    flushMaxDelay = 15000,
    initialFlushDelay = 5000,
    stickySession = false, // TBD: Making this opt-in for now
    useCompression = true,
    captureOnlyOnError = false,
    recordingConfig: {
      maskAllInputs = true,
      blockClass = 'sr-block',
      ignoreClass = 'sr-ignore',
      maskTextClass = 'sr-mask',
      ...recordingOptions
    } = {},
  }: SentryReplayConfiguration = {}) {
    this.recordingOptions = {
      maskAllInputs,
      blockClass,
      ignoreClass,
      maskTextClass,
      ...recordingOptions,
    };

    this.options = {
      flushMinDelay,
      flushMaxDelay,
      stickySession,
      initialFlushDelay,
      captureOnlyOnError,
    };

    // Modify rrweb options to checkoutEveryNthSecond if this is defined, as we don't know when an error occurs, so we want to try to minimize the number of events captured.
    if (this.options.captureOnlyOnError) {
      // Checkout every minute, meaning we only get up-to one minute of events before the error happens
      this.recordingOptions.checkoutEveryNms = 60000;
    }

    this.eventBuffer = createEventBuffer({ useCompression });
  }

  setupOnce() {
    /**
     * Because we create a transaction in `setupOnce`, we can potentially create a
     * transaction before some native SDK integrations have run and applied their
     * own global event processor. An example is:
     * https://github.com/getsentry/sentry-javascript/blob/b47ceafbdac7f8b99093ce6023726ad4687edc48/packages/browser/src/integrations/useragent.ts
     *
     * So we do this as a workaround to wait for other global event processors to finish
     */
    window.setTimeout(() => this.setup());
  }

  /**
   * Initializes the plugin.
   *
   * Creates or loads a session, attaches listeners to varying events (DOM, PerformanceObserver, Recording, Sentry SDK, etc)
   */
  setup() {
    this.loadSession({ expiry: SESSION_IDLE_DURATION });

    // If there is no session, then something bad has happened - can't continue
    if (!this.session) {
      throw new Error('Invalid session');
    }

    this.addListeners();

    // Tag all (non replay) events that get sent to Sentry with the current
    // replay ID so that we can reference them later in the UI
    addGlobalEventProcessor(this.handleGlobalEvent);

    record({
      ...this.recordingOptions,
      emit: this.handleRecordingEmit,
    });

    // Otherwise, these will be captured after the first flush, which means the
    // URL and timestamps could incorrect
    this.initialState = {
      timestamp: new Date().getTime(),
      url: `${window.location.origin}${window.location.pathname}`,
    };
  }

  /**
   * We want to batch uploads of replay events. Save events only if
   * `<flushMinDelay>` milliseconds have elapsed since the last event
   * *OR* if `<flushMaxDelay>` milliseconds have elapsed.
   *
   * Accepts a callback to perform side-effects and returns true to stop batch
   * processing and hand back control to caller.
   */
  addUpdate(cb?: AddUpdateCallback) {
    const now = new Date().getTime();

    // Timestamp of the first replay event since the last flush, this gets
    // reset when we finish the replay event
    if (
      !this.initialEventTimestampSinceFlush &&
      !this.options.captureOnlyOnError
    ) {
      this.initialEventTimestampSinceFlush = now;
    }

    // Do not finish the replay event if we receive a new replay event
    if (this.timeout) {
      window.clearTimeout(this.timeout);
    }

    // We need to always run `cb` (e.g. in the case of captureOnlyOnError == true)
    const cbResult = cb?.();

    // If this option is turned on then we will only want to call `flushUpdate`
    // explicitly
    if (this.options.captureOnlyOnError) {
      return;
    }

    // If callback is true, we do not want to continue with flushing -- the
    // caller will need to handle it.
    if (cbResult === true) {
      return;
    }

    const flushMaxDelayExceeded = isExpired(
      this.initialEventTimestampSinceFlush,
      this.options.flushMaxDelay,
      now
    );

    // If `flushMaxDelayExceeded` is true, then we should finish the replay event immediately,
    // Otherwise schedule it to be finished in `this.options.flushMinDelay`
    if (flushMaxDelayExceeded) {
      logger.log('replay max delay exceeded, finishing replay event');
      this.flushUpdate();
      return;
    }

    // Set timer to finish replay event and send replay attachment to
    // Sentry. Will be cancelled if an event happens before `flushMinDelay`
    // elapses.
    this.timeout = window.setTimeout(() => {
      logger.log('replay timeout exceeded, finishing replay event');
      this.flushUpdate(now);
    }, this.options.flushMinDelay);
  }

  /**
   * Currently, this needs to be manually called (e.g. for tests). Sentry SDK does not support a teardown
   */
  destroy() {
    this.removeListeners();
    this.eventBuffer.destroy();
  }

  clearSession() {
    this.session = null;
  }

  /**
   * Loads a session from storage, or creates a new one if it does not exist or
   * is expired.
   */
  loadSession({ expiry }: { expiry: number }): void {
    const { type, session } = getSession({
      expiry,
      stickySession: this.options.stickySession,
      currentSession: this.session,
    });

    // If session was newly created (i.e. was not loaded from storage), then
    // enable flag to create the root replay
    if (type === 'new') {
      this.needsCaptureReplay = true;
    }

    if (session.id !== this.session?.id) {
      session.previousSessionId = this.session?.id;
    }

    this.session = session;
  }

  /**
   * Adds listeners to record events for the replay
   */
  addListeners() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('focus', this.handleWindowFocus);
    window.addEventListener('beforeunload', this.handleWindowUnload);

    // Listeners from core SDK //
    const scope = getCurrentHub().getScope();
    scope.addScopeListener(this.handleCoreListener('scope'));
    addInstrumentationHandler('dom', this.handleCoreListener('dom'));

    // PerformanceObserver //
    if (!('PerformanceObserver' in window)) {
      return;
    }

    this.performanceObserver = new PerformanceObserver(
      this.handlePerformanceObserver
    );

    // Observe almost everything for now (no mark/measure)
    [
      'element',
      'event',
      'first-input',
      'largest-contentful-paint',
      'layout-shift',
      'longtask',
      'navigation',
      'paint',
      'resource',
    ].forEach((type) =>
      this.performanceObserver.observe({
        type,
        buffered: true,
      })
    );
  }

  /**
   * Cleans up listeners that were created in `addListeners`
   */
  removeListeners() {
    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange
    );

    document.removeEventListener('beforeunload', this.handleWindowUnload);

    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
      this.performanceObserver = null;
    }
  }

  /**
   * Core Sentry SDK global event handler. Attaches `replayId` to all [non-replay]
   * events as a tag. Also handles the case where we only want to capture a reply
   * when an error occurs.
   **/
  handleGlobalEvent = (event: Event) => {
    // Do not apply replayId to the root event
    if (
      event.message === ROOT_REPLAY_NAME ||
      event.message?.startsWith(REPLAY_EVENT_NAME)
    ) {
      return event;
    }

    event.tags = { ...event.tags, replayId: this.session.id };

    // Need to be very careful that this does not cause an infinite loop
    if (this.options.captureOnlyOnError && event.exception) {
      // TODO: Do we continue to record after?
      // TODO: What happens if another error happens? Do we record in the same session?
      setTimeout(() => this.flushUpdate());
    }

    return event;
  };

  /**
   * Handler for recording events.
   *
   * Adds to event buffer, and has varying flushing behaviors if the event was a checkout.
   */
  handleRecordingEmit = (event: RecordingEvent, isCheckout?: boolean) => {
    // If this is false, it means session is expired, create and a new session and wait for checkout
    if (!this.checkAndHandleExpiredSession()) {
      logger.error(new Error('Received replay event after session expired.'));

      return;
    }

    this.addUpdate(() => {
      // We need to clear existing events on a checkout, otherwise they are
      // incremental event updates and should be appended
      this.eventBuffer.addEvent(event, isCheckout);

      // Different behavior for full snapshots (type=2), ignore other event types
      // See https://github.com/rrweb-io/rrweb/blob/d8f9290ca496712aa1e7d472549480c4e7876594/packages/rrweb/src/types.ts#L16
      if (event.type !== 2) {
        return false;
      }

      // If there is a previousSessionId after a full snapshot occurs, then
      // the replay session was started due to session expiration. The new session
      // is started before triggering a new checkout and contains the id
      // of the previous session. Do not immediately flush in this case
      // to avoid capturing only the checkout and instead the replay will
      // be captured if they perform any follow-up actions.
      if (this.session.previousSessionId) {
        return true;
      }

      // If the full snapshot is due to an initial load, we will not have
      // a previous session ID. In this case, we want to buffer events
      // for a set amount of time before flushing. This can help avoid
      // capturing replays of users that immediately close the window.
      const now = new Date().getTime();
      setTimeout(
        () => this.conditionalFlush(now),
        this.options.initialFlushDelay
      );

      return true;
    });
  };

  /**
   * Handle when visibility of the page content changes. Opening a new tab will
   * cause the state to change to hidden because of content of current page will
   * be hidden. Likewise, moving a different window to cover the contents of the
   * page will also trigger a change to a hidden state.
   */
  handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      this.doChangeToForegroundTasks();
    } else {
      this.doChangeToBackgroundTasks();
    }
  };

  /**
   * Handle when page is blurred
   */
  handleWindowBlur = () => {
    const breadcrumb = createBreadcrumb({
      category: 'ui.blur',
    });

    this.doChangeToBackgroundTasks(breadcrumb);
  };

  /**
   * Handle when page is focused
   */
  handleWindowFocus = () => {
    const breadcrumb = createBreadcrumb({
      category: 'ui.focus',
    });

    this.doChangeToForegroundTasks(breadcrumb);
  };

  /**
   * Handle when page is closed
   */
  handleWindowUnload = () => {
    this.createCustomBreadcrumb(
      createBreadcrumb({
        category: 'ui.exit',
      })
    );
  };

  /**
   * Handler for Sentry Core SDK events.
   *
   * Transforms core SDK events into replay events.
   *
   */
  handleCoreListener = (type: InstrumentationType) => (handlerData: any) => {
    const handlerMap: Record<
      InstrumentationType,
      [
        handler: InstrumentationType extends 'fetch' | 'xhr'
          ? (handlerData: any) => ReplaySpan
          : (handlerData: any) => Breadcrumb,
        eventType: string
      ]
    > = {
      scope: [handleScope, 'breadcrumb'],
      dom: [handleDom, 'breadcrumb'],
      fetch: [handleFetch, 'span'],
      xhr: [handleXhr, 'span'],
    };

    if (!(type in handlerMap)) {
      throw new Error(`No handler defined for type: ${type}`);
    }

    const [handlerFn, eventType] = handlerMap[type];

    const result = handlerFn(handlerData);

    if (result === null) {
      return;
    }

    if (['sentry.transaction'].includes(result.category)) {
      return;
    }

    this.addUpdate(() => {
      this.eventBuffer.addEvent({
        type: EventType.Custom,
        // TODO: We were converting from ms to seconds for breadcrumbs, spans,
        // but maybe we should just keep them as milliseconds
        timestamp:
          (result as Breadcrumb).timestamp * 1000 ||
          (result as ReplaySpan).startTimestamp * 1000,
        data: {
          tag: eventType,
          payload: result,
        },
      });
    });
  };

  /**
   * Keep a list of performance entries that will be sent with a replay
   */
  handlePerformanceObserver = (
    list: PerformanceObserverEntryList
    // observer: PerformanceObserver
  ) => {
    this.performanceEvents = [...this.performanceEvents, ...list.getEntries()];
  };

  /**
   * Tasks to run when we consider a page to be hidden (via blurring and/or visibility)
   */
  doChangeToBackgroundTasks(breadcrumb?: Breadcrumb) {
    const isExpired = isSessionExpired(this.session, VISIBILITY_CHANGE_TIMEOUT);

    if (breadcrumb) {
      this.createCustomBreadcrumb({
        ...breadcrumb,
        // if somehow the page went hidden while session is expired, attach to previous session
        timestamp: isExpired
          ? this.session.lastActivity / 1000
          : breadcrumb.timestamp,
      });
    }

    // Send replay when the page/tab becomes hidden. There is no reason to send
    // replay if it becomes visible, since no actions we care about were done
    // while it was hidden
    this.conditionalFlush();
  }

  /**
   * Tasks to run when we consider a page to be visible (via focus and/or visibility)
   */
  doChangeToForegroundTasks(breadcrumb?: Breadcrumb) {
    const isExpired = isSessionExpired(this.session, VISIBILITY_CHANGE_TIMEOUT);

    if (breadcrumb) {
      this.createCustomBreadcrumb({
        ...breadcrumb,
        timestamp: isExpired
          ? new Date().getTime() / 1000
          : breadcrumb.timestamp,
      });
    }

    if (isExpired) {
      // If the user has come back to the page within VISIBILITY_CHANGE_TIMEOUT
      // ms, we will re-use the existing session, otherwise create a new
      // session
      logger.log('Document has become active, but session has expired');
      this.loadSession({ expiry: VISIBILITY_CHANGE_TIMEOUT });
      this.triggerFullSnapshot();
      return;
    }

    // Otherwise if session is not expired...
    // Update with current timestamp as the last session activity
    // Only updating session on visibility change to be conservative about
    // writing to session storage. This could be changed in the future.
    this.updateLastActivity();
  }

  /**
   * Trigger rrweb to take a full snapshot which will cause this plugin to
   * create a new Replay event.
   */
  triggerFullSnapshot() {
    logger.log('Taking full rrweb snapshot');
    record.takeFullSnapshot(true);
  }

  /**
   * Updates the session's last activity timestamp
   */
  updateLastActivity(lastActivity: number = new Date().getTime()) {
    this.session.lastActivity = lastActivity;
  }

  /**
   * Helper to create (and buffer) a replay breadcrumb from a core SDK breadcrumb
   */
  createCustomBreadcrumb(breadcrumb: Breadcrumb) {
    this.addUpdate(() => {
      this.eventBuffer.addEvent({
        type: EventType.Custom,
        timestamp: breadcrumb.timestamp,
        data: {
          tag: 'breadcrumb',
          payload: breadcrumb,
        },
      });
    });
  }

  /**
   * Create a span for each performance entry. The parent transaction is `this.replayEvent`.
   */
  createPerformanceSpans(entries: ReplayPerformanceEntry[]) {
    entries.forEach(({ type, start, end, name, data }) => {
      this.eventBuffer.addEvent({
        type: EventType.Custom,
        timestamp: start,
        data: {
          tag: 'performanceSpan',
          payload: {
            op: type,
            description: name,
            startTimestamp: start,
            endTimestamp: end,
            data,
          },
        },
      });
    });
  }

  /**
   * Observed performance events are added to `this.performanceEvents`. These
   * are included in the replay event before it is finished and sent to Sentry.
   */
  addPerformanceEntries() {
    // Copy and reset entries before processing
    const entries = [...this.performanceEvents];
    this.performanceEvents = [];

    // Parse the entries
    const entryEvents = createPerformanceEntries(entries);

    // window.performance.memory is a non-standard API and doesn't work on all browsers
    // so we check before creating the event.
    if ('memory' in window.performance) {
      // @ts-expect-error memory doesn't exist on type Performance as the API is non-standard
      entryEvents.push(createMemoryEntry(window.performance.memory));
    }
    this.createPerformanceSpans(entryEvents);
  }

  /**
   *
   *
   * Returns true if session is not expired, false otherwise.
   */
  checkAndHandleExpiredSession(expiry: number = SESSION_IDLE_DURATION) {
    const oldSessionId = this.session.id;

    // This will create a new session if expired, based on expiry length
    this.loadSession({ expiry });

    // Session was expired if session ids do not match
    const isExpired = oldSessionId !== this.session.id;

    if (!isExpired) {
      return true;
    }

    // TODO: We could potentially figure out a way to save the last session,
    // and produce a checkout based on a previous checkout + updates, and then
    // replay the event on top. Or maybe replay the event on top of a refresh
    // snapshot.

    // For now create a new snapshot
    this.triggerFullSnapshot();

    return false;
  }

  /**
   * Only flush if `captureOnlyOnError` is false.
   */
  conditionalFlush(lastActivity?: number) {
    if (this.options.captureOnlyOnError) {
      return;
    }

    return this.flushUpdate(lastActivity);
  }

  /**
   * Flushes replay event buffer to Sentry.
   *
   * Performance events are only added right before flushing - this is probably
   * due to the buffered performance observer events.
   */
  async flushUpdate(lastActivity?: number) {
    if (!this.checkAndHandleExpiredSession()) {
      logger.error(
        new Error('Attempting to finish replay event after session expired.')
      );
      return;
    }

    if (!this.session.id) {
      console.error(new Error('[Sentry]: No transaction, no replay'));
      return;
    }

    this.addPerformanceEntries();

    if (!this.eventBuffer.length) {
      return;
    }

    // Only want to create replay event if session is new
    if (this.needsCaptureReplay) {
      // This event needs to exist before calling `sendReplay`
      captureReplay(this.session, this.initialState);
      this.needsCaptureReplay = false;
    }

    // Reset this to null regardless of `sendReplay` result so that future
    // events will get flushed properly
    this.initialEventTimestampSinceFlush = null;

    try {
      // Save the timestamp before sending replay because `captureEvent` should only be called after successfully uploading a replay
      const timestamp = new Date().getTime();
      const recordingData = await this.eventBuffer.finish();
      await this.sendReplay(this.session.id, recordingData);

      // The below will only happen after successfully sending replay //

      // TBD: Alternatively we could update this after every rrweb event
      // TBD: Should the last activity timestamp here be "now" (after
      // successful upload) or before the upload?
      this.updateLastActivity(lastActivity);

      captureEvent({
        timestamp,
        message: `${REPLAY_EVENT_NAME}-${uuid4().substring(16)}`,
        tags: {
          replayId: this.session.id,
          sequenceId: this.session.sequenceId++,
        },
      });
    } catch (err) {
      console.error(err);
    }
  }

  /**
   * Send replay attachment using either `sendBeacon()` or `fetch()`
   */
  async sendReplayRequest({ endpoint, events }: ReplayRequest) {
    const formData = new FormData();
    const payloadBlob = new Blob([events], {
      type: 'application/json',
    });

    logger.log('blob size in bytes: ', payloadBlob.size);

    formData.append('rrweb', payloadBlob, `rrweb-${new Date().getTime()}.json`);

    // If sendBeacon is supported and payload is smol enough...
    if (supportsSendBeacon() && payloadBlob.size <= 65535) {
      logger.log(`uploading attachment via sendBeacon()`);
      window.navigator.sendBeacon(endpoint, formData);
      return;
    }

    // Otherwise use `fetch`, which *WILL* get cancelled on page reloads/unloads
    logger.log(`uploading attachment via fetch()`);
    await fetch(endpoint, {
      method: 'POST',
      body: formData,
    });
  }

  resetRetries() {
    this.retryCount = 0;
    this.retryInterval = BASE_RETRY_INTERVAL;
  }

  /**
   * Finalize and send the current replay event to Sentry
   */
  async sendReplay(eventId: string, events: Uint8Array | string) {
    // short circuit if there's no events to upload
    if (!events.length) {
      return;
    }

    const client = getCurrentHub().getClient();
    const endpoint = SentryReplay.attachmentUrlFromDsn(
      client.getDsn(),
      eventId
    );

    try {
      await this.sendReplayRequest({
        endpoint,
        events,
      });
      this.resetRetries();
      return true;
    } catch (ex) {
      // we have to catch this otherwise it throws an infinite loop in Sentry
      console.error(ex);

      // If an error happened here, it's likely that uploading the attachment
      // failed, we'll can retry with the same events payload
      if (this.retryCount >= MAX_RETRY_COUNT) {
        this.resetRetries();
        return false;
      }

      this.retryCount = this.retryCount + 1;
      // will retry in intervals of 5, 10, 15, 20, 25 seconds
      this.retryInterval = this.retryCount * this.retryInterval;
      try {
        await new Promise((resolve, reject) => {
          setTimeout(async () => {
            const result = await this.sendReplay(eventId, events);

            if (result) {
              resolve(true);
            } else {
              reject(new Error('Could not send replay'));
            }
          }, this.retryInterval);
        });

        return true;
      } catch {
        return false;
      }
    }
  }
}
