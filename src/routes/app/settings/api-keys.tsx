import { createFileRoute } from "@tanstack/react-router";

import { ApiKeys } from "#/components/api-keys";
import { listApiKeysFn } from "#/server/fn/api-keys";

export const Route = createFileRoute("/app/settings/api-keys")({
	head: () => ({ meta: [{ title: "API keys · Eventual" }] }),
	loader: () => listApiKeysFn(),
	component: ApiKeysPage,
});

function ApiKeysPage() {
	return <ApiKeys initialKeys={Route.useLoaderData()} />;
}
