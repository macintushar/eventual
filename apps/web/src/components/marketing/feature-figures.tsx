import { Lock } from "lucide-react";

import { MemberAvatar } from "#/components/member-avatar";
import { formatMinor } from "#/lib/money";

/*
 * Small still figures for the landing page's feature cards, drawn with the
 * app's own avatars and amount styles. Decorative: each card's text says the
 * same thing, so they're hidden from assistive tech.
 */

const shares = [
	{ name: "Arjun Mehta", minor: 33_334 },
	{ name: "Mac Okafor", minor: 33_333 },
	{ name: "Sam Rivera", minor: 33_333 },
];

/** €1,000.00 split three ways, with the odd cent landing on one person. */
export function SplitFigure() {
	return (
		<div
			aria-hidden="true"
			className="mt-auto overflow-hidden rounded-2xl border bg-background/60"
		>
			<div className="flex items-baseline justify-between gap-3 border-b px-4 py-3 text-sm">
				<span className="font-medium">Villa deposit · split evenly</span>
				<strong className="tabular">{formatMinor(100_000, "EUR")}</strong>
			</div>
			{shares.map((share) => (
				<div
					key={share.name}
					className="flex items-center gap-3 border-b px-4 py-2.5 text-sm last:border-0"
				>
					<MemberAvatar
						name={share.name}
						seed={share.name}
						className="size-7"
					/>
					<span className="flex-1">{share.name}</span>
					<span className="tabular font-semibold">
						{formatMinor(share.minor, "EUR")}
					</span>
				</div>
			))}
		</div>
	);
}

/** A locked expense row, as the group's expense list shows it. */
export function LockedFigure() {
	return (
		<div
			aria-hidden="true"
			className="mt-auto flex items-center gap-3 rounded-2xl border bg-background/60 px-4 py-3 text-sm"
		>
			<span className="min-w-0 flex-1">
				<span className="block font-medium">Movie night</span>
				<span className="block text-xs text-muted-foreground">
					Arjun marked their share paid
				</span>
			</span>
			<span className="flex flex-col items-end gap-1">
				<strong className="tabular">{formatMinor(3_600, "EUR")}</strong>
				<span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
					<Lock className="size-3" aria-hidden="true" />
					Locked
				</span>
			</span>
		</div>
	);
}
