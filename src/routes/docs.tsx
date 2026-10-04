import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Bot,
	Braces,
	Download,
	ExternalLink,
	IndianRupee,
	KeyRound,
	MessageSquareText,
	MousePointerClick,
	Zap,
} from "lucide-react";
import { useState } from "react";

import { type Brand, BrandLogo } from "#/components/brand-logo";
import { CodeBlock } from "#/components/code-block";
import { OptionCombobox } from "#/components/option-combobox";
import {
	PublicFooter,
	PublicPage,
	publicSiteActions,
} from "#/components/public-header";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
} from "#/components/ui/card";
import { Separator } from "#/components/ui/separator";
import { siteQueryOptions } from "#/lib/queries";
import { useClientUser } from "#/lib/session";
import { SITE_URL } from "#/lib/site";

export const Route = createFileRoute("/docs")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(siteQueryOptions),
	head: () => ({
		meta: [
			{ title: "Integrations · Eventual" },
			{
				name: "description",
				content:
					"Log expenses from your iPhone with the Apple Shortcut, or connect Eventual to Claude, Cursor and other AI assistants over MCP.",
			},
			{
				property: "og:title",
				content: "Integrations · Eventual",
			},
			{
				property: "og:description",
				content:
					"Log expenses from your iPhone with the Apple Shortcut, or connect Eventual to Claude, Cursor and other AI assistants over MCP.",
			},
			{
				property: "og:type",
				content: "website",
			},
			{
				property: "og:url",
				content: `${SITE_URL}/docs`,
			},
			{
				property: "og:site_name",
				content: "Eventual",
			},
			{
				name: "twitter:card",
				content: "summary",
			},
		],
		links: [
			{
				rel: "canonical",
				href: `${SITE_URL}/docs`,
			},
		],
	}),
	component: DocsPage,
});

const KEY = "ev_your_api_key";

const shortcutSteps = [
	{
		icon: IndianRupee,
		title: "Type the amount",
		text: "That's the whole ask. Your group is remembered, the payer is you.",
	},
	{
		icon: Zap,
		title: "One tap from the Action Button",
		text: "Map it under Settings → Action Button → Shortcut.",
	},
	{
		icon: MessageSquareText,
		title: "Or forward a bank SMS",
		text: "Share it, copy it first, or automate on the sender. It reads the amount and merchant.",
	},
];

const tools = [
	["listGroups", "Your groups and your balance in each"],
	["listExpenses", "Recent expenses in a group"],
	["createExpense", "Log an expense with any split method"],
	["getBalances", "Who owes whom, with simplified transfers"],
] as const;

type Client = {
	id: string;
	name: string;
	logo: Brand;
	steps: string[];
	docsUrl: string;
	code?: { label: string; value: string; copyLabel: string };
	action?: { label: string; href: string };
	note?: string;
};

function cursorInstallUrl(mcp: string) {
	const config = btoa(
		JSON.stringify({ url: mcp, headers: { "x-api-key": KEY } }),
	);
	return `https://cursor.com/install-mcp?name=eventual&config=${encodeURIComponent(config)}`;
}

function clients(mcp: string): Client[] {
	return [
		{
			id: "claude",
			name: "Claude Desktop",
			logo: "claude",
			docsUrl: "https://claude.com/docs/connectors/custom/remote-mcp",
			steps: [
				"Open Settings → Connectors → Add custom connector on claude.ai or Claude Desktop.",
				`Name it Eventual and set the URL to ${mcp}.`,
				"Under Authentication, pick None, then add an x-api-key request header containing your key.",
			],
			code: {
				label: "Connector details",
				value: `Name: Eventual\nURL: ${mcp}\nAuthentication: None\nRequest header: x-api-key: ${KEY}`,
				copyLabel: "Copy details",
			},
			note: "Connectors you add on claude.ai also appear in Claude Desktop and mobile.",
		},
		{
			id: "chatgpt-desktop",
			name: "ChatGPT Desktop",
			logo: "openai",
			docsUrl: "https://developers.openai.com/codex/extend/mcp",
			steps: [
				"Open Settings → MCP servers → Add server.",
				"Choose Streamable HTTP and enter the values below.",
				"Save the server, then restart ChatGPT.",
			],
			code: {
				label: "Server details",
				value: `Name: Eventual\nTransport: Streamable HTTP\nURL: ${mcp}\nBearer token: ${KEY}`,
				copyLabel: "Copy details",
			},
			note: "ChatGPT Desktop, Codex CLI and the Codex IDE extension share this MCP configuration.",
		},
		{
			id: "hermes",
			name: "Hermes",
			logo: "hermes",
			docsUrl:
				"https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp",
			steps: [
				"Add Eventual under mcp_servers in ~/.hermes/config.yaml.",
				"Restart Hermes or run /reload-mcp.",
			],
			code: {
				label: "~/.hermes/config.yaml",
				value: `mcp_servers:\n  eventual:\n    url: "${mcp}"\n    headers:\n      Authorization: "Bearer \${EVENTUAL_API_KEY}"`,
				copyLabel: "Copy config",
			},
		},
		{
			id: "opencode",
			name: "OpenCode",
			logo: "opencode",
			docsUrl: "https://opencode.ai/docs/mcp-servers/",
			steps: [
				"Add a remote server to opencode.json in your project or ~/.config/opencode/.",
			],
			code: {
				label: "opencode.json",
				value: JSON.stringify(
					{
						$schema: "https://opencode.ai/config.json",
						mcp: {
							eventual: {
								type: "remote",
								url: mcp,
								enabled: true,
								headers: { "x-api-key": KEY },
							},
						},
					},
					null,
					2,
				),
				copyLabel: "Copy config",
			},
		},
		{
			id: "openclaw",
			name: "OpenClaw",
			logo: "openclaw",
			docsUrl: "https://docs.openclaw.ai/tools/mcp",
			steps: [
				"Add Eventual to the mcp.servers block of your OpenClaw config, or paste the same values into Settings → MCP.",
			],
			code: {
				label: "OpenClaw config",
				value: JSON.stringify(
					{
						mcp: {
							servers: {
								eventual: {
									url: mcp,
									transport: "streamable-http",
									headers: { Authorization: `Bearer ${KEY}` },
								},
							},
						},
					},
					null,
					2,
				),
				copyLabel: "Copy config",
			},
		},
		{
			id: "claude-code",
			name: "Claude Code",
			logo: "claude",
			docsUrl: "https://code.claude.com/docs/en/mcp",
			steps: [
				"Run this once in your terminal to add Eventual for every project.",
			],
			code: {
				label: "Terminal",
				value: `claude mcp add --transport http --scope user eventual ${mcp} \\\n  --header "x-api-key: ${KEY}"`,
				copyLabel: "Copy command",
			},
		},
		{
			id: "codex",
			name: "Codex",
			logo: "codex",
			docsUrl: "https://developers.openai.com/codex/extend/mcp",
			steps: [
				"Replace the placeholder, save EVENTUAL_API_KEY in your shell profile, then run the command.",
				"The server also appears in ChatGPT Desktop and the Codex IDE extension.",
			],
			code: {
				label: "Terminal",
				value: `export EVENTUAL_API_KEY="${KEY}"\ncodex mcp add eventual --url ${mcp} \\\n  --bearer-token-env-var EVENTUAL_API_KEY`,
				copyLabel: "Copy command",
			},
		},
		{
			id: "cursor",
			name: "Cursor",
			logo: "cursor",
			docsUrl: "https://cursor.com/docs/context/mcp",
			steps: [
				"Install the server, then replace ev_your_api_key in the generated config with your API key.",
				"You can also copy the config into ~/.cursor/mcp.json, or .cursor/mcp.json for one project.",
			],
			action: {
				label: "Install in Cursor",
				href: cursorInstallUrl(mcp),
			},
			code: {
				label: "~/.cursor/mcp.json",
				value: JSON.stringify(
					{
						mcpServers: {
							eventual: { url: mcp, headers: { "x-api-key": KEY } },
						},
					},
					null,
					2,
				),
				copyLabel: "Copy config",
			},
		},
	];
}

function DocsPage() {
	const { origin } = useSuspenseQuery(siteQueryOptions).data;
	const mcp = `${origin}/mcp`;
	const list = clients(mcp);
	const [clientId, setClientId] = useState(list[0].id);
	const selectedClient =
		list.find((client) => client.id === clientId) ?? list[0];
	const clientOptions = list.map((client) => ({
		value: client.id,
		label: client.name,
		media: <BrandLogo brand={client.logo} />,
	}));
	const user = useClientUser();

	return (
		<PublicPage
			user={user}
			actions={publicSiteActions(Boolean(user))}
			footer={
				<PublicFooter tagline="Eventual · expenses without the spreadsheet.">
					<Link to="/help">Help</Link>
					<Link to="/api/docs">API</Link>
				</PublicFooter>
			}
			mainClassName="gap-8 py-8 sm:gap-10 sm:py-10"
		>
			<section className="rise-in max-w-2xl">
				<p className="island-kicker">Integrations</p>
				<h1 className="display-title mt-4 text-[2.125rem] leading-tight font-bold sm:text-4xl md:text-5xl">
					Log it where you already are.
				</h1>
				<p className="mt-4 text-base text-muted-foreground sm:text-lg">
					Log an expense from your iPhone, or ask an AI assistant to do it. Each
					integration signs in with an API key from your account.
				</p>
			</section>

			<Alert>
				<KeyRound />
				<AlertTitle>Start with an API key</AlertTitle>
				<AlertDescription>
					<p>
						Create one under <Link to="/app/settings/api-keys">API keys</Link>.
						It's only shown once. Give each device or assistant its own key so
						you can revoke them separately.
					</p>
				</AlertDescription>
			</Alert>

			<Card id="shortcut" className="island-shell scroll-mt-8 rounded-3xl">
				<CardHeader>
					{/* The platform badge wraps under the title rather than
						    squeezing it into two lines on a phone. */}
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
						<BrandLogo brand="shortcuts" className="size-7 shrink-0" />
						<h2 className="display-title text-2xl leading-none font-bold">
							Apple Shortcut
						</h2>
						<Badge variant="secondary">iPhone · iPad · Mac · Watch</Badge>
					</div>
					<CardDescription>
						Log an expense in one prompt. It splits evenly between everyone in
						the group and uses today's date. You can change the split, payer,
						description or date in the app later.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-6">
					<ol className="grid gap-3 sm:grid-cols-3">
						{shortcutSteps.map(({ icon: Icon, title, text }, index) => (
							<li
								key={title}
								className="flex items-start gap-3 rounded-2xl border bg-background/60 p-4"
							>
								<div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
									<Icon className="size-4" aria-hidden="true" />
								</div>
								<div>
									<p className="text-xs text-muted-foreground">
										Step {index + 1}
									</p>
									<p className="font-semibold">{title}</p>
									<p className="text-sm text-muted-foreground">{text}</p>
								</div>
							</li>
						))}
					</ol>

					<div className="flex flex-col gap-3">
						<div className="flex flex-wrap gap-3">
							<Button size="lg" className="w-fit" asChild>
								<a href="/eventual.shortcut" download>
									<Download data-icon="inline-start" />
									Get the shortcut
								</a>
							</Button>
							<Button size="lg" variant="outline" className="w-fit" asChild>
								<a href="/eventual-ai.shortcut" download>
									<Download data-icon="inline-start" />
									Get the AI shortcut
								</a>
							</Button>
						</div>
						<p className="text-sm text-muted-foreground">
							When you add it, Shortcuts asks for two things: your API key and
							this URL.
						</p>
						<CodeBlock label="Eventual URL" code={origin} />
						<p className="text-sm text-muted-foreground">
							Already installed? Download it again and replace the old shortcut
							to get fixes. You can also run it with Siri or assign it to the
							Action Button.
						</p>
					</div>

					<Separator />

					<div className="flex flex-col gap-3">
						<h3 className="font-semibold">Extract from Messages with AI</h3>
						<p className="text-sm text-muted-foreground">
							The separate AI shortcut needs an iPhone with Apple Intelligence
							enabled. It cannot read your inbox or search old messages on its
							own; you must give it text from a new-message automation, or copy
							an older message and run it manually. It is not available on
							Watch.
						</p>
						<ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
							<li>
								Install “Get the AI shortcut” above and enter your API key and
								Eventual URL.
							</li>
							<li>
								In Shortcuts, open Automation → New Automation → Message. Select
								your bank’s sender; optionally add a “Message Contains” filter
								for its debit alerts.
							</li>
							<li>
								Add Run Shortcut, choose the AI shortcut, and set its input to
								the received message’s <strong>body/content</strong> from the
								automation. Selecting the shortcut alone does not pass the SMS.
							</li>
							<li>
								Test with a real or sample bank alert and check the resulting
								expense. Only then enable Run Immediately if you want unattended
								logging; otherwise keep the automation interactive.
							</li>
						</ol>
						<p className="text-sm text-muted-foreground">
							The AI shortcut asks Apple Intelligence for an amount, currency,
							description and optional group. It uses a named group only when it
							exactly matches one of yours; otherwise it uses your saved group,
							your sole group, or asks. It sends those extracted fields to
							Eventual, where the payer is you and the expense is split evenly
							across the group. The bank message itself is not sent to Eventual.
							A notification reports success or failure.
						</p>
						<p className="text-sm text-muted-foreground">
							For an older SMS, copy its text in Messages, run the AI shortcut,
							and check the pre-filled “What did you spend?” prompt. You can
							also dictate a phrase such as “goa dinner 1200”. AI can misread
							amounts or classify a balance, credit or OTP incorrectly, so
							review expenses—especially before using unattended automation.
						</p>
					</div>

					<Separator />

					<div className="flex flex-col gap-3">
						<h3 className="font-semibold">Build it yourself</h3>
						<p className="text-sm text-muted-foreground">
							The shortcut uses three endpoints. Send your key in an{" "}
							<code>x-api-key</code> header. The first two return a{" "}
							<code>{"{ label: id }"}</code> dictionary, which works directly
							with Choose from List.
						</p>
						<CodeBlock
							label="Endpoints"
							code={[
								`GET  ${origin}/api/shortcut/groups`,
								`GET  ${origin}/api/shortcut/groups/{groupId}/members`,
								`POST ${origin}/api/shortcut/groups/{groupId}/expenses`,
								`     { "amount": 1200.5, "currency": "INR", "description": "optional",`,
								`       "paidByUserId": "optional, defaults to you" }`,
							].join("\n")}
						/>
						<ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
							<li>
								Get Contents of URL (groups) → Get Dictionary from Input →
								Choose from List. The chosen item is already the group ID; use
								it directly in the expense URL.
							</li>
							<li>
								The payer defaults to you. Only call the members endpoint if you
								want to log for someone else.
							</li>
							<li>
								Ask for Input (Number), then POST the expense with a JSON body.
							</li>
							<li>
								Show Notification with the <code>message</code> field. It says
								what was logged, or why it wasn't.
							</li>
						</ol>
					</div>
				</CardContent>
			</Card>

			<Card id="mcp" className="island-shell scroll-mt-8 rounded-3xl">
				<CardHeader>
					<div className="flex items-center gap-2">
						<Bot className="size-5 text-primary" aria-hidden="true" />
						<h2 className="display-title text-2xl leading-none font-bold">
							AI assistants (MCP)
						</h2>
					</div>
					<CardDescription>
						Connect any assistant that supports MCP. Then just say "Mac paid
						₹3,600 for dinner in Goa weekend, split it evenly" or "Who owes me
						money?"
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-6">
					<CodeBlock label="MCP server URL (Streamable HTTP)" code={mcp} />
					<p className="text-sm text-muted-foreground">
						Authenticate with <code>x-api-key: ev_…</code> or{" "}
						<code>Authorization: Bearer ev_…</code>, whichever your client
						supports.
					</p>

					<OptionCombobox
						options={clientOptions}
						value={clientId}
						onValueChange={(value) => {
							if (value) setClientId(value);
						}}
						placeholder="Select an app"
						className="w-full sm:w-72"
					/>

					<div className="flex flex-col gap-4 pt-2">
						<ol className="list-decimal space-y-1 pl-5 text-sm">
							{selectedClient.steps.map((step) => (
								<li key={step}>{step}</li>
							))}
						</ol>
						<div className="flex flex-wrap items-center gap-2">
							{selectedClient.action ? (
								<Button asChild>
									<a href={selectedClient.action.href}>
										<MousePointerClick data-icon="inline-start" />
										{selectedClient.action.label}
									</a>
								</Button>
							) : null}
							<Button variant="link" size="sm" asChild>
								<a
									href={selectedClient.docsUrl}
									target="_blank"
									rel="noreferrer"
								>
									MCP setup docs
									<ExternalLink data-icon="inline-end" />
								</a>
							</Button>
						</div>
						{selectedClient.code ? (
							<CodeBlock
								label={selectedClient.code.label}
								code={selectedClient.code.value}
								copyLabel={selectedClient.code.copyLabel}
							/>
						) : null}
						{selectedClient.note ? (
							<p className="text-sm text-muted-foreground">
								{selectedClient.note}
							</p>
						) : null}
					</div>

					<Separator />

					<div className="flex flex-col gap-3">
						<h3 className="font-semibold">Tools</h3>
						<ul className="grid gap-2 sm:grid-cols-2">
							{tools.map(([name, text]) => (
								<li
									key={name}
									className="rounded-xl border bg-background/60 p-3 text-sm"
								>
									<code>{name}</code>
									<p className="mt-1 text-muted-foreground">{text}</p>
								</li>
							))}
						</ul>
					</div>
				</CardContent>
			</Card>

			<Card id="api" className="island-shell scroll-mt-8 rounded-3xl">
				<CardHeader>
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
						<Braces className="size-5 text-primary" aria-hidden="true" />
						<h2 className="display-title text-2xl leading-none font-bold">
							REST API
						</h2>
						<Badge variant="secondary">OpenAPI 3.1</Badge>
					</div>
					<CardDescription>
						Building something of your own? Everything the app can do, from
						groups and expenses to balances and settling up, is available over
						HTTP with the same API key.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<CodeBlock label="Base URL" code={`${origin}/api`} />
					<div className="flex flex-wrap items-center gap-2">
						<Button className="press" asChild>
							<Link to="/api/docs">
								Open the API reference
								<ArrowRight data-icon="inline-end" />
							</Link>
						</Button>
						<Button variant="link" size="sm" asChild>
							<a href="/api/openapi.json" target="_blank" rel="noreferrer">
								OpenAPI spec (JSON)
								<ExternalLink data-icon="inline-end" />
							</a>
						</Button>
					</div>
				</CardContent>
			</Card>
		</PublicPage>
	);
}
