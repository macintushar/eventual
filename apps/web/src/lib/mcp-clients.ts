import type { Brand } from "#/components/brand-logo";

/**
 * MCP setup for each supported client. The Integrations page shows them in a
 * picker; /docs/mcp/<id> gives each its own prerendered page.
 */

export const KEY = "ev_your_api_key";

export const MCP_TOOLS = [
	["listGroups", "Your groups and your balance in each"],
	["listExpenses", "Recent expenses in a group"],
	["listExpensePage", "Older expenses, a page at a time, with filters"],
	["listSettlementPage", "Payment history, a page at a time"],
	["createExpense", "Log an expense with any split method"],
	["getBalances", "Who owes whom, with simplified transfers"],
] as const;

export type McpClient = {
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

export function mcpClients(mcp: string): McpClient[] {
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

/** One line per client for its own page, so no two pages read the same. */
export const MCP_CLIENT_INTROS: Record<string, string> = {
	claude:
		"Add Eventual as a custom connector once on claude.ai, and Claude can log expenses and check balances from the web, Claude Desktop and the Claude mobile app.",
	"chatgpt-desktop":
		"ChatGPT Desktop talks to remote MCP servers over Streamable HTTP. Add Eventual once and ask it to log a bill or tell you who owes what.",
	hermes:
		"Hermes, Nous Research's agent, reads MCP servers from its config file. Point it at Eventual and it can log and look up expenses mid-conversation.",
	opencode:
		"OpenCode is an open-source coding agent for the terminal. Add Eventual as a remote server and log a split without leaving your editor.",
	openclaw:
		"OpenClaw connects to MCP servers from its config or its settings screen. Add Eventual and your assistant can keep the group's tab for you.",
	"claude-code":
		"One terminal command adds Eventual to Claude Code for every project, so you can log the team lunch from the same window you code in.",
	codex:
		"Codex CLI stores MCP servers in a config it shares with ChatGPT Desktop and the Codex IDE extension. Add Eventual once and use it in all three.",
	cursor:
		"Cursor can install Eventual in one click. Then ask its agent to log an expense or settle a balance while you work.",
};

export const MCP_PROMPTS = [
	"Mac paid ₹3,600 for dinner in Goa weekend, split it evenly.",
	"Who owes me money, and how much?",
	"Log €84 for groceries in Flat 4B, paid by me, 2:1:1.",
	"What did we spend in baht on the Bangkok trip?",
];
