import assert from "node:assert/strict";
import { test } from "node:test";

import { CONDITION, createBuilder } from "./shortcut-lib";

test("If, Otherwise and End If are modes of the same action", () => {
	const { actions, beginIf, otherwise, endIf } = createBuilder();
	const group = beginIf(CONDITION.hasValue);
	otherwise(group);
	endIf(group);

	assert.equal(actions.length, 3);
	for (const [index, entry] of actions.entries()) {
		const action = entry as {
			WFWorkflowActionIdentifier: string;
			WFWorkflowActionParameters: {
				WFControlFlowMode: number;
				GroupingIdentifier: string;
			};
		};
		assert.equal(
			action.WFWorkflowActionIdentifier,
			"is.workflow.actions.conditional",
		);
		assert.equal(action.WFWorkflowActionParameters.WFControlFlowMode, index);
		assert.equal(action.WFWorkflowActionParameters.GroupingIdentifier, group);
	}
});
