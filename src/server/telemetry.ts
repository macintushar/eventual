import { PostHog } from "posthog-node";

import { env } from "#/env";
import { runInBackground } from "#/server/background";

export const mcpToolNames = [
	"listGroups",
	"listExpenses",
	"createExpense",
	"getBalances",
] as const;

export type McpToolName = (typeof mcpToolNames)[number];

type MutationAction =
	| "group.create"
	| "group.rename"
	| "group.delete"
	| "group.leave"
	| "member.role"
	| "member.remove"
	| "invitation.create"
	| "invitation.revoke"
	| "invitation.accept"
	| "expense.create"
	| "expense.update"
	| "expense.delete"
	| "share.paid"
	| "settlement.create"
	| "settlement.delete";

type AnalyticsEvent = {
	mcp_request_completed: {
		method: string;
		success: boolean;
		authenticated: boolean;
		duration_ms: number;
	};
	mcp_tool_called: {
		tool_name: McpToolName;
		success: boolean;
		duration_ms: number;
	};
	product_mutation_completed: {
		action: MutationAction;
		surface: "web";
	};
};

let posthog: PostHog | undefined;

function posthogClient() {
	if (!env.POSTHOG_PROJECT_TOKEN) return undefined;
	posthog ??= new PostHog(env.POSTHOG_PROJECT_TOKEN, {
		host: env.POSTHOG_HOST,
		// Vercel functions may stop as soon as the response is returned.
		flushAt: 1,
		flushInterval: 0,
		requestTimeout: 3_000,
		disableGeoip: true,
	});
	return posthog;
}

/**
 * Sends an allow-listed, count-only event. Telemetry is never allowed to fail
 * the product operation it describes.
 */
export function captureEvent<Name extends keyof AnalyticsEvent>(input: {
	event: Name;
	distinctId: string;
	properties: AnalyticsEvent[Name];
	anonymous?: boolean;
}) {
	const client = posthogClient();
	if (!client) return;
	runInBackground(
		client.captureImmediate({
			distinctId: input.distinctId,
			event: input.event,
			properties: {
				...input.properties,
				...(input.anonymous ? { $process_person_profile: false } : {}),
			},
		}),
		{ component: "posthog", event: input.event },
	);
}
