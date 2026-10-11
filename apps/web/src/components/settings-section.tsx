import type { ReactNode } from "react";
import { useId } from "react";

import { cn } from "#/lib/utils";

/**
 * One group of settings: a heading and a line of context, then a single paper
 * panel whose rows are divided by hairlines. Every settings screen is a stack
 * of these, so related controls sit together and unrelated ones never share a
 * card. Where the column is wide enough (the group page, not the narrower
 * account column) the heading moves into a left rail and the panel takes the
 * rest — the container query keys off the section's own width, not the
 * viewport, so the same component suits both.
 */
export function SettingsSection({
	title,
	description,
	tone,
	children,
	className,
}: {
	title: string;
	description?: ReactNode;
	tone?: "danger";
	children: ReactNode;
	className?: string;
}) {
	const headingId = useId();
	return (
		<section
			aria-labelledby={headingId}
			className={cn("@container", className)}
		>
			<div className="grid gap-4 @4xl:grid-cols-[15rem_minmax(0,1fr)] @4xl:gap-10">
				<header className="flex flex-col gap-1 @4xl:pt-5">
					<h2
						id={headingId}
						className={cn(
							"text-base font-semibold",
							tone === "danger" && "text-destructive",
						)}
					>
						{title}
					</h2>
					{description ? (
						<p className="text-sm text-pretty text-muted-foreground">
							{description}
						</p>
					) : null}
				</header>
				<div
					className={cn(
						"island-shell divide-y overflow-hidden rounded-2xl",
						tone === "danger" && "border-destructive/30",
					)}
				>
					{children}
				</div>
			</div>
		</section>
	);
}

/**
 * A row inside a `SettingsSection`. `inline` puts the control opposite its
 * label from `sm` up — the shape for a switch, a button or a single input.
 * `stacked` puts the body under the label at every width, for lists and
 * multi-field forms that need the panel's full width.
 */
export function SettingsRow({
	title,
	description,
	htmlFor,
	layout = "inline",
	children,
	className,
}: {
	title: ReactNode;
	description?: ReactNode;
	/** Makes the title a `<label>` for the control it describes. */
	htmlFor?: string;
	layout?: "inline" | "stacked";
	children?: ReactNode;
	className?: string;
}) {
	const Title = htmlFor ? "label" : "p";
	return (
		<div
			className={cn(
				"flex flex-col gap-4 p-5 sm:p-6",
				layout === "inline" &&
					"sm:flex-row sm:items-center sm:justify-between sm:gap-8",
				className,
			)}
		>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<Title
					htmlFor={htmlFor}
					className="flex items-center gap-2 text-sm leading-snug font-medium"
				>
					{title}
				</Title>
				{description ? (
					<p className="text-sm text-pretty text-muted-foreground">
						{description}
					</p>
				) : null}
			</div>
			{children ? (
				<div
					className={cn(
						"min-w-0",
						layout === "inline" &&
							"flex shrink-0 flex-wrap items-center gap-2 sm:justify-end",
					)}
				>
					{children}
				</div>
			) : null}
		</div>
	);
}
