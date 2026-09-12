/** Explicit minor-unit precision shared by input parsing, API validation and UI. */
export const currencies = [
	{ code: "INR", name: "Indian rupee", decimals: 2 },
	{ code: "USD", name: "US dollar", decimals: 2 },
	{ code: "EUR", name: "Euro", decimals: 2 },
	{ code: "GBP", name: "British pound", decimals: 2 },
	{ code: "AED", name: "UAE dirham", decimals: 2 },
	{ code: "AUD", name: "Australian dollar", decimals: 2 },
	{ code: "CAD", name: "Canadian dollar", decimals: 2 },
	{ code: "CHF", name: "Swiss franc", decimals: 2 },
	{ code: "CNY", name: "Chinese yuan", decimals: 2 },
	{ code: "HKD", name: "Hong Kong dollar", decimals: 2 },
	{ code: "JPY", name: "Japanese yen", decimals: 0 },
	{ code: "KRW", name: "South Korean won", decimals: 0 },
	{ code: "KWD", name: "Kuwaiti dinar", decimals: 3 },
	{ code: "MYR", name: "Malaysian ringgit", decimals: 2 },
	{ code: "NPR", name: "Nepalese rupee", decimals: 2 },
	{ code: "NZD", name: "New Zealand dollar", decimals: 2 },
	{ code: "SAR", name: "Saudi riyal", decimals: 2 },
	{ code: "SGD", name: "Singapore dollar", decimals: 2 },
	{ code: "THB", name: "Thai baht", decimals: 2 },
	{ code: "VND", name: "Vietnamese dong", decimals: 0 },
] as const;

export function isCurrency(code: string): boolean {
	return currencies.some((currency) => currency.code === code);
}

const symbols: Record<(typeof currencies)[number]["code"], string> = {
	INR: "₹",
	USD: "US$",
	EUR: "€",
	GBP: "£",
	AED: "د.إ",
	AUD: "A$",
	CAD: "CA$",
	CHF: "CHF",
	CNY: "CN¥",
	HKD: "HK$",
	JPY: "JP¥",
	KRW: "₩",
	KWD: "د.ك",
	MYR: "RM",
	NPR: "रू",
	NZD: "NZ$",
	SAR: "﷼",
	SGD: "S$",
	THB: "฿",
	VND: "₫",
};

export function currencySymbol(code: string): string {
	if (!isCurrency(code)) throw new Error(`Unsupported currency: ${code}`);
	return symbols[code as keyof typeof symbols];
}

export function currencyDecimals(code: string): number {
	const currency = currencies.find((currency) => currency.code === code);
	if (!currency) throw new Error(`Unsupported currency: ${code}`);
	return currency.decimals;
}
