import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
	ArrowLeft,
	ExternalLink,
	KeyRound,
	MousePointerClick,
} from "lucide-react";

import { BrandLogo } from "#/components/brand-logo";
import { CodeBlock } from "#/components/code-block";
import {
	PublicFooter,
	PublicPage,
	publicSiteActions,
} from "#/components/public-header";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Separator } from "#/components/ui/separator";
import {
	MCP_CLIENT_INTROS,
	MCP_PROMPTS,
	MCP_TOOLS,
	type McpClient,
	mcpClients,
} from "#/lib/mcp-clients";
import { mcpClientOg, ogImageMeta } from "#/lib/og";
import { siteQueryOptions } from "#/lib/queries";
import { useClientUser } from "#/lib/session";
import { SITE_URL } from "#/lib/site";

export const Route = createFileRoute("/docs_/mcp/$client")({
	loader: async ({ context, params }) => {
		const { origin } =
			await context.queryClient.ensureQueryData(siteQueryOptions);
		const all = mcpClients(`${origin}/mcp`);
		const client = all.find((entry) => entry.id === params.client);
		if (!client) throw notFound();
		return {
			client,
			origin,
			others: all
				.filter((entry) => entry.id !== client.id)
				.map(({ id, name, logo }) => ({ id, name, logo })),
		};
	},
	head: ({ loaderData }) => {
		if (!loaderData) return {};
		const { client } = loaderData;
		const url = `${SITE_URL}/docs/mcp/${client.id}`;
		const title = `Use Eventual with ${client.name} (MCP) · Eventual`;
		const description = `Connect ${client.name} to Eventual over MCP to log shared expenses and check who owes whom by asking. ${client.steps.length === 1 ? "One step" : `${client.steps.length} steps`}, one API key.`;
		return {
			meta: [
				{ title },
				{ name: "description", content: description },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
				{ property: "og:type", content: "article" },
				{ property: "og:url", content: url },
				{ property: "og:site_name", content: "Eventual" },
				...ogImageMeta(mcpClientOg(client)),
			],
			links: [{ rel: "canonical", href: url }],
			scripts: [howToJsonLd(client, url)],
		};
	},
	component: McpClientPage,
});

function howToJsonLd(client: McpClient, url: string) {
	return {
		type: "application/ld+json",
		children: JSON.stringify({
			"@context": "https://schema.org",
			"@graph": [
				{
					"@type": "BreadcrumbList",
					itemListElement: [
						{
							"@type": "ListItem",
							position: 1,
							name: "Integrations",
							item: `${SITE_URL}/docs`,
						},
						{
							"@type": "ListItem",
							position: 2,
							name: client.name,
							item: url,
						},
					],
				},
				{
					"@type": "HowTo",
					name: `Use Eventual with ${client.name}`,
					description: MCP_CLIENT_INTROS[client.id],
					url,
					step: [
						"Create an API key under Settings → API keys in Eventual.",
						...client.steps,
					].map((text, index) => ({
						"@type": "HowToStep",
						position: index + 1,
						text,
					})),
				},
			],
		}),
	};
}

function McpClientPage() {
	const { client, origin, others } = Route.useLoaderData();
	const user = useClientUser();

	return (
		<PublicPage
			user={user}
			actions={publicSiteActions(Boolean(user))}
			footer={
				<PublicFooter tagline="Eventual · split it fairly, settle it once.">
					<Link to="/help">Help</Link>
					<Link to="/docs">Integrations</Link>
				</PublicFooter>
			}
			mainClassName="gap-8 py-8 sm:gap-10 sm:py-10"
		>
			<div className="col-read flex flex-col gap-8">
				<Button variant="link" size="sm" className="w-fit px-0" asChild>
					<Link to="/docs" hash="mcp">
						<ArrowLeft data-icon="inline-start" />
						All integrations
					</Link>
				</Button>

				<header className="rise-in flex flex-col gap-4">
					<p className="island-kicker">AI assistants · MCP</p>
					<div className="flex items-center gap-3">
						<BrandLogo brand={client.logo} className="size-9" />
						<h1 className="display-title text-[2.125rem] leading-tight font-bold sm:text-4xl">
							Use Eventual with {client.name}
						</h1>
					</div>
					<p className="text-base text-muted-foreground sm:text-lg">
						{MCP_CLIENT_INTROS[client.id]}
					</p>
				</header>

				<Alert>
					<KeyRound />
					<AlertTitle>Start with an API key</AlertTitle>
					<AlertDescription>
						<p>
							Create one under <Link to="/app/settings/api-keys">API keys</Link>
							. It's only shown once. Give {client.name} its own key so you can
							revoke it without touching your other devices.
						</p>
					</AlertDescription>
				</Alert>

				<section className="flex flex-col gap-4">
					<h2 className="display-title text-2xl font-bold">
						Connect {client.name}
					</h2>
					<ol className="list-decimal space-y-2 pl-5">
						{client.steps.map((step) => (
							<li key={step}>{step}</li>
						))}
					</ol>
					{client.action ? (
						<Button className="w-fit" asChild>
							<a href={client.action.href}>
								<MousePointerClick data-icon="inline-start" />
								{client.action.label}
							</a>
						</Button>
					) : null}
					{client.code ? (
						<CodeBlock
							label={client.code.label}
							code={client.code.value}
							copyLabel={client.code.copyLabel}
						/>
					) : null}
					{client.note ? (
						<p className="text-sm text-muted-foreground">{client.note}</p>
					) : null}
					<p className="text-sm text-muted-foreground">
						The server URL is <code>{origin}/mcp</code>. It accepts{" "}
						<code>x-api-key: ev_…</code> or{" "}
						<code>Authorization: Bearer ev_…</code>.
					</p>
					<Button variant="link" size="sm" className="w-fit px-0" asChild>
						<a href={client.docsUrl} target="_blank" rel="noreferrer">
							{client.name} MCP docs
							<ExternalLink data-icon="inline-end" />
						</a>
					</Button>
				</section>

				<Separator />

				<section className="flex flex-col gap-4">
					<h2 className="display-title text-2xl font-bold">Then just ask</h2>
					<ul className="grid gap-2 sm:grid-cols-2">
						{MCP_PROMPTS.map((prompt) => (
							<li
								key={prompt}
								className="rounded-xl border bg-background/60 p-3 text-sm"
							>
								“{prompt}”
							</li>
						))}
					</ul>
					<p className="text-sm text-muted-foreground">
						Group names are matched against your own groups. Amounts stay in the
						currency you name, and shares always add up to the total.
					</p>
				</section>

				<section className="flex flex-col gap-4">
					<h2 className="display-title text-2xl font-bold">
						What {client.name} can do
					</h2>
					<ul className="grid gap-2 sm:grid-cols-2">
						{MCP_TOOLS.map(([name, text]) => (
							<li
								key={name}
								className="rounded-xl border bg-background/60 p-3 text-sm"
							>
								<code>{name}</code>
								<p className="mt-1 text-muted-foreground">{text}</p>
							</li>
						))}
					</ul>
					<p className="text-sm text-muted-foreground">
						A Transactional key covers all of these. A Custom key with read
						access only can check balances but can't log expenses.
					</p>
				</section>

				<Separator />

				<nav aria-label="Other assistants" className="flex flex-col gap-3">
					<h2 className="font-semibold">Other assistants</h2>
					<ul className="flex flex-wrap gap-2">
						{others.map((other) => (
							<li key={other.id}>
								<Button variant="outline" size="sm" asChild>
									<Link to="/docs/mcp/$client" params={{ client: other.id }}>
										<BrandLogo brand={other.logo} />
										{other.name}
									</Link>
								</Button>
							</li>
						))}
					</ul>
				</nav>
			</div>
		</PublicPage>
	);
}
