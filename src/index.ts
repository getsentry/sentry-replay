import * as Sentry from '@sentry/browser';
import { DsnComponents, Hub, Transaction } from '@sentry/types';
import { uuid4 } from '@sentry/utils';

import { record } from 'rrweb';
import type { eventWithTime } from 'rrweb/typings/types';

type RRWebEvent = eventWithTime;
type RRWebOptions = Parameters<typeof record>[0];

interface SentryReplayConfiguration {
  idleTimeout?: number;
  rrwebConfig?: RRWebOptions;
}

const VISIBILITY_CHANGE_TIMEOUT = 5000;

export class SentryReplay {
  /**
   * @inheritDoc
   */
  public static id = 'SentryReplay';

  /**
   * @inheritDoc
   */
  public name: string = SentryReplay.id;

  /**
   * Buffer of rrweb events that will be serialized as JSON and saved as an attachment to a Sentry event
   */
  public events: RRWebEvent[] = [];

  /**
   * The id of the root Sentry event that all attachments will be saved to
   */
  private eventId: string | undefined;

  /**
   * A unique id per "replay session" (the term is currently not defined yet)
   */
  private replayId: string | undefined;

  /**
   * A Sentry Transaction that should capture every incremental rrweb update,
   * but *not* the attachments themselves. This is currently used to capture
   * breadcrumbs and maybe other spans (e.g. network requests)
   */
  private replayEvent: Transaction | undefined;

  /**
   * Options to pass to rrweb.record
   */
  private readonly rrwebRecordOptions: RRWebOptions;

  /**
   * setTimeout id used for debouncing sending rrweb attachments
   */
  private timeout: number;

  /**
   * timer id used to consider when the page has become inactive (e.g. from switching tags)
   */
  private visibilityChangeTimer: number | null;

  private static attachmentUrlFromDsn(dsn: DsnComponents, eventId: string) {
    const { host, path, projectId, port, protocol, user } = dsn;
    return `${protocol}://${host}${port !== '' ? `:${port}` : ''}${
      path !== '' ? `/${path}` : ''
    }/api/${projectId}/events/${eventId}/attachments/?sentry_key=${user}&sentry_version=7&sentry_client=replay`;
  }

  private _getCurrentHub?: () => Hub;

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
    this.replayId = uuid4();
    this.createReplayEvent();
    this.events = [];

    record({
      ...this.rrwebRecordOptions,
      emit: (event: RRWebEvent, isCheckout?: boolean) => {
        // console.log('record', { isCheckout, event });

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
          this.createRootEvent();
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

  setupOnce() {
    Sentry.addGlobalEventProcessor((event) => {
      event.tags = { ...event.tags, replayId: this.replayId };
      return event;
    });
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
   * Creates the Sentry event that all replays will be saved to as attachments.
   * Currently, we only expect one of these per "replay session" (which is not
   * explicitly defined yet).
   */
  createRootEvent() {
    console.log('create root event');
    const self = this.instance;

    if (!self) return;

    // TODO: If there's a transaction active, we should attach to that?
    //   --> actually that won't work as-is because we need an event id to upload an attachment
    // const transaction = Sentry.getCurrentHub().getScope().getTransaction();

    // Otherwise create a transaction to attach event to
    const transaction = Sentry.getCurrentHub().startTransaction({
      name: 'sentry-replay',
      tags: {
        hasReplay: true,
        replayId: this.replayId,
      },
    });

    // We have to finish the transaction to get an event ID to be able to
    // upload an attachment for that event
    // @ts-expect-error This returns an eventId (string), but is not typed as such
    self.eventId = transaction.finish();

    return self.eventId;
  }

  createReplayEvent() {
    this.replayEvent = Sentry.startTransaction({
      name: 'sentry-replay-event',
      tags: {
        rootReplayId: this.eventId,
        replayId: this.replayId,
      },
    });
    Sentry.configureScope((scope) => scope.setSpan(this.replayEvent));
    return this.replayEvent;
  }

  finishReplayEvent() {
    console.log('finish replay event');
    const self = this.instance;

    if (!self) return;

    const eventId = self.eventId || this.createRootEvent();

    if (!eventId) {
      console.error('[Sentry]: No transaction, no replay');
      return;
    }

    this.sendReplay(eventId);

    // Close out existing replay event and create a new one
    this.replayEvent?.finish();
    this.createReplayEvent();
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

    try {
      // Otherwise use `fetch`, which *WILL* get cancelled on page reloads/unloads
      await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });
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
}
