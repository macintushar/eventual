import { AsyncLocalStorage } from "node:async_hooks";
import * as Sentry from "@sentry/tanstackstart-react";

import { configureLogging } from "#/lib/logging-config";

const dsn = process.env.SENTRY_DSN;

Sentry.init({
	dsn,
	enableLogs: true,
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

configureLogging({
	contextLocalStorage: new AsyncLocalStorage<Record<string, unknown>>(),
	runtime: "server",
	production: process.env.NODE_ENV === "production",
	sentryEnabled: Boolean(dsn),
	level: process.env.LOG_LEVEL,
});
