import {
	type ContextLocalStorage,
	configureSync,
	defaultConsoleFormatter,
	getConsoleSink,
	jsonLinesFormatter,
	type LogLevel,
} from "@logtape/logtape";
import { getSentrySink } from "@logtape/sentry";
import * as Sentry from "@sentry/tanstackstart-react";
import { getAppLogger, withLogRedaction } from "#/lib/logging";

export function configureLogging(options: {
	runtime: "client" | "server";
	production: boolean;
	sentryEnabled: boolean;
	level?: string;
	contextLocalStorage?: ContextLocalStorage<Record<string, unknown>>;
}) {
	const levels: LogLevel[] = [
		"trace",
		"debug",
		"info",
		"warning",
		"error",
		"fatal",
	];
	const lowestLevel = levels.includes(options.level as LogLevel)
		? (options.level as LogLevel)
		: options.production
			? "info"
			: "debug";
	configureSync<string, string>({
		contextLocalStorage: options.contextLocalStorage,
		reset: true,
		sinks: {
			console: withLogRedaction(
				getConsoleSink({
					formatter:
						options.runtime === "server" && options.production
							? (record) => [jsonLinesFormatter(record).trimEnd()]
							: (record) => [
									...defaultConsoleFormatter(record),
									record.properties,
								],
				}),
			),
			...(options.sentryEnabled
				? {
						sentry: withLogRedaction(
							getSentrySink({
								sentry: Sentry,
								breadcrumbs: { level: "debug", maxLevel: "info" },
								logs: { level: lowestLevel },
							}),
						),
					}
				: {}),
		},
		loggers: [
			{
				category: ["eventual"],
				lowestLevel,
				sinks: options.sentryEnabled ? ["console", "sentry"] : ["console"],
			},
			{
				category: ["logtape", "meta"],
				lowestLevel: "warning",
				sinks: ["console"],
			},
		],
	});
	getAppLogger("lifecycle").info("Logging initialized", {
		runtime: options.runtime,
		lowestLevel,
		sentryEnabled: options.sentryEnabled,
	});
}
