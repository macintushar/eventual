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
	signShortcut,
	text,
	variable,
} from "./shortcut-lib";

const defaultOrigin = process.argv[2] ?? process.env.BETTER_AUTH_URL ?? "";
const output = join(import.meta.dirname, "../public/eventual.shortcut");

const { actions, action, varRef, getVar, setVar, beginIf, otherwise, endIf } =
	createBuilder();

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
action("getdevicedetails", { WFDeviceDetail: "Device Model" }, "Device Model");
setVar("DeviceModel");
getVar("DeviceModel");
const watchIf = beginIf(CONDITION.contains, { string: ["Watch"] });
action("gettext", { WFTextActionText: "yes" }, "Text");
setVar("OnWatch");
endIf(watchIf);

// ——— What are we parsing? ———
// Text input (Share Sheet or a Messages automation) if there is any —
// coerced to text so a Message object becomes its body — else the clipboard
// as a manual "copy the SMS first" fallback.
getVar("Input");
const inputIf = beginIf(CONDITION.hasValue);
getVar("Input");
action("gettext", { WFTextActionText: text(varRef("Input")) }, "Text");
setVar("Source");
otherwise(inputIf);
getVar("OnWatch");
const clipboardIf = beginIf(CONDITION.noValue);
action("getclipboard", {}, "Clipboard");
setVar("Source");
endIf(clipboardIf);
endIf(inputIf);

// ——— Parse amount, currency, merchant ———
getVar("Source");
action(
	"text.match",
	{ WFTextMatchPattern: AMOUNT_RE, WFTextMatchCaseSensitive: false },
	"Matches",
);
setVar("AmountMatches");
getVar("AmountMatches");
const amountIf = beginIf(CONDITION.hasValue);
action(
	"getitemfromlist",
	{
		WFInput: variable(varRef("AmountMatches")),
		WFItemSpecifier: "First Item",
	},
	"Item from List",
);
action(
	"text.replace",
	{
		WFReplaceTextFind: ",",
		WFReplaceTextReplace: "",
		WFReplaceTextRegularExpression: false,
		WFReplaceTextCaseSensitive: false,
	},
	"Updated Text",
);
setVar("AmountParsed");
endIf(amountIf);

getVar("Source");
action(
	"text.match",
	{ WFTextMatchPattern: CURRENCY_RE, WFTextMatchCaseSensitive: false },
	"Matches",
);
setVar("CurrencyMatches");
getVar("CurrencyMatches");
const currencyIf = beginIf(CONDITION.hasValue);
action(
	"getitemfromlist",
	{
		WFInput: variable(varRef("CurrencyMatches")),
		WFItemSpecifier: "First Item",
	},
	"Item from List",
);
action("text.changecase", { WFCaseType: "UPPERCASE" }, "Text");
setVar("CurrencyToken");
action("dictionary", { WFItems: CURRENCY_MAP }, "Dictionary");
setVar("CurrencyMap");
action(
	"getvalueforkey",
	{
		WFInput: variable(varRef("CurrencyMap")),
		WFGetDictionaryValueType: "Value",
		WFDictionaryKey: text(varRef("CurrencyToken")),
	},
	"Dictionary Value",
);
setVar("Currency");
endIf(currencyIf);
getVar("Currency");
const currencyDefaultIf = beginIf(CONDITION.noValue);
action("gettext", { WFTextActionText: "INR" }, "Text");
setVar("Currency");
endIf(currencyDefaultIf);

getVar("Source");
action(
	"text.match",
	{ WFTextMatchPattern: MERCHANT_RE, WFTextMatchCaseSensitive: false },
	"Matches",
);
setVar("MerchantMatches");
getVar("MerchantMatches");
const merchantIf = beginIf(CONDITION.hasValue);
action(
	"getitemfromlist",
	{
		WFInput: variable(varRef("MerchantMatches")),
		WFItemSpecifier: "First Item",
	},
	"Item from List",
);
setVar("Description");
endIf(merchantIf);
getVar("Description");
const merchantDefaultIf = beginIf(CONDITION.noValue);
action("gettext", { WFTextActionText: "Quick expense" }, "Text");
setVar("Description");
endIf(merchantDefaultIf);

// ——— Amount ———
// With text input, log straight away when the amount parsed (a Messages
// automation can't wait around for prompts). Run by hand, ask — with the
// parsed clipboard amount pre-filled when there is one.
getVar("Input");
const autoIf = beginIf(CONDITION.hasValue);
getVar("AmountParsed");
const autoAskIf = beginIf(CONDITION.noValue);
action(
	"ask",
	{ WFAskActionPrompt: "How much?", WFInputType: "Number" },
	"Provided Input",
);
setVar("Amount");
otherwise(autoAskIf);
getVar("AmountParsed");
setVar("Amount");
endIf(autoAskIf);
otherwise(autoIf);
action(
	"ask",
	{
		WFAskActionPrompt: "How much?",
		WFInputType: "Number",
		WFAskActionDefaultAnswer: text(varRef("AmountParsed")),
	},
	"Provided Input",
);
setVar("Amount");
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
action(
	"detect.dictionary",
	{ WFInput: variable(groupsResponse) },
	"Dictionary",
);
setVar("Groups");
action(
	"getvalueforkey",
	{
		WFInput: variable(varRef("Groups")),
		WFGetDictionaryValueType: "All Values",
	},
	"Dictionary Value",
);
setVar("GroupIds");

getVar("OnWatch");
const cacheReadIf = beginIf(CONDITION.noValue);
action(
	"documentpicker.open",
	{
		WFGetFilePath: CACHE_PATH,
		WFShowFilePicker: false,
		WFFileErrorIfNotFound: false,
	},
	"File",
);
setVar("CachedGroup");
endIf(cacheReadIf);

getVar("GroupIds");
const cachedIf = beginIf(CONDITION.contains, {
	string: [varRef("CachedGroup")],
});
getVar("CachedGroup");
setVar("GroupId");
otherwise(cachedIf);
getVar("GroupIds");
action("count", { WFCountType: "Items" }, "Count");
setVar("GroupCount");
getVar("GroupCount");
const singleIf = beginIf(CONDITION.equalsNumber, { number: 1 });
action(
	"getitemfromlist",
	{
		WFInput: variable(varRef("GroupIds")),
		WFItemSpecifier: "First Item",
	},
	"Item from List",
);
setVar("GroupId");
otherwise(singleIf);
action(
	"choosefromlist",
	{
		WFInput: variable(varRef("Groups")),
		WFChooseFromListActionPrompt: "Which group?",
	},
	"Chosen Item",
);
setVar("GroupId");
endIf(singleIf);
getVar("OnWatch");
const cacheWriteIf = beginIf(CONDITION.noValue);
action(
	"documentpicker.save",
	{
		WFInput: variable(varRef("GroupId")),
		WFFileDestinationPath: CACHE_PATH,
		WFSaveFileOverwrite: true,
	},
	"File",
);
endIf(cacheWriteIf);
endIf(cachedIf);

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
