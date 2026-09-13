import * as Sentry from "@sentry/tanstackstart-react";

const dsn = process.env.SENTRY_DSN;

Sentry.init({
	dsn,
	enabled: Boolean(dsn),
	environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
	release: process.env.VERCEL_GIT_COMMIT_SHA,
	sendDefaultPii: false,
	tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
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
