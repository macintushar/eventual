import { currencyDecimals, currencySymbol } from "./currencies";

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

/**
 * Currencies whose symbol needs a no-break space before the digits (ICU spells
 * them by code, so they need separating). Listed explicitly because React
 * Native's Hermes has no `formatToParts` to read it from.
 */
const SPACED_SYMBOLS = new Set([
	"AED",
	"CHF",
	"KWD",
	"MYR",
	"NPR",
	"SAR",
	"SGD",
	"THB",
]);

/**
 * "-₹123,456.70": the sign, our symbol, then digits grouped in threes. Every
 * currency, rupees included, uses the same grouping.
 */
export function formatMinor(amountMinor: number, currency = "INR"): string {
	const decimals = currencyDecimals(currency);
	const digits = new Intl.NumberFormat("en-US", {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	}).format(Math.abs(amountMinor) / 10 ** decimals);
	const gap = SPACED_SYMBOLS.has(currency) ? "\u00A0" : "";
	return `${amountMinor < 0 ? "-" : ""}${currencySymbol(currency)}${gap}${digits}`;
}
