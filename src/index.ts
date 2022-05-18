import * as Sentry from '@sentry/browser';
import { REPLAY_EVENT_NAME, SESSION_IDLE_DURATION } from './session/constants';
import { getSession } from './session/getSession';
import { ReplaySession } from './session/types';
import { record } from 'rrweb';
import { dateTimestampInSeconds, uuid4 } from '@sentry/utils';
import { createEvent } from './util/createEvent';
import { sendEvent } from './util/sendEvent';

interface PluginOptions {
  /**
   * The amount of time to wait before sending a replay
   */
  uploadMinDelay?: number;

  /**
   * The max amount of time to wait before sending a replay
   */
  uploadMaxDelay?: number;

  /**
   * If false, will create a new session per pageload
   */
  stickySession?: boolean;
}
type RRWebOptions = Parameters<typeof record>[0];

interface SentryReplayConfiguration extends PluginOptions {
  /**
   * Options for `rrweb.recordsetup
   */
  rrwebConfig?: RRWebOptions;
}

export class SentryReplay {
  session: ReplaySession;
  readonly rrwebRecordOptions: RRWebOptions;
  readonly options: PluginOptions;

  breadcrumbs: [];
  constructor({
    uploadMinDelay = 5000,
    uploadMaxDelay = 15000,
    stickySession = false, // TBD: Making this opt-in for now
    rrwebConfig: {
      maskAllInputs = true,
      blockClass = 'sr-block',
      ignoreClass = 'sr-ignore',
      maskTextClass = 'sr-mask',
      ...rrwebRecordOptions
    } = {},
  }: SentryReplayConfiguration = {}) {
    this.rrwebRecordOptions = {
      maskAllInputs,
      blockClass,
      ignoreClass,
      maskTextClass,
      ...rrwebRecordOptions,
    };

    this.options = { uploadMinDelay, uploadMaxDelay, stickySession };
    // this.events = [];
  }

  setupOnce() {
    window.setTimeout(() => this.setup());
  }

  loadSession({ expiry }: { expiry: number }): void {
    this.session = getSession({
      expiry,
      stickySession: this.options.stickySession,
    });
  }

  async setup() {
    this.loadSession({ expiry: SESSION_IDLE_DURATION });
    const hub = Sentry.getCurrentHub();
    const { scope, client } = hub.getStackTop();
    scope.addScopeListener((scope) => {
      this.breadcrumbs.push(scope._breadcrumbs[scope._breadcrumbs.length - 1]);
    });

    record({
      ...this.rrwebRecordOptions,
      emit: (event: RRWebEvent, isCheckout?: boolean) => {
        // We want to batch uploads of replay events. Save events only if
        // `<uploadMinDelay>` milliseconds have elapsed since the last event
        // *OR* if `<uploadMaxDelay>` milliseconds have elapsed.

        const now = new Date().getTime();

        // Timestamp of the first replay event since the last flush, this gets
        // reset when we finish the replay event
        // if (!this.initialEventTimestampSinceFlush) {
        //   this.initialEventTimestampSinceFlush = now;
        // }

        // Do not finish the replay event if we receive a new replay event
        // if (this.timeout) {
        //   window.clearTimeout(this.timeout);
        // }

        // If this is false, it means session is expired, create and a new session and wait for checkout
        // if (!this.checkAndHandleExpiredSession()) {
        //   logger.error(
        //     new Error('Received replay event after session expired.')
        //   );

        //   return;
        // }

        // We need to clear existing events on a checkout, otherwise they are
        // incremental event updates and should be appended
        if (isCheckout) {
          this.events = [event];
        } else {
          this.events.push(event);
        }

        // This event type is a fullsnapshot, we should save immediately when this occurs
        // See https://github.com/rrweb-io/rrweb/blob/d8f9290ca496712aa1e7d472549480c4e7876594/packages/rrweb/src/types.ts#L16
        if (event.type === 2) {
          // A fullsnapshot happens on initial load and if we need to start a
          // new replay due to idle timeout. In the latter case, a new session *should* have been started
          // before triggering a new checkout
          // this.finishReplayEvent();
          return;
        }

        // const uploadMaxDelayExceeded = isExpired(
        //   this.initialEventTimestampSinceFlush,
        //   this.options.uploadMaxDelay,
        //   now
        // );

        // If `uploadMaxDelayExceeded` is true, then we should finish the replay event immediately,
        // Otherwise schedule it to be finished in `this.options.uploadMinDelay`
        // if (uploadMaxDelayExceeded) {
        //   logger.log('replay max delay exceeded, finishing replay event');
        //   this.finishReplayEvent();
        //   return;
        // }

        // Set timer to finish replay event and send replay attachment to
        // Sentry. Will be cancelled if an event happens before `uploadMinDelay`
        // elapses.
        // this.timeout = window.setTimeout(() => {
        //   logger.log('replay timeout exceeded, finishing replay event');
        //   this.finishReplayEvent();
        // }, this.options.uploadMinDelay);
      },
    });

    setInterval(() => {
      console.log(this.session);
      const event = createEvent(
        uuid4(),
        REPLAY_EVENT_NAME,
        uuid4(),
        uuid4().substring(16),
        { replayId: this.session.id },
        this.breadcrumbs
      );
    });
    //   console.log(event);
    //   sendEvent(event);
    //   console.log('creating update event');
    //   this.breadcrumbs = [];
    // }, 5000);
  }
}
