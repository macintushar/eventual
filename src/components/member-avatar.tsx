import { Avatar, AvatarFallback } from "#/components/ui/avatar";
import { cn } from "#/lib/utils";

/** Six brand-compatible tints so members stay visually distinguishable. */
const tints = [
	"bg-lagoon-200 text-lagoon-900",
	"bg-[color-mix(in_oklab,var(--palm-500)_26%,transparent)] text-foreground",
	"bg-[color-mix(in_oklab,var(--lagoon-400)_30%,transparent)] text-foreground",
	"bg-[color-mix(in_oklab,var(--lagoon-500)_24%,transparent)] text-foreground",
	"bg-[color-mix(in_oklab,var(--palm-600)_22%,transparent)] text-foreground",
	"bg-[color-mix(in_oklab,var(--lagoon-300)_38%,transparent)] text-foreground",
];

function initials(name: string) {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic tint so the same person keeps the same colour across screens. */
function tintFor(seed: string) {
	let hash = 0;
	for (let index = 0; index < seed.length; index++)
		hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
	return tints[hash % tints.length];
}

export function MemberAvatar({
	name,
	seed,
	className,
}: {
	name: string;
	seed?: string;
	className?: string;
}) {
	return (
		<Avatar className={cn("size-9 shrink-0", className)}>
			<AvatarFallback
				className={cn("text-xs font-bold", tintFor(seed ?? name))}
				aria-hidden="true"
			>
				{initials(name)}
			</AvatarFallback>
		</Avatar>
	);
}
