import { currencyDecimals, currencySymbol } from "#/lib/currencies";

/** Returns null for incomplete or invalid input so previews can avoid throw-in-render. */
export function parseMinor(
	value: string | number,
	currency = "INR",
): number | null {
	const decimals = currencyDecimals(currency);
	const normalized =
		typeof value === "number" ? String(value) : value.trim().replace(/,/g, "");
	const pattern =
		decimals === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{0,${decimals}})?$`);
	if (!pattern.test(normalized)) return null;
	const [whole, fraction = ""] = normalized.split(".");
	const amount =
		BigInt(whole) * 10n ** BigInt(decimals) +
		BigInt(fraction.padEnd(decimals, "0") || "0");
	return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
}

export function toMinor(value: string | number, currency = "INR"): number {
	const amount = parseMinor(value, currency);
	if (amount === null)
		throw new Error(
			`Enter a valid ${currency} amount with at most ${currencyDecimals(currency)} decimals`,
		);
	return amount;
}

export function fromMinor(amountMinor: number, currency = "INR"): string {
	const decimals = currencyDecimals(currency);
	const digits = String(Math.abs(amountMinor)).padStart(decimals + 1, "0");
	return `${amountMinor < 0 ? "-" : ""}${decimals === 0 ? digits : `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`}`;
}

export function formatMinor(amountMinor: number, currency = "INR"): string {
	return new Intl.NumberFormat("en-IN", {
		style: "currency",
		currency,
		currencyDisplay: "symbol",
		minimumFractionDigits: currencyDecimals(currency),
		maximumFractionDigits: currencyDecimals(currency),
	})
		.formatToParts(amountMinor / 10 ** currencyDecimals(currency))
		.map((part) =>
			part.type === "currency" ? currencySymbol(currency) : part.value,
		)
		.join("");
}
