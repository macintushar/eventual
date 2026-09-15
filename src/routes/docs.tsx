import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
	Bot,
	Download,
	IndianRupee,
	KeyRound,
	UserRound,
	Users,
} from "lucide-react";

import { type Brand, BrandLogo } from "#/components/brand-logo";
import { CodeBlock } from "#/components/code-block";
import { PublicPage, publicSignedOutActions } from "#/components/public-header";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Separator } from "#/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { env } from "#/env";
import { useClientUser } from "#/lib/session";

const getOriginFn = createServerFn({ method: "GET" }).handler(
	() => new URL(env.BETTER_AUTH_URL).origin,
);

export const Route = createFileRoute("/docs")({
	loader: async () => ({
		origin: await getOriginFn(),
	}),
	head: () => ({ meta: [{ title: "Integrations · Eventual" }] }),
	component: DocsPage,
});

const KEY = "ev_your_api_key";

const shortcutSteps = [
	{ icon: Users, title: "Pick the group", text: "Every group you belong to." },
	{ icon: UserRound, title: "Pick who paid", text: "You're listed first." },
	{ icon: IndianRupee, title: "Type the amount", text: "In rupees." },
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
	code?: { label: string; value: string };
	note?: string;
};

function clients(mcp: string): Client[] {
	return [
		{
			id: "claude-code",
			name: "Claude Code",
			logo: "claude",
			steps: [
				"Run this once in your terminal. Use --scope user to share it across projects.",
			],
			code: {
				label: "Terminal",
				value: `claude mcp add --transport http eventual ${mcp} \\\n  --header "x-api-key: ${KEY}"`,
			},
		},
		{
			id: "claude",
			name: "Claude app",
			logo: "claude",
			steps: [
				"Open Settings → Connectors → Add custom connector on claude.ai or Claude Desktop.",
				`Name it Eventual and set the URL to ${mcp}.`,
				"Under Authentication, pick None, then add an x-api-key request header containing your key.",
			],
			note: "Connectors you add on claude.ai also appear in Claude Desktop and mobile.",
		},
		{
			id: "cursor",
			name: "Cursor",
			logo: "cursor",
			steps: [
				"Add this to ~/.cursor/mcp.json, or .cursor/mcp.json for one project.",
			],
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
			},
		},
		{
			id: "opencode",
			name: "OpenCode",
			logo: "opencode",
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
			},
		},
		{
			id: "hermes",
			name: "Hermes",
			logo: "hermes",
			steps: [
				"Add Eventual under mcp_servers in ~/.hermes/config.yaml.",
				"Restart Hermes or run /reload-mcp.",
			],
			code: {
				label: "~/.hermes/config.yaml",
				value: `mcp_servers:\n  eventual:\n    url: "${mcp}"\n    headers:\n      Authorization: "Bearer \${EVENTUAL_API_KEY}"`,
			},
		},
		{
			id: "openclaw",
			name: "OpenClaw",
			logo: "openclaw",
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
			},
		},
	];
}

function DocsPage() {
	const { origin } = Route.useLoaderData();
	const mcp = `${origin}/mcp`;
	const list = clients(mcp);
	const user = useClientUser();

	return (
		<PublicPage
			user={user}
			actions={
				user
					? [
							{ to: "/help", label: "Help", desktopOnly: true },
							{ to: "/app", label: "Open app", desktopOnly: true },
							{
								to: "/app/settings",
								label: "Get an API key",
								shortLabel: "API key",
								variant: "default",
								icon: <KeyRound data-icon="inline-start" />,
							},
						]
					: [
							{ to: "/help", label: "Help", desktopOnly: true },
							...publicSignedOutActions,
						]
			}
			footer="Eventual · expenses without the spreadsheet."
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
						Create one under <Link to="/app/settings">API keys</Link>. It's only
						shown once. Give each device or assistant its own key so you can
						revoke them separately.
					</p>
				</AlertDescription>
			</Alert>

			<Card id="shortcut" className="island-shell scroll-mt-8 rounded-3xl">
				<CardHeader>
					{/* The platform badge wraps under the title rather than
						    squeezing it into two lines on a phone. */}
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
						<BrandLogo brand="shortcuts" className="size-7 shrink-0" />
						<CardTitle className="display-title text-2xl font-bold">
							Apple Shortcut
						</CardTitle>
						<Badge variant="secondary">iPhone · iPad · Mac · Watch</Badge>
					</div>
					<CardDescription>
						Log an expense in three taps. It splits evenly between everyone in
						the group and uses today's date. You can change the split,
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
						<Button size="lg" className="w-fit" asChild>
							<a href="/eventual.shortcut" download>
								<Download data-icon="inline-start" />
								Get the shortcut
							</a>
						</Button>
						<p className="text-sm text-muted-foreground">
							When you add it, Shortcuts asks for two things: your API key and
							this URL.
						</p>
						<CodeBlock label="Eventual URL" code={origin} />
						<p className="text-sm text-muted-foreground">
							Already installed? Download it again and replace the old shortcut
							to get fixes. Tip: say "Hey Siri, log to Eventual", or add it to
							your Home Screen or Action button.
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
								`     { "paidByUserId": "…", "amount": 1200.5, "description": "optional" }`,
							].join("\n")}
						/>
						<ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
							<li>
								Get Contents of URL (groups) → Get Dictionary from Input →
								Choose from List. The chosen item is already the group ID; use
								it directly in the members and expense URLs.
							</li>
							<li>Do the same with the members endpoint to pick who paid.</li>
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
						<CardTitle className="display-title text-2xl font-bold">
							AI assistants (MCP)
						</CardTitle>
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

					<Tabs defaultValue={list[0].id}>
						<TabsList className="h-auto! flex-wrap">
							{list.map((client) => (
								<TabsTrigger key={client.id} value={client.id}>
									<BrandLogo brand={client.logo} />
									{client.name}
								</TabsTrigger>
							))}
						</TabsList>
						{list.map((client) => (
							<TabsContent
								key={client.id}
								value={client.id}
								className="flex flex-col gap-4 pt-2"
							>
								<ol className="list-decimal space-y-1 pl-5 text-sm">
									{client.steps.map((step) => (
										<li key={step}>{step}</li>
									))}
								</ol>
								{client.code ? (
									<CodeBlock
										label={client.code.label}
										code={client.code.value}
									/>
								) : null}
								{client.note ? (
									<p className="text-sm text-muted-foreground">{client.note}</p>
								) : null}
							</TabsContent>
						))}
					</Tabs>

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
		</PublicPage>
	);
}
