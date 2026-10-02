/**
 * Shared plist-building helpers for the Eventual shortcut generators
 * (`build-shortcut.ts`, `build-shortcut-ai.ts`).
 *
 * Shortcuts marks an inline variable with U+FFFC plus a range attachment.
 * These helpers keep UUIDs, variable wiring and control-flow grouping
 * consistent so the generators stay declarative. Never hardcode UUIDs.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OBJECT_REPLACEMENT = "￼";

export type Ref =
	| { kind: "action"; uuid: string; name: string }
	| { kind: "variable"; name: string };

const attachment = (ref: Ref) =>
	ref.kind === "variable"
		? { Type: "Variable", VariableName: ref.name }
		: {
				Type: "ActionOutput",
				OutputUUID: ref.uuid,
				OutputName: ref.name,
			};

export const variable = (ref: Ref) => ({
	Value: attachment(ref),
	WFSerializationType: "WFTextTokenAttachment",
});

export function text(...parts: (string | Ref)[]) {
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

export function dictionary(
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

/**
 * An action's main input. Conditionals need it wrapped in a Variable
 * parameter; a bare attachment imports as a blank field.
 */
export const conditionInput = (ref: Ref) => ({
	Type: "Variable",
	Variable: variable(ref),
});

/**
 * WFCondition codes. There is no numeric "equals": 0 is "is less than" and
 * 1 is "is less than or equal to".
 */
export const CONDITION = {
	lessThanOrEqual: 1,
	equalsString: 4,
	contains: 99,
	hasValue: 100,
	noValue: 101,
} as const;

export function createBuilder() {
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
		return { kind: "action", uuid, name: outputName };
	}

	const varRef = (name: string): Ref => ({ kind: "variable", name });

	/**
	 * Set Variable from an explicit source. Relying on the previous action's
	 * output imports as an empty input on current Shortcuts versions.
	 */
	function setVar(name: string, from: Ref) {
		action(
			"setvariable",
			{ WFVariableName: name, WFInput: variable(from) },
			name,
		);
	}

	/** The compare value is omitted for the has/no-value tests. */
	function beginIf(
		subject: Ref,
		condition: (typeof CONDITION)[keyof typeof CONDITION],
		compare?: { string?: (string | Ref)[]; number?: number },
	) {
		const grouping = crypto.randomUUID().toUpperCase();
		const parameters: Record<string, unknown> = {
			WFControlFlowMode: 0,
			GroupingIdentifier: grouping,
			WFCondition: condition,
			WFInput: conditionInput(subject),
		};
		if (compare?.string)
			parameters.WFConditionalActionString = text(...compare.string);
		if (compare?.number !== undefined)
			parameters.WFNumberValue = String(compare.number);
		actions.push({
			WFWorkflowActionIdentifier: "is.workflow.actions.conditional",
			WFWorkflowActionParameters: parameters,
		});
		return grouping;
	}

	function otherwise(grouping: string) {
		actions.push({
			WFWorkflowActionIdentifier: "is.workflow.actions.conditional",
			WFWorkflowActionParameters: {
				WFControlFlowMode: 1,
				GroupingIdentifier: grouping,
				UUID: crypto.randomUUID().toUpperCase(),
			},
		});
	}

	function endIf(grouping: string) {
		actions.push({
			WFWorkflowActionIdentifier: "is.workflow.actions.conditional",
			WFWorkflowActionParameters: {
				WFControlFlowMode: 2,
				GroupingIdentifier: grouping,
				UUID: crypto.randomUUID().toUpperCase(),
			},
		});
	}

	return { actions, action, varRef, setVar, beginIf, otherwise, endIf };
}

/** Convert to a binary plist and sign so iOS/macOS will import it. */
export function signShortcut(workflow: object, output: string) {
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
}
