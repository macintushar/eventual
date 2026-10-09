import { Moon, Sun } from "lucide-react";
import { ThemeProvider, useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "#/components/ui/button";

/** Status bar colours: the canvas every masthead sits on (`--background`). */
export const THEME_COLORS = { light: "#f3f6f9", dark: "#111111" } as const;

/**
 * The `theme-color` tags only know the OS scheme, but the theme is a class the
 * toggle can flip against it. Once the theme resolves, both tags take its
 * colour, so a dark page never sits under a light status bar.
 */
function ThemeColorSync() {
	const { resolvedTheme } = useTheme();
	useEffect(() => {
		if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;
		for (const meta of document.querySelectorAll<HTMLMetaElement>(
			'meta[name="theme-color"]',
		)) {
			meta.content = THEME_COLORS[resolvedTheme];
		}
	}, [resolvedTheme]);
	return null;
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
	return (
		<ThemeProvider
			attribute="class"
			defaultTheme="system"
			enableSystem
			disableTransitionOnChange
		>
			<ThemeColorSync />
			{children}
		</ThemeProvider>
	);
}

export function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	// The resolved theme is only known on the client; render a stable placeholder
	// during SSR so the markup matches on hydration.
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	const dark = mounted && resolvedTheme === "dark";
	return (
		<Button
			variant="ghost"
			size="icon"
			aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
			onClick={() => setTheme(dark ? "light" : "dark")}
		>
			{mounted && dark ? (
				<Sun data-icon="inline-start" />
			) : (
				<Moon data-icon="inline-start" />
			)}
		</Button>
	);
}
