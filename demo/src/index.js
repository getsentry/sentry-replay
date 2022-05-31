import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';
import * as Sentry from '@sentry/browser';
// import { BrowserTracing } from '@sentry/tracing';

import { SentryReplay } from '@sentry/replay';

Sentry.init({
  // debug: true,
  // org/project: sentry-emerging-tech/replays
  dsn: 'http://c695ee8814214e3f90bcc13420c0ca3d@localhost:3001/3',
  environment: 'demo',
  tracesSampleRate: 1.0,
  integrations: [
    new SentryReplay({ stickySession: true }),
    // new BrowserTracing({
    //   tracingOrigins: ['localhost:3000', 'localhost', /^\//],
    // }),
  ],
});

ReactDOM.render(<App />, document.getElementById('root'));
// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
