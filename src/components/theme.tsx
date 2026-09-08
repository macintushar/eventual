import { Moon, Sun } from "lucide-react";
import { ThemeProvider, useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "#/components/ui/button";

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
	return (
		<ThemeProvider
			attribute="class"
			defaultTheme="system"
			enableSystem
			disableTransitionOnChange
		>
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
