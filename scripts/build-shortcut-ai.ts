/**
 * Builds `public/eventual-ai.shortcut`: the Apple Intelligence variant of
 * the Eventual quick logger. Kept separate from `eventual.shortcut` so the
 * regex-based one keeps working everywhere — this one needs a device with
 * Apple Intelligence (iOS/macOS 18.1 or later, no Watch).
 *
 * Two ways in:
 *  - Action Button / Siri / Home Screen (no input): ask "What did you
 *    spend?" — type or dictate something like "auto 340" or "goa dinner
 *    1200". Apple Intelligence reads the amount, currency, description and
 *    even picks the group when a group name appears in the text.
 *  - Share Sheet or a Messages automation (text input): hand it a bank SMS
 *    in any format — no regex maintenance — and it logs without asking.
 *
 * Group caching shares `Shortcuts/Eventual/last-group.txt` with the main
 * shortcut, so a choice made in one carries over to the other.
 *
 * Import asks for the user's API key and Eventual URL.
 *
 * macOS only — signing needs the `shortcuts` CLI.
 *   bun run shortcut:build-ai [https://your-eventual-url]
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
const output = join(import.meta.dirname, "../public/eventual-ai.shortcut");

const { actions, action, varRef, getVar, setVar, beginIf, otherwise, endIf } =
	createBuilder();

/** Shared with the main shortcut so the choice carries over. */
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

/** Light gate so only money talk gets pre-filled from the clipboard. */
const SMS_GATE_RE =
	"(?:Rs\\.?|INR|₹|US\\$|\\$|USD|EUR|€|GBP|£|AED|Dhs?)\\s{0,2}\\d";

// ——— What did you spend? ———
// Text input (Share Sheet or a Messages automation) if there is any —
// coerced to text so a Message object becomes its body. Otherwise ask in
// plain language; a copied bank SMS is pre-filled for confirmation.
getVar("Input");
const inputIf = beginIf(CONDITION.hasValue);
getVar("Input");
action("gettext", { WFTextActionText: text(varRef("Input")) }, "Text");
setVar("Source");
otherwise(inputIf);
action("getclipboard", {}, "Clipboard");
setVar("Clipboard");
getVar("Clipboard");
action(
	"text.match",
	{ WFTextMatchPattern: SMS_GATE_RE, WFTextMatchCaseSensitive: false },
	"Matches",
);
setVar("ClipboardHits");
getVar("ClipboardHits");
const clipIf = beginIf(CONDITION.hasValue);
getVar("Clipboard");
setVar("AskDefault");
endIf(clipIf);
action(
	"ask",
	{
		WFAskActionPrompt: "What did you spend?",
		WFInputType: "Text",
		WFAskActionDefaultAnswer: text(varRef("AskDefault")),
	},
	"Provided Input",
);
setVar("Source");
endIf(inputIf);

// ——— Groups ———
// Fetched before the model call so the prompt can offer real group names.
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
action(
	"getvalueforkey",
	{
		WFInput: variable(varRef("Groups")),
		WFGetDictionaryValueType: "All Keys",
	},
	"Dictionary Value",
);
setVar("GroupKeys");
getVar("GroupKeys");
action(
	"text.combine",
	{ WFTextSeparator: "Custom", WFTextCustomSeparator: ", " },
	"Combined Text",
);
setVar("GroupNames");

// ——— Apple Intelligence ———
// One on-device call returns JSON. The brace match guards against the model
// wrapping the answer in markdown fences or a sentence of preamble.
const prompt = text(
	"Read the expense text and reply with JSON only, no other text or markdown:\n",
	'{"amount": number or null, "currency": "ISO 4217 code", "description": "merchant or purpose, a few words", "group": "one of the group names below, or null"}\n',
	"- If this is an OTP, balance update, incoming credit, refund, failed or reversed transaction, return amount null. Never infer a purchase from an available balance.\n",
	"- amount: the money spent in major units, digits and a dot only, no commas\n",
	"- currency from the symbol: ₹ or Rs = INR, $ = USD, € = EUR, £ = GBP, Dh or AED = AED. No symbol = INR\n",
	"- description: no dates, balances or reference numbers\n",
	"- group: pick the group this expense belongs to from: ",
	varRef("GroupNames"),
	" — else null\n",
	"- when several amounts appear, the expense is the money spent, never an available balance\n\n",
	'Text:\n"""\n',
	varRef("Source"),
	'\n"""',
);
action(
	"askllm",
	{
		WFLLMPrompt: prompt,
		WFLLMModel: "Apple Intelligence on Device",
		WFGenerativeResultType: "Text",
		WFLLMFollowUp: false,
	},
	"Response",
);
setVar("AIResponse");

getVar("AIResponse");
action(
	"text.match",
	{ WFTextMatchPattern: "\\{[\\s\\S]*\\}", WFTextMatchCaseSensitive: false },
	"Matches",
);
setVar("JsonMatches");
getVar("JsonMatches");
const jsonIf = beginIf(CONDITION.hasValue);
action(
	"getitemfromlist",
	{
		WFInput: variable(varRef("JsonMatches")),
		WFItemSpecifier: "First Item",
	},
	"Item from List",
);
action("detect.dictionary", {}, "Dictionary");
setVar("Parsed");
endIf(jsonIf);

// ——— Everything after a successful parse; otherwise say so and stop ———
getVar("Parsed");
const parsedIf = beginIf(CONDITION.hasValue);

action(
	"getvalueforkey",
	{
		WFInput: variable(varRef("Parsed")),
		WFGetDictionaryValueType: "Value",
		WFDictionaryKey: "amount",
	},
	"Dictionary Value",
);
setVar("Amount");
getVar("Amount");
const amountIf = beginIf(CONDITION.noValue);
action(
	"notification",
	{
		WFNotificationActionTitle: "Eventual",
		WFNotificationActionBody: "Couldn't find an amount in that — nothing logged.",
	},
	"Notification",
);
action("exit", {}, "Exit");
endIf(amountIf);

action(
	"getvalueforkey",
	{
		WFInput: variable(varRef("Parsed")),
		WFGetDictionaryValueType: "Value",
		WFDictionaryKey: "currency",
	},
	"Dictionary Value",
);
setVar("Currency");
getVar("Currency");
const currencyDefaultIf = beginIf(CONDITION.noValue);
action("gettext", { WFTextActionText: "INR" }, "Text");
setVar("Currency");
endIf(currencyDefaultIf);

action(
	"getvalueforkey",
	{
		WFInput: variable(varRef("Parsed")),
		WFGetDictionaryValueType: "Value",
		WFDictionaryKey: "description",
	},
	"Dictionary Value",
);
setVar("Description");
getVar("Description");
const descriptionDefaultIf = beginIf(CONDITION.noValue);
action("gettext", { WFTextActionText: "Quick expense" }, "Text");
setVar("Description");
endIf(descriptionDefaultIf);

// The model's group guess only wins if it names a real group exactly.
action(
	"getvalueforkey",
	{
		WFInput: variable(varRef("Parsed")),
		WFGetDictionaryValueType: "Value",
		WFDictionaryKey: "group",
	},
	"Dictionary Value",
);
setVar("GroupGuess");
getVar("GroupGuess");
const guessKeyIf = beginIf(CONDITION.hasValue);
action(
	"getvalueforkey",
	{
		WFInput: variable(varRef("Groups")),
		WFGetDictionaryValueType: "Value",
		WFDictionaryKey: text(varRef("GroupGuess")),
	},
	"Dictionary Value",
);
setVar("GuessedGroupId");
endIf(guessKeyIf);

// Group: the model's guess, else the cached group while it still exists,
// else the single group, else ask once and remember.
getVar("GuessedGroupId");
const guessIf = beginIf(CONDITION.hasValue);
getVar("GuessedGroupId");
setVar("GroupId");
otherwise(guessIf);
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
action(
	"documentpicker.save",
	{
		WFInput: variable(varRef("GroupId")),
		WFFileDestinationPath: CACHE_PATH,
		WFSaveFileOverwrite: true,
	},
	"File",
);
endIf(cachedIf);
endIf(guessIf);

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

otherwise(parsedIf);
action(
	"notification",
	{
		WFNotificationActionTitle: "Eventual",
		WFNotificationActionBody:
			"Apple Intelligence couldn't read an expense from that — nothing logged.",
	},
	"Notification",
);
endIf(parsedIf);

const workflow = {
	WFWorkflowClientVersion: "2605.0.4",
	WFWorkflowMinimumClientVersion: 900,
	WFWorkflowMinimumClientVersionString: "900",
	WFWorkflowIcon: {
		WFWorkflowIconStartColor: 4292093695,
		WFWorkflowIconGlyphNumber: 59446,
	},
	// ActionExtension + text input puts the shortcut in the Share Sheet and
	// lets a Messages automation hand it the SMS. No WatchKit: Apple
	// Intelligence doesn't run on the Watch.
	WFWorkflowTypes: ["NCWidget", "ActionExtension"],
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
