/**
 * Builds `public/eventual.shortcut`: the fastest way to get an expense into
 * Eventual from an Apple device.
 *
 * Three ways in:
 *  - Action Button / Siri / Home Screen (no input): asks only for the
 *    amount. If the clipboard holds a bank SMS, the parsed amount is
 *    pre-filled — confirm and done. The payer defaults to you, and the group
 *    is asked once then remembered on device, so a normal log is one prompt.
 *  - Share Sheet or a Messages automation (text input): parses a bank SMS —
 *    amount, currency and merchant — and logs without asking. A
 *    notification confirms what was logged, or why it wasn't.
 *  - Watch: the same one-prompt flow, minus the clipboard and the on-device
 *    group cache (file and clipboard actions don't exist on watchOS).
 *
 * Import asks for the user's API key and Eventual URL.
 *
 * macOS only — signing needs the `shortcuts` CLI.
 *   bun run shortcut:build [https://your-eventual-url]
 */
import { join } from "node:path";

import {
	CONDITION,
	createBuilder,
	dictionary,
	type Ref,
	signShortcut,
	text,
	variable,
} from "./shortcut-lib";

const defaultOrigin = process.argv[2] ?? process.env.BETTER_AUTH_URL ?? "";
const output = join(import.meta.dirname, "../public/eventual.shortcut");

const { actions, action, varRef, setVar, beginIf, otherwise, endIf } =
	createBuilder();

/** Text action whose output is stored straight into a variable. */
function setText(name: string, ...parts: (string | Ref)[]) {
	setVar(name, action("gettext", { WFTextActionText: text(...parts) }, "Text"));
}

/** Match Text on a variable, returning the first match when there is one. */
function firstMatch(source: string, pattern: string, then: (match: Ref) => void) {
	const matches = action(
		"text.match",
		{
			text: text(varRef(source)),
			WFTextMatchPattern: pattern,
			WFTextMatchCaseSensitive: false,
		},
		"Matches",
	);
	const matchIf = beginIf(matches, CONDITION.hasValue);
	then(
		action(
			"getitemfromlist",
			{ WFInput: variable(matches), WFItemSpecifier: "First Item" },
			"Item from List",
		),
	);
	endIf(matchIf);
}

// ——— Bank SMS parsing ———
// Match Text uses ICU regular expressions. Lookarounds keep group 0 exactly
// the piece we want, since Match Text returns whole matches.
/** The figure right after a currency marker: "Rs.1,250.00" → "1,250.00". */
const AMOUNT_RE =
	"(?<=(?:Rs\\.?|INR|₹|US\\$|\\$|USD|EUR|€|GBP|£|AED|Dhs?)\\s{0,2})\\d[\\d,]*(?:\\.\\d{1,2})?";
/** The currency marker itself, when an amount follows it. */
const CURRENCY_RE =
	"(?:Rs\\.?|INR|₹|US\\$|\\$|USD|EUR|€|GBP|£|AED|Dhs?)(?=\\s{0,2}\\d[\\d,]*(?:\\.\\d{1,2})?)";
/**
 * The words after "at"/"to"/"towards", stopping before dates, references
 * and balances: "… at AMAZON PAY on 27-Sep" → "AMAZON PAY".
 */
const MERCHANT_RE =
	"(?<=\\b(?:towards|at|to)\\s)[A-Za-z0-9][A-Za-z0-9&*'# -]{0,38}?[A-Za-z0-9&*'-](?=\\s+(?:on|dt|dated|ref|via|avl|bal|info|call)\\b|[.,;]|$)";
/** Currency tokens, uppercased before lookup, to ISO 4217 codes. */
const CURRENCY_MAP = dictionary(
	(
		[
			["RS", "INR"],
			["RS.", "INR"],
			["INR", "INR"],
			["₹", "INR"],
			["US$", "USD"],
			["$", "USD"],
			["USD", "USD"],
			["EUR", "EUR"],
			["€", "EUR"],
			["GBP", "GBP"],
			["£", "GBP"],
			["AED", "AED"],
			["DH", "AED"],
			["DHS", "AED"],
		] as const
	).map(([key, value]) => ({ key, value: [value] })),
);

const CACHE_PATH = "Shortcuts/Eventual/last-group.txt";

// ——— Setup ———
// The first action receives the shortcut input; keep it before the import
// questions' Text actions so their indexes stay stable.
action("setvariable", {
	WFVariableName: "Input",
	WFInput: {
		Value: { Type: "ExtensionInput" },
		WFSerializationType: "WFTextTokenAttachment",
	},
}, "Input"); // index 0
const apiKey = action("gettext", { WFTextActionText: "" }, "Text"); // index 1
const origin = action("gettext", { WFTextActionText: defaultOrigin }, "Text"); // index 2
const auth = () => dictionary([{ key: "x-api-key", value: [apiKey] }]);

// File and clipboard actions don't exist on watchOS.
const deviceModel = action(
	"getdevicedetails",
	{ WFDeviceDetail: "Device Model" },
	"Device Model",
);
const watchIf = beginIf(deviceModel, CONDITION.contains, { string: ["Watch"] });
setText("OnWatch", "yes");
endIf(watchIf);

// ——— What are we parsing? ———
// Text input (Share Sheet or a Messages automation) if there is any —
// coerced to text so a Message object becomes its body — else the clipboard
// as a manual "copy the SMS first" fallback.
const inputIf = beginIf(varRef("Input"), CONDITION.hasValue);
setText("Source", varRef("Input"));
otherwise(inputIf);
const clipboardIf = beginIf(varRef("OnWatch"), CONDITION.noValue);
setVar("Source", action("getclipboard", {}, "Clipboard"));
endIf(clipboardIf);
endIf(inputIf);

// ——— Parse amount, currency, merchant ———
firstMatch("Source", AMOUNT_RE, (match) =>
	setVar(
		"AmountParsed",
		action(
			"text.replace",
			{
				WFInput: text(match),
				WFReplaceTextFind: ",",
				WFReplaceTextReplace: "",
				WFReplaceTextRegularExpression: false,
				WFReplaceTextCaseSensitive: false,
			},
			"Updated Text",
		),
	),
);

firstMatch("Source", CURRENCY_RE, (match) => {
	const token = action(
		"text.changecase",
		{ text: text(match), WFCaseType: "UPPERCASE" },
		"Text",
	);
	const currencyMap = action("dictionary", { WFItems: CURRENCY_MAP }, "Dictionary");
	setVar(
		"Currency",
		action(
			"getvalueforkey",
			{
				WFInput: variable(currencyMap),
				WFGetDictionaryValueType: "Value",
				WFDictionaryKey: text(token),
			},
			"Dictionary Value",
		),
	);
});
const currencyDefaultIf = beginIf(varRef("Currency"), CONDITION.noValue);
setText("Currency", "INR");
endIf(currencyDefaultIf);

firstMatch("Source", MERCHANT_RE, (match) => setVar("Description", match));
const merchantDefaultIf = beginIf(varRef("Description"), CONDITION.noValue);
setText("Description", "Quick expense");
endIf(merchantDefaultIf);

// ——— Amount ———
// With text input, log straight away when the amount parsed (a Messages
// automation can't wait around for prompts). Run by hand, ask — with the
// parsed clipboard amount pre-filled when there is one.
const autoIf = beginIf(varRef("Input"), CONDITION.hasValue);
const autoAskIf = beginIf(varRef("AmountParsed"), CONDITION.noValue);
setVar(
	"Amount",
	action(
		"ask",
		{ WFAskActionPrompt: "How much?", WFInputType: "Number" },
		"Provided Input",
	),
);
otherwise(autoAskIf);
setVar("Amount", varRef("AmountParsed"));
endIf(autoAskIf);
otherwise(autoIf);
setVar(
	"Amount",
	action(
		"ask",
		{
			WFAskActionPrompt: "How much?",
			WFInputType: "Number",
			WFAskActionDefaultAnswer: text(varRef("AmountParsed")),
		},
		"Provided Input",
	),
);
endIf(autoIf);

// ——— Group ———
// The cached group wins while it still exists; a single group selects
// itself; otherwise ask once and remember the choice.
const groupsResponse = action(
	"downloadurl",
	{
		WFURL: text(origin, "/api/shortcut/groups"),
		WFHTTPMethod: "GET",
		ShowHeaders: true,
		WFHTTPHeaders: auth(),
	},
	"Contents of URL",
);
setVar(
	"Groups",
	action(
		"detect.dictionary",
		{ WFInput: variable(groupsResponse) },
		"Dictionary",
	),
);
setVar(
	"GroupIds",
	action(
		"getvalueforkey",
		{
			WFInput: variable(varRef("Groups")),
			WFGetDictionaryValueType: "All Values",
		},
		"Dictionary Value",
	),
);

const cacheReadIf = beginIf(varRef("OnWatch"), CONDITION.noValue);
const cachedFile = action(
	"documentpicker.open",
	{
		WFGetFilePath: CACHE_PATH,
		WFShowFilePicker: false,
		WFFileErrorIfNotFound: false,
	},
	"File",
);
const cachedFileIf = beginIf(cachedFile, CONDITION.hasValue);
setText("CachedGroup", cachedFile);
endIf(cachedFileIf);
endIf(cacheReadIf);

// An empty cache would "contain" trivially, so it counts as a miss.
setText("KnownGroupIds", varRef("GroupIds"));
const cachedIf = beginIf(varRef("KnownGroupIds"), CONDITION.contains, {
	string: [varRef("CachedGroup")],
});
const cachedHitIf = beginIf(varRef("CachedGroup"), CONDITION.hasValue);
setVar("GroupId", varRef("CachedGroup"));
endIf(cachedHitIf);
endIf(cachedIf);
const pickIf = beginIf(varRef("GroupId"), CONDITION.noValue);
const groupCount = action(
	"count",
	{
		WFCountType: "Items",
		WFInput: variable(varRef("GroupIds")),
		Input: variable(varRef("GroupIds")),
	},
	"Count",
);
const singleIf = beginIf(groupCount, CONDITION.lessThanOrEqual, { number: 1 });
setVar(
	"GroupId",
	action(
		"getitemfromlist",
		{ WFInput: variable(varRef("GroupIds")), WFItemSpecifier: "First Item" },
		"Item from List",
	),
);
otherwise(singleIf);
setVar(
	"GroupId",
	action(
		"choosefromlist",
		{
			WFInput: variable(varRef("Groups")),
			WFChooseFromListActionPrompt: "Which group?",
		},
		"Chosen Item",
	),
);
endIf(singleIf);
const cacheWriteIf = beginIf(varRef("OnWatch"), CONDITION.noValue);
action(
	"documentpicker.save",
	{
		WFInput: variable(varRef("GroupId")),
		WFFileDestinationPath: CACHE_PATH,
		WFSaveFileOverwrite: true,
		WFAskWhereToSave: false,
	},
	"File",
);
endIf(cacheWriteIf);
endIf(pickIf);

// ——— Log it ———
const response = action(
	"downloadurl",
	{
		WFURL: text(origin, "/api/shortcut/groups/", varRef("GroupId"), "/expenses"),
		WFHTTPMethod: "POST",
		ShowHeaders: true,
		WFHTTPHeaders: auth(),
		WFHTTPBodyType: "JSON",
		WFJSONValues: dictionary([
			{ key: "amount", value: [varRef("Amount")] },
			{ key: "currency", value: [varRef("Currency")] },
			{ key: "description", value: [varRef("Description")] },
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
		WFNotificationActionTitle: "Eventual",
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
	// ActionExtension + text input puts the shortcut in the Share Sheet and
	// lets a Messages automation hand it the SMS.
	WFWorkflowTypes: ["NCWidget", "WatchKit", "ActionExtension"],
	WFWorkflowInputContentItemClasses: ["WFStringContentItem"],
	WFWorkflowOutputContentItemClasses: [],
	WFQuickActionSurfaces: [],
	WFWorkflowHasShortcutInputVariables: true,
	WFWorkflowImportQuestions: [
		{
			ActionIndex: 1,
			Category: "Parameter",
			ParameterKey: "WFTextActionText",
			Text: "Paste an Eventual API key (create one under API keys)",
			DefaultValue: "",
		},
		{
			ActionIndex: 2,
			Category: "Parameter",
			ParameterKey: "WFTextActionText",
			Text: "Your Eventual URL, without a trailing slash",
			DefaultValue: defaultOrigin,
		},
	],
	WFWorkflowActions: actions,
};

signShortcut(workflow, output);
console.log(
	`Signed shortcut (${actions.length} actions) written to ${output}`,
);
