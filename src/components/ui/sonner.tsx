"use client";

import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
	const { theme = "system" } = useTheme();

	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			className="toaster group"
			position="top-right"
			// Toasts land in the same corner as the masthead's theme toggle and
			// avatar, so they hang below it rather than covering it. The insets
			// clear the tallest header on the page — the public one on the landing
			// and docs screens (`h-16 sm:h-20`), not the slimmer app masthead.
			offset={{ top: "calc(5rem + 0.75rem)", right: "1rem" }}
			// On a phone a corner toast is narrower than the text it carries, so it
			// spans the gutter instead and clears the notch as well as the header.
			mobileOffset={{
				top: "calc(var(--safe-top) + 4rem + 0.75rem)",
				left: "1rem",
				right: "1rem",
			}}
			icons={{
				success: <CircleCheckIcon className="size-4" />,
				info: <InfoIcon className="size-4" />,
				warning: <TriangleAlertIcon className="size-4" />,
				error: <OctagonXIcon className="size-4" />,
				loading: <Loader2Icon className="size-4 animate-spin" />,
			}}
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "var(--radius)",
				} as React.CSSProperties
			}
			{...props}
		/>
	);
};

export { Toaster };
