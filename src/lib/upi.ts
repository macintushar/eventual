/**
 * A UPI deep link, built to the `upi://pay` intent format. Manual
 * confirmation: the payer completes the transfer in their UPI app and then
 * records the settlement separately.
 */
export type UpiIntent = {
	pa: string;
	pn: string;
	/** Amount in minor units; INR minor units are paise. */
	amountMinor: number;
	cu?: string;
	tn?: string;
};

const MINOR_UNITS = 100;

export function buildUpiUrl(intent: UpiIntent): string {
	const params = new URLSearchParams({
		pa: intent.pa.toLowerCase(),
		pn: intent.pn,
		am: (intent.amountMinor / MINOR_UNITS).toFixed(2),
		cu: intent.cu ?? "INR",
	});
	if (intent.tn) params.set("tn", intent.tn);
	return `upi://pay?${params.toString()}`;
}
