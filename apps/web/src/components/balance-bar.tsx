/**
 * Diverging bar for a member's net balance.
 *
 * Polarity is encoded three ways so it never depends on colour alone: the bar's
 * direction from the centre baseline, the sign carried by the formatted amount
 * beside it, and the row's text label. Ends are rounded away from the baseline
 * and square against it, so the midpoint reads as a real zero.
 */
export function BalanceBar({
	minor,
	max,
	label,
}: {
	minor: number;
	/** Largest absolute balance in the group; sets the shared scale. */
	max: number;
	label: string;
}) {
	const ratio = max > 0 ? Math.min(Math.abs(minor) / max, 1) : 0;
	const width = `${(ratio * 100).toFixed(2)}%`;
	return (
		<div
			className="flex h-1.5 w-full items-stretch"
			role="img"
			aria-label={label}
		>
			<div className="flex flex-1 justify-end pr-px">
				{minor < 0 && (
					<span
						className="block rounded-l-[4px] bg-negative"
						style={{ width }}
					/>
				)}
			</div>
			<span className="w-px shrink-0 bg-border" aria-hidden="true" />
			<div className="flex flex-1 justify-start pl-px">
				{minor > 0 && (
					<span
						className="block rounded-r-[4px] bg-positive"
						style={{ width }}
					/>
				)}
			</div>
		</div>
	);
}
