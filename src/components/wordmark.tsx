import { Link } from "@tanstack/react-router";

export function Wordmark({ to = "/" }: { to?: "/" | "/app" }) {
	return (
		<Link
			to={to}
			className="display-title text-xl font-bold text-foreground no-underline"
		>
			Even<span className="text-primary">tual</span>
		</Link>
	);
}
