import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';
import * as Sentry from '@sentry/browser';
import { SentryReplay } from '@sentry/replay';
import { BrowserTracing, } from "@sentry/tracing";

Sentry.init({
  // temp: sentry-test/billy-test
  debug: true,
  dsn:
    'https://24f526f0cefc4083b2546207a3f6811d@o19635.ingest.sentry.io/5415672',
  environment: 'demo',
  tracesSampleRate: 1.0,
  integrations: [
    new SentryReplay({idleTimeout: 10000}),
    new BrowserTracing({
      tracingOrigins: ["localhost:3000", "localhost", /^\//],
    }),
  ],
});

ReactDOM.render(<App />, document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
