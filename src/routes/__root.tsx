import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { AnalyticsProvider } from "#/components/analytics-provider";
import { AppThemeProvider, THEME_COLORS } from "#/components/theme";
import { Toaster } from "#/components/ui/sonner";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				// `viewport-fit=cover` lets the layout run under the notch and home
				// bar; the safe-area insets in styles.css keep content clear of both.
				name: "viewport",
				content: "width=device-width, initial-scale=1, viewport-fit=cover",
			},
			{
				name: "mobile-web-app-capable",
				content: "yes",
			},
			{
				title: "Eventual · expenses without the spreadsheet",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
			{
				rel: "icon",
				type: "image/svg+xml",
				href: "/logo.svg",
			},
			{
				rel: "icon",
				type: "image/svg+xml",
				href: "/logo-dark.svg",
				media: "(prefers-color-scheme: dark)",
			},
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
				{/*
				 * Written here rather than in `head().meta`: HeadContent keeps one tag
				 * per `name`, so the light variant was being dropped. `ThemeColorSync`
				 * overrides both once the in-app theme is known.
				 */}
				<meta
					name="theme-color"
					media="(prefers-color-scheme: light)"
					content={THEME_COLORS.light}
				/>
				<meta
					name="theme-color"
					media="(prefers-color-scheme: dark)"
					content={THEME_COLORS.dark}
				/>
			</head>
			<body>
				<AnalyticsProvider>
					<AppThemeProvider>
						{children}
						<Toaster richColors />
					</AppThemeProvider>
				</AnalyticsProvider>
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
