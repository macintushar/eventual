export function normalizeSearchText(...values: (string | null | undefined)[]) {
	return values
		.filter(Boolean)
		.join(" ")
		.normalize("NFKC")
		.toLowerCase()
		.replace(/\s+/gu, " ")
		.trim();
}

/**
 * Keywords every group gets without writing a rule. Shared with the client so
 * the rules editor can show them instead of people re-creating them.
 */
export const builtInCategories = [
	[
		"Food & drink",
		[
			"restaurant",
			"dinner",
			"lunch",
			"breakfast",
			"coffee",
			"cafe",
			"takeaway",
		],
	],
	["Groceries", ["groceries", "grocery", "supermarket"]],
	[
		"Transport",
		[
			"taxi",
			"uber",
			"lyft",
			"bus",
			"train",
			"fuel",
			"petrol",
			"parking",
			"flight",
		],
	],
	["Housing", ["rent", "mortgage"]],
	["Utilities", ["electricity", "internet", "wifi", "water bill", "gas bill"]],
	["Travel", ["hotel", "hostel", "airbnb"]],
	["Entertainment", ["cinema", "movie", "concert", "netflix"]],
	["Health", ["pharmacy", "medicine", "doctor", "hospital"]],
] as const;

/** Built-in keywords match whole words or phrases, never parts of a word. */
export function builtInCategory(text: string) {
	const words = ` ${normalizeSearchText(text).replace(/[^\p{L}\p{N}]+/gu, " ")} `;
	for (const [category, keywords] of builtInCategories)
		for (const keyword of keywords)
			if (words.includes(` ${keyword} `)) return { category, keyword };
	return null;
}
