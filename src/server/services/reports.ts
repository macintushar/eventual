import { and, asc } from "drizzle-orm";
import { expense } from "#/db/schema";
import type { Ctx } from "#/server/context";
import { AppError } from "#/server/errors";
import {
	type ExpenseFilters,
	expenseReportSchema,
} from "#/server/schemas/expenses";
import { expenseFilterClauses } from "./expenses";
import { membership } from "./shared";

type ReportRow = Pick<
	typeof expense.$inferSelect,
	| "id"
	| "date"
	| "description"
	| "notes"
	| "category"
	| "currency"
	| "amountMinor"
	| "paidByUserId"
>;

/** Quote every field and neutralize spreadsheet formula prefixes, including whitespace. */
export function csvCell(value: string | number) {
	let text = String(value);
	if (
		typeof value === "string" &&
		(/^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text))
	)
		text = `'${text}`;
	return `"${text.replace(/"/g, '""')}"`;
}

export function reportTotals(rows: readonly ReportRow[]) {
	const totals = new Map<
		string,
		{ currency: string; category: string; amountMinor: number; count: number }
	>();
	for (const row of rows) {
		const category = row.category ?? "Uncategorized";
		const key = JSON.stringify([row.currency, category]);
		const total = totals.get(key) ?? {
			currency: row.currency,
			category,
			amountMinor: 0,
			count: 0,
		};
		total.amountMinor += row.amountMinor;
		if (!Number.isSafeInteger(total.amountMinor))
			throw new AppError(
				"VALIDATION",
				"Report total exceeds safe integer range",
			);
		total.count++;
		totals.set(key, total);
	}
	return [...totals.values()].sort(
		(a, b) =>
			a.currency.localeCompare(b.currency) ||
			a.category.localeCompare(b.category),
	);
}

export function renderExpenseCsv(rows: readonly ReportRow[]) {
	const lines: (string | number)[][] = [
		[
			"Date",
			"Description",
			"Category",
			"Currency",
			"Amount (minor units)",
			"Paid by user ID",
			"Notes",
			"Expense ID",
		],
	];
	for (const row of rows)
		lines.push([
			row.date.toISOString(),
			row.description,
			row.category ?? "Uncategorized",
			row.currency,
			row.amountMinor,
			row.paidByUserId,
			row.notes ?? "",
			row.id,
		]);
	lines.push(
		[],
		["Category totals (minor units; currencies are not converted)"],
		["Category", "Currency", "Amount (minor units)", "Expense count"],
	);
	for (const total of reportTotals(rows))
		lines.push([
			total.category,
			total.currency,
			total.amountMinor,
			total.count,
		]);
	return `${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function pdfString(text: string) {
	// Built-in Helvetica has no Unicode font. Keep a readable Latin fallback;
	// ActualText below preserves the original Unicode for extraction/accessibility.
	return text
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.replace(/[^\x20-\x7e]/g, "?")
		.replace(/[\\()]/g, "\\$&");
}
function actualText(text: string) {
	return `FEFF${Array.from({ length: text.length }, (_, i) => text.charCodeAt(i).toString(16).padStart(4, "0")).join("")}`;
}

/** A dependency-free, paginated PDF 1.4 with byte-correct streams and xref. */
export function renderPdf(lines: readonly string[]): Uint8Array {
	const wrapped = lines.flatMap((line) => line.match(/.{1,95}/gu) ?? [""]);
	const pages: string[][] = [];
	for (let i = 0; i < Math.max(1, wrapped.length); i += 48)
		pages.push(wrapped.slice(i, i + 48));
	const objects: string[] = [
		"<< /Type /Catalog /Pages 2 0 R >>",
		"",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	];
	const pageIds: number[] = [];
	for (const [index, page] of pages.entries()) {
		const pageId = objects.length + 1;
		pageIds.push(pageId);
		objects.push(
			`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`,
		);
		const text = [...page, `Page ${index + 1} of ${pages.length}`];
		const stream = `BT\n/F1 10 Tf\n14 TL\n40 752 Td\n${text.map((line) => `/Span << /ActualText <${actualText(line)}> >> BDC\n(${pdfString(line)}) Tj\nEMC\nT*`).join("\n")}\nET\n`;
		objects.push(
			`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
		);
	}
	objects[1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
	let document = "%PDF-1.4\n";
	const offsets = [0];
	for (const [index, object] of objects.entries()) {
		offsets.push(Buffer.byteLength(document));
		document += `${index + 1} 0 obj\n${object}\nendobj\n`;
	}
	const xref = Buffer.byteLength(document);
	document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
		.slice(1)
		.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
		.join(
			"",
		)}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return Buffer.from(document, "utf8");
}

export async function expenseReport(
	ctx: Ctx,
	raw: ExpenseFilters & { format?: "csv" | "pdf" },
) {
	const input = expenseReportSchema.parse(raw);
	await membership(ctx, input.groupId);
	const rows = await ctx.db
		.select({
			id: expense.id,
			date: expense.date,
			description: expense.description,
			notes: expense.notes,
			category: expense.category,
			currency: expense.currency,
			amountMinor: expense.amountMinor,
			paidByUserId: expense.paidByUserId,
		})
		.from(expense)
		.where(and(...expenseFilterClauses(input)))
		.orderBy(
			asc(expense.currency),
			asc(expense.category),
			asc(expense.date),
			asc(expense.id),
		);
	const totals = reportTotals(rows);
	const common = {
		filename: `expenses.${input.format}`,
		count: rows.length,
		totals,
	};
	if (input.format === "csv")
		return {
			...common,
			contentType: "text/csv; charset=utf-8",
			encoding: "utf8" as const,
			content: renderExpenseCsv(rows),
		};
	const lines = [
		"Categorized expense report",
		"Amounts in minor units. Currencies are not converted.",
		"",
		"Category totals",
		...totals.map(
			(total) =>
				`${total.currency} | ${total.category} | ${total.amountMinor} | ${total.count} expenses`,
		),
		"",
		"Expenses",
		...rows.flatMap((row) => [
			`${row.date.toISOString().slice(0, 10)} | ${row.currency} ${row.amountMinor} | ${row.category ?? "Uncategorized"}`,
			row.description,
			`Paid by: ${row.paidByUserId} | ID: ${row.id}`,
			...(row.notes ? [`Notes: ${row.notes.replace(/\s+/gu, " ")}`] : []),
			"",
		]),
	];
	return {
		...common,
		contentType: "application/pdf",
		encoding: "base64" as const,
		content: Buffer.from(renderPdf(lines)).toString("base64"),
	};
}
