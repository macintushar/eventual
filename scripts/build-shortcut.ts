/**
 * Builds `public/eventual.shortcut`: pick a group, pick who paid, type the
 * amount. Import asks for the user's API key and EvenTual URL.
 *
 * macOS only — signing needs the `shortcuts` CLI.
 *   bun run shortcut:build [https://your-eventual-url]
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const defaultOrigin = process.argv[2] ?? process.env.BETTER_AUTH_URL ?? "";
const output = join(import.meta.dirname, "../public/eventual.shortcut");

/** Shortcuts marks an inline variable with U+FFFC plus a range attachment. */
const OBJECT_REPLACEMENT = "￼";

type Ref = { uuid: string; name: string };

const attachment = (ref: Ref) => ({
	Type: "ActionOutput",
	OutputUUID: ref.uuid,
	OutputName: ref.name,
});

const variable = (ref: Ref) => ({
	Value: attachment(ref),
	WFSerializationType: "WFTextTokenAttachment",
});

function text(...parts: (string | Ref)[]) {
	let string = "";
	const attachmentsByRange: Record<string, ReturnType<typeof attachment>> = {};
	for (const part of parts) {
		if (typeof part === "string") {
			string += part;
			continue;
		}
		attachmentsByRange[`{${string.length}, 1}`] = attachment(part);
		string += OBJECT_REPLACEMENT;
	}
	return {
		Value: { string, attachmentsByRange },
		WFSerializationType: "WFTextTokenString",
	};
}

function dictionary(
	items: { key: string; value: (string | Ref)[]; number?: boolean }[],
) {
	return {
		Value: {
			WFDictionaryFieldValueItems: items.map((item) => ({
				WFItemType: item.number ? 3 : 0,
				WFKey: text(item.key),
				WFValue: text(...item.value),
			})),
		},
		WFSerializationType: "WFDictionaryFieldValue",
	};
}

const actions: object[] = [];

function action(
	identifier: string,
	parameters: Record<string, unknown>,
	outputName: string,
): Ref {
	const uuid = crypto.randomUUID().toUpperCase();
	actions.push({
		WFWorkflowActionIdentifier: `is.workflow.actions.${identifier}`,
		WFWorkflowActionParameters: { UUID: uuid, ...parameters },
	});
	return { uuid, name: outputName };
}

const apiKey = action("gettext", { WFTextActionText: "" }, "Text");
const origin = action(
	"gettext",
	{ WFTextActionText: defaultOrigin },
	"Text",
);
const auth = () => dictionary([{ key: "x-api-key", value: [apiKey] }]);

function getJson(...url: (string | Ref)[]) {
	const response = action(
		"downloadurl",
		{
			WFURL: text(...url),
			WFHTTPMethod: "GET",
			ShowHeaders: true,
			WFHTTPHeaders: auth(),
		},
		"Contents of URL",
	);
	return action(
		"detect.dictionary",
		{ WFInput: variable(response) },
		"Dictionary",
	);
}

/** Shows the dictionary's labels, then resolves the chosen one to its ID. */
function choose(options: Ref, prompt: string) {
	const chosen = action(
		"choosefromlist",
		{ WFInput: variable(options), WFChooseFromListActionPrompt: prompt },
		"Chosen Item",
	);
	return action(
		"getvalueforkey",
		{
			WFInput: variable(options),
			WFGetDictionaryValueType: "Value",
			WFDictionaryKey: text(chosen),
		},
		"Dictionary Value",
	);
}

// 1. Group
const groupId = choose(
	getJson(origin, "/api/shortcut/groups"),
	"Which group?",
);
// 2. Payer
const payerId = choose(
	getJson(origin, "/api/shortcut/groups/", groupId, "/members"),
	"Who paid?",
);
// 3. Amount
const amount = action(
	"ask",
	{ WFAskActionPrompt: "How much? (₹)", WFInputType: "Number" },
	"Provided Input",
);

const response = action(
	"downloadurl",
	{
		WFURL: text(origin, "/api/shortcut/groups/", groupId, "/expenses"),
		WFHTTPMethod: "POST",
		ShowHeaders: true,
		WFHTTPHeaders: auth(),
		WFHTTPBodyType: "JSON",
		WFJSONValues: dictionary([
			{ key: "paidByUserId", value: [payerId] },
			{ key: "amount", value: [amount], number: true },
		]),
	},
	"Contents of URL",
);
const result = action(
	"detect.dictionary",
	{ WFInput: variable(response) },
	"Dictionary",
);
const message = action(
	"getvalueforkey",
	{
		WFInput: variable(result),
		WFGetDictionaryValueType: "Value",
		WFDictionaryKey: "message",
	},
	"Dictionary Value",
);
action(
	"notification",
	{
		WFNotificationActionTitle: "EvenTual",
		WFNotificationActionBody: text(message),
	},
	"Notification",
);

const workflow = {
	WFWorkflowClientVersion: "2605.0.4",
	WFWorkflowMinimumClientVersion: 900,
	WFWorkflowMinimumClientVersionString: "900",
	WFWorkflowIcon: {
		WFWorkflowIconStartColor: 431817727,
		WFWorkflowIconGlyphNumber: 59446,
	},
	WFWorkflowTypes: ["NCWidget", "WatchKit"],
	WFWorkflowInputContentItemClasses: [],
	WFWorkflowOutputContentItemClasses: [],
	WFQuickActionSurfaces: [],
	WFWorkflowHasShortcutInputVariables: false,
	WFWorkflowImportQuestions: [
		{
			ActionIndex: 0,
			Category: "Parameter",
			ParameterKey: "WFTextActionText",
			Text: "Paste an EvenTual API key (create one under API keys)",
			DefaultValue: "",
		},
		{
			ActionIndex: 1,
			Category: "Parameter",
			ParameterKey: "WFTextActionText",
			Text: "Your EvenTual URL, without a trailing slash",
			DefaultValue: defaultOrigin,
		},
	],
	WFWorkflowActions: actions,
};

const dir = mkdtempSync(join(tmpdir(), "eventual-shortcut-"));
const json = join(dir, "workflow.json");
const unsigned = join(dir, "unsigned.shortcut");
writeFileSync(json, JSON.stringify(workflow));
execFileSync("plutil", ["-convert", "binary1", json, "-o", unsigned]);
execFileSync("shortcuts", [
	"sign",
	"--mode",
	"anyone",
	"--input",
	unsigned,
	"--output",
	output,
]);
console.log(`Signed shortcut written to ${output}`);
