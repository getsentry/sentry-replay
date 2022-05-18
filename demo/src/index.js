import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';
import * as Sentry from '@sentry/browser';
import { SentryReplay } from '@sentry/replay';
import { BrowserTracing } from '@sentry/tracing';

Sentry.init({
  // debug: true,
  // org/project: sentry-emerging-tech/replays
  dsn: 'https://ad94e83103834ef1a5f609276f5e6f7d@o1176005.ingest.sentry.io/6309187',
  environment: 'demo',
  // tracesSampleRate: 1.0,
  integrations: [
    new SentryReplay({ stickySession: false }),
    // new BrowserTracing({
    //   tracingOrigins: ["localhost:3000", "localhost", /^\//],
    // }),
  ],
});

ReactDOM.render(<App />, document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
