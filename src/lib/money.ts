const inr = new Intl.NumberFormat("en-IN", {
	style: "currency",
	currency: "INR",
	minimumFractionDigits: 2,
});

/** Returns null for incomplete or invalid input so previews can avoid throw-in-render. */
export function parseMinor(value: string | number): number | null {
	const normalized =
		typeof value === "number" ? String(value) : value.trim().replace(/,/g, "");
	if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
	const [rupees, paise = ""] = normalized.split(".");
	const amount = Number(rupees) * 100 + Number(paise.padEnd(2, "0"));
	return Number.isSafeInteger(amount) ? amount : null;
}

export function toMinor(value: string | number): number {
	const normalized =
		typeof value === "number" ? String(value) : value.trim().replace(/,/g, "");
	if (!/^\d+(?:\.\d{0,2})?$/.test(normalized))
		throw new Error("Enter a valid amount with at most two decimals");
	const amount = parseMinor(normalized);
	if (amount === null) throw new Error("Amount is too large");
	return amount;
}

export function fromMinor(amountMinor: number): string {
	return (amountMinor / 100).toFixed(2);
}

export function formatMinor(amountMinor: number): string {
	return inr.format(amountMinor / 100);
}
