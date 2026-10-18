import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Banknote,
	Bot,
	Braces,
	Download,
	ExternalLink,
	KeyRound,
	MessageSquareText,
	MousePointerClick,
	Package,
	Smartphone,
	Zap,
} from "lucide-react";
import { useState } from "react";

import { BrandLogo } from "#/components/brand-logo";
import { CodeBlock } from "#/components/code-block";
import { SOURCE_URL } from "#/components/legal-page";
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
import { MCP_TOOLS, mcpClients } from "#/lib/mcp-clients";
import { OG_IMAGES, ogImageMeta } from "#/lib/og";
import { siteQueryOptions } from "#/lib/queries";
import { useClientUser } from "#/lib/session";
import { SITE_URL } from "#/lib/site";

export const Route = createFileRoute("/docs")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(siteQueryOptions),
	head: () => ({
		meta: [
			{
				title:
					"Integrations: mobile app, Shortcut, MCP, SDK and API · Eventual",
			},
			{
				name: "description",
				content:
					"Use Eventual on iPhone and Android, log expenses with the Apple Shortcut, connect Claude, Cursor and other AI assistants over MCP, or build on the typed SDK and REST API.",
			},
			{
				property: "og:title",
				content: "Integrations · Eventual",
			},
			{
				property: "og:description",
				content:
					"Use Eventual on iPhone and Android, log expenses with the Apple Shortcut, connect Claude, Cursor and other AI assistants over MCP, or build on the typed SDK and REST API.",
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
			...ogImageMeta(OG_IMAGES.docs),
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

const shortcutSteps = [
	{
		icon: Banknote,
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

function DocsPage() {
	const { origin } = useSuspenseQuery(siteQueryOptions).data;
	const mcp = `${origin}/mcp`;
	const list = mcpClients(mcp);
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
				<PublicFooter tagline="Eventual · split it fairly, settle it once.">
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
					Use the iPhone and Android app, log an expense with a Shortcut, ask an
					AI assistant, or write your own code. The Shortcut, assistants and
					your own code each sign in with an API key from your account.
				</p>
			</section>

			<Card id="mobile" className="island-shell scroll-mt-8 rounded-3xl">
				<CardHeader>
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
						<Smartphone className="size-5 text-primary" aria-hidden="true" />
						<h2 className="display-title text-2xl leading-none font-bold">
							iPhone and Android app
						</h2>
						<Badge variant="secondary">Build from source</Badge>
					</div>
					<CardDescription>
						The native app covers everything on the web: groups, expenses,
						settling up with a UPI handoff, invites, recurring expenses and
						notifications. You sign in with your normal account, so it doesn't
						need an API key.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<p className="text-sm text-muted-foreground">
						It isn't in the App Store or Play Store yet. Build it on your own
						machine with Xcode or Android Studio. It opens on hosted Eventual,
						and you can switch to this server with Change on the sign-in screen.
						Android builds are less tested than iOS so far.
					</p>
					<CodeBlock
						label="Build and run (from the repository root)"
						code={[
							`git clone ${SOURCE_URL}.git && cd eventual`,
							"bun install",
							"bun run --cwd apps/mobile ios      # or: android",
						].join("\n")}
					/>
					<CodeBlock label="Server address" code={origin} />
					<Button variant="link" size="sm" className="w-fit px-0" asChild>
						<a
							href={`${SOURCE_URL}/tree/main/apps/mobile`}
							target="_blank"
							rel="noreferrer"
						>
							Mobile app README
							<ExternalLink data-icon="inline-end" />
						</a>
					</Button>
				</CardContent>
			</Card>

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
					</div>
				</CardContent>
			</Card>

			<Card id="sdk" className="island-shell scroll-mt-8 rounded-3xl">
				<CardHeader>
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
						<Package className="size-5 text-primary" aria-hidden="true" />
						<h2 className="display-title text-2xl leading-none font-bold">
							TypeScript SDK
						</h2>
						<Badge variant="secondary">@eventual/sdk</Badge>
					</div>
					<CardDescription>
						The web and mobile apps both call the API through a typed{" "}
						<code>fetch</code> client. You can use it too. Every endpoint name,
						input and output is checked against shared Zod schemas, so a typo
						fails at compile time instead of at runtime. It runs in browsers,
						Node, Bun and React Native.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<CodeBlock
						label="TypeScript"
						code={[
							'import { createEventualClient } from "@eventual/sdk";',
							"",
							"const eventual = createEventualClient({",
							`  baseUrl: "${origin}",`,
							"  apiKey: process.env.EVENTUAL_API_KEY,",
							"});",
							"",
							'const groups = await eventual.call("group.list");',
						].join("\n")}
					/>
					<p className="text-sm text-muted-foreground">
						The SDK isn't on npm yet. It lives in <code>packages/sdk</code>{" "}
						alongside <code>@eventual/schemas</code>. Add it to your project
						from the repository.
					</p>
					<Button variant="link" size="sm" className="w-fit px-0" asChild>
						<a
							href={`${SOURCE_URL}/tree/main/packages/sdk`}
							target="_blank"
							rel="noreferrer"
						>
							SDK source
							<ExternalLink data-icon="inline-end" />
						</a>
					</Button>
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
