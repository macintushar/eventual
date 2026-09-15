const sameYear = new Intl.DateTimeFormat("en-IN", {
	day: "numeric",
	month: "short",
});

const otherYear = new Intl.DateTimeFormat("en-IN", {
	day: "numeric",
	month: "short",
	year: "numeric",
});

/**
 * Short date for list rows. The year is dropped when it's the current one,
 * which is almost always: on a phone "31 Aug" fits beside a payer's name where
 * "31 Aug 2026" truncates the line it shares.
 */
export function formatShortDate(value: Date | string | number): string {
	const date = value instanceof Date ? value : new Date(value);
	const format =
		date.getFullYear() === new Date().getFullYear() ? sameYear : otherYear;
	return format.format(date);
}

const longDate = new Intl.DateTimeFormat("en-IN", {
	day: "numeric",
	month: "long",
	year: "numeric",
});

/** Full date for detail screens and pickers, where there is room to be plain. */
export function formatLongDate(value: Date | string | number): string {
	return longDate.format(value instanceof Date ? value : new Date(value));
}

/** Noon local time on the given day, so a timezone shift can't roll the date. */
export function atNoon(value: Date): Date {
	return new Date(
		value.getFullYear(),
		value.getMonth(),
		value.getDate(),
		12,
		0,
		0,
		0,
	);
}
