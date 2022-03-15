import { record } from 'rrweb';
import type { eventWithTime } from 'rrweb/typings/types';
import * as Sentry from '@sentry/browser';
import { DsnComponents } from '@sentry/types';

type RRWebEvent = eventWithTime;
type RRWebOptions = Parameters<typeof record>[0];

interface SentryReplayConfiguration {
  idleTimeout?: number;
  rrwebConfig?: RRWebOptions;
}

const VISIBILITY_CHANGE_TIMEOUT = 5000;

export class SentryReplay {
  public readonly name: string = SentryReplay.id;
  public static id = 'SentryReplay';
  public events: RRWebEvent[] = [];

  /**
   * The id of the Sentry event attachments will be saved to
   */
  private eventId: string | undefined;
  private readonly rrwebRecordOptions: RRWebOptions;
  private timeout: number;
  private visibilityChangeTimer: number | null;

  private static attachmentUrlFromDsn(dsn: DsnComponents, eventId: string) {
    const { host, path, projectId, port, protocol, user } = dsn;
    return `${protocol}://${host}${port !== '' ? `:${port}` : ''}${
      path !== '' ? `/${path}` : ''
    }/api/${projectId}/events/${eventId}/attachments/?sentry_key=${user}&sentry_version=7&sentry_client=replay`;
  }

  public constructor({
    idleTimeout = 15000,
    rrwebConfig: {
      checkoutEveryNms = 5 * 60 * 1000, // default checkout time of 5 minutes
      maskAllInputs = true,
      ...rrwebRecordOptions
    } = {},
  }: SentryReplayConfiguration = {}) {
    this.rrwebRecordOptions = {
      checkoutEveryNms,
      maskAllInputs,
      ...rrwebRecordOptions,
    };
    this.events = [];

    record({
      ...this.rrwebRecordOptions,
      emit: (event: RRWebEvent, isCheckout?: boolean) => {
        console.log('record', { isCheckout, event });

        // "debounce" by `idleTimeout`, how often we save replay events i.e. we
        // will save events only if 15 seconds have elapsed since the last
        // event
        //
        // TODO: We probably want to have a hard timeout where we save
        // so that it does not grow infinitely and we never have a replay
        // saved
        if (this.timeout) {
          window.clearTimeout(this.timeout);
        }

        // Always create a new Sentry event on checkouts and clear existing rrweb events
        if (isCheckout) {
          this.createEvent();
          this.events = [event];
        } else {
          this.events.push(event);
        }

        // Set timer to send attachment to Sentry, will be cancelled if an
        // event happens before `idleTimeout` elapses
        this.timeout = window.setTimeout(() => {
          console.log('idle timeout hit');
          this.finishReplayEvent();
        }, idleTimeout);
        // TODO:
      },
    });

    this.addListeners();
  }

  private addListeners() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  handleVisibilityChange = () => {
    console.log(
      'visibility change: ',
      document.visibilityState,
      this.visibilityChangeTimer
    );

    if (
      document.visibilityState === 'visible' &&
      this.visibilityChangeTimer === null
    ) {
      // Page has become active/visible again after `VISIBILITY_CHANGE_TIMEOUT`
      // ms have elapsed, which means we will consider this a new session
      this.triggerNewSession();
      return;
    }

    // Send replay when the page/tab becomes hidden
    this.finishReplayEvent();

    // VISIBILITY_CHANGE_TIMEOUT gives the user buffer room it come back to the
    // page before we create a new session.
    this.visibilityChangeTimer = window.setTimeout(() => {
      this.visibilityChangeTimer = null;
    }, VISIBILITY_CHANGE_TIMEOUT);
  };

  /**
   * Get integration's instance on the current hub
   */
  get instance() {
    return Sentry.getCurrentHub().getIntegration(SentryReplay);
  }

  /**
   * Creates a new replay "session". This will create a new Sentry event and
   * then trigger rrweb to take a full snapshot.
   */
  triggerNewSession() {
    console.log('triggering new session');
    record.takeFullSnapshot(true);
  }

  /**
   * Creates the Sentry event that the replays will be saved to
   */
  createEvent() {
    const self = this.instance;

    if (!self) return;

    // TODO: If there's a transaction active, we should attach to that?
    //   --> actually that won't work as-is because we need an event id to upload an attachment
    // const transaction = Sentry.getCurrentHub().getScope().getTransaction();

    // Otherwise create a transaction to attach event to
    const transaction = Sentry.startTransaction({
      name: 'Sentry Replay',
    });

    transaction.setTag('hasReplay', 'true');

    // We have to finish the transaction to get an event ID to be able to
    // upload an attachment for that event
    // @ts-expect-error This returns an eventId (string), but is not typed as such
    self.eventId = transaction.finish();

    return self.eventId;
  }

  finishReplayEvent() {
    const self = this.instance;

    if (!self) return;

    const eventId = self.eventId || this.createEvent();

    if (!eventId) {
      console.error('[Sentry]: No transaction, no replay');
      return;
    }

    this.sendReplay(eventId);
  }

  hasSendBeacon() {
    return 'navigator' in window && 'sendBeacon' in window.navigator;
  }

  async request(endpoint: string, events: RRWebEvent[]) {
    const stringifiedPayload = JSON.stringify({ events });
    const formData = new FormData();
    formData.append(
      'rrweb',
      new Blob([stringifiedPayload], {
        type: 'application/json',
      }),
      `rrweb-${new Date().getTime()}.json`
    );

    // If sendBeacon is supported and payload is smol enough...
    if (this.hasSendBeacon() && stringifiedPayload.length <= 65536) {
      console.log('sending via beacon');
      window.navigator.sendBeacon(endpoint, formData);
      return;
    }

    // Otherwise use `fetch`, which *WILL* get cancelled on page reloads/unloads

    try {
      console.log('sending via fetch');
      await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });
      this.events = [];
    } catch (ex) {
      // we have to catch this otherwise it throws an infinite loop in Sentry
      console.error(ex);
    }
  }

  async sendReplay(eventId: string) {
    const self = this.instance;

    if (!self) return;

    try {
      // short circuit if theres no events to replay
      if (!self.events.length) return;

      const client = Sentry.getCurrentHub().getClient();
      const endpoint = SentryReplay.attachmentUrlFromDsn(
        client.getDsn(),
        eventId
      );

      await this.request(endpoint, self.events);
      self.events = [];
      return true;
    } catch (ex) {
      console.error(ex);
      return false;
    }
  }

  setupOnce() {
    // this.createEvent();
    // Sentry.addGlobalEventProcessor((event: Event) => {});
  }
}
