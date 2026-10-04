import assert from "node:assert/strict";
import { test } from "node:test";

import { CONDITION, createBuilder } from "./shortcut-lib";

type Entry = {
	WFWorkflowActionIdentifier: string;
	WFWorkflowActionParameters: Record<string, unknown>;
};

test("If, Otherwise and End If are modes of the same action", () => {
	const { actions, varRef, beginIf, otherwise, endIf } = createBuilder();
	const group = beginIf(varRef("Input"), CONDITION.hasValue);
	otherwise(group);
	endIf(group);

	assert.equal(actions.length, 3);
	for (const [index, entry] of (actions as Entry[]).entries()) {
		assert.equal(
			entry.WFWorkflowActionIdentifier,
			"is.workflow.actions.conditional",
		);
		assert.equal(entry.WFWorkflowActionParameters.WFControlFlowMode, index);
		assert.equal(entry.WFWorkflowActionParameters.GroupingIdentifier, group);
	}
});

test("If names its subject; a bare attachment imports blank", () => {
	const { actions, varRef, beginIf } = createBuilder();
	beginIf(varRef("Count"), CONDITION.lessThanOrEqual, { number: 1 });

	const parameters = (actions[0] as Entry).WFWorkflowActionParameters;
	assert.deepEqual(parameters.WFInput, {
		Type: "Variable",
		Variable: {
			Value: { Type: "Variable", VariableName: "Count" },
			WFSerializationType: "WFTextTokenAttachment",
		},
	});
	assert.equal(parameters.WFCondition, 1);
	assert.equal(parameters.WFNumberValue, "1");
});

test("Set Variable stores an explicit source", () => {
	const { actions, action, setVar } = createBuilder();
	const clipboard = action("getclipboard", {}, "Clipboard");
	setVar("Source", clipboard);

	const parameters = (actions[1] as Entry).WFWorkflowActionParameters;
	assert.equal(parameters.WFVariableName, "Source");
	assert.deepEqual(parameters.WFInput, {
		Value: {
			Type: "ActionOutput",
			OutputUUID: clipboard.kind === "action" ? clipboard.uuid : "",
			OutputName: "Clipboard",
		},
		WFSerializationType: "WFTextTokenAttachment",
	});
});
