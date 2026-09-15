import { Link } from "@tanstack/react-router";

/**
 * Coin-mark wordmark. The mark is drawn inline (not an <img>) so its tile and
 * strokes follow the theme tokens and stay legible in light and dark mode.
 */
function LogoMark({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
			<rect width="64" height="64" rx="32" className="fill-foreground" />
			<g
				fill="none"
				strokeWidth="5"
				strokeLinecap="round"
				className="stroke-background"
			>
				<path d="M31 12A20 20 0 0 0 31 52" />
				<path d="M38 17A15 15 0 0 1 38 47" />
			</g>
		</svg>
	);
}

export function Wordmark({ to = "/" }: { to?: "/" | "/app" }) {
	return (
		<Link
			to={to}
			className="display-title flex items-center gap-2 text-xl font-bold text-foreground no-underline"
		>
			<LogoMark className="size-6 shrink-0" />
			<span>
				Even<span className="text-primary">tual</span>
			</span>
		</Link>
	);
}
