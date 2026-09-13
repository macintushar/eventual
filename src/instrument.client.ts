import * as Sentry from "@sentry/tanstackstart-react";

const dsn = import.meta.env.VITE_SENTRY_DSN;

Sentry.init({
	dsn,
	enabled: Boolean(dsn),
	environment: import.meta.env.MODE,
	sendDefaultPii: false,
	tracesSampleRate: import.meta.env.PROD ? 0.1 : 1,
	integrations: [
		Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
	],
	// Keep ambient recording off; retain context only for sessions that error.
	replaysSessionSampleRate: 0,
	replaysOnErrorSampleRate: 1,
	beforeSend(event) {
		if (event.request) {
			delete event.request.data;
			delete event.request.cookies;
			delete event.request.query_string;
			if (event.request.headers) {
				delete event.request.headers.Authorization;
				delete event.request.headers.authorization;
				delete event.request.headers.Cookie;
				delete event.request.headers.cookie;
			}
		}
		return event;
	},
});
