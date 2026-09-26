import { createFileRoute } from "@tanstack/react-router";

import { ApiKeys } from "#/components/api-keys";
import { apiKeysQueryOptions } from "#/lib/queries";

export const Route = createFileRoute("/app/settings/api-keys")({
	head: () => ({ meta: [{ title: "API keys · Eventual" }] }),
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(apiKeysQueryOptions),
	component: ApiKeysPage,
});

function ApiKeysPage() {
	return <ApiKeys />;
}
