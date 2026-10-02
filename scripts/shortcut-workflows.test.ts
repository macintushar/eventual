import assert from "node:assert/strict";
import { test } from "node:test";
import { buildShortcut } from "./build-shortcut";
import { buildAiShortcut } from "./build-shortcut-ai";

type Action = {
	WFWorkflowActionIdentifier: string;
	WFWorkflowActionParameters: Record<string, any>;
};

for (const build of [buildShortcut, buildAiShortcut]) {
	test(`${build.name}: complete workflow has balanced branches and valid output references`, () => {
		const workflow = build("https://example.com");
		const stack: string[] = [];
		const outputs = new Set<string>();
		for (const raw of workflow.WFWorkflowActions) {
			const a = raw as Action;
			const p = a.WFWorkflowActionParameters;
			const visit = (value: any) => {
				if (!value || typeof value !== "object") return;
				if (value.Type === "ActionOutput")
					assert.ok(
						outputs.has(value.OutputUUID),
						`Missing preceding output ${value.OutputUUID}`,
					);
				for (const item of Object.values(value)) visit(item);
			};
			visit(p);
			assert.ok(!/\.(otherwise|endif)$/.test(a.WFWorkflowActionIdentifier));
			if (a.WFWorkflowActionIdentifier.endsWith(".conditional")) {
				if (p.WFControlFlowMode === 0) stack.push(p.GroupingIdentifier);
				else {
					assert.equal(stack.at(-1), p.GroupingIdentifier);
					if (p.WFControlFlowMode === 2) stack.pop();
				}
			}
			if (p.UUID) outputs.add(p.UUID);
		}
		assert.equal(stack.length, 0);
		for (const q of workflow.WFWorkflowImportQuestions) {
			const action = workflow.WFWorkflowActions[q.ActionIndex] as Action;
			assert.equal(
				action.WFWorkflowActionIdentifier,
				"is.workflow.actions.gettext",
			);
			assert.ok(q.ParameterKey in action.WFWorkflowActionParameters);
		}
	});
}

// Interpret the generated SMS prefix to verify its actual branches rather than
// merely comparing regex source strings. Stop before the first network action.
function runSms(input: string) {
	const vars: Record<string, any> = {};
	const outputs: Record<string, any> = {};
	const actions = buildShortcut().WFWorkflowActions as Action[];
	let prompts = 0;
	let notifications = 0;
	const value = (v: any): any => {
		if (typeof v !== "object" || v === null) return v;
		if (v.Variable) return value(v.Variable);
		if (v.Value) return value(v.Value);
		if (v.Type === "Variable") return vars[v.VariableName];
		if (v.Type === "ActionOutput") return outputs[v.OutputUUID];
		if (v.Type === "ExtensionInput") return input;
		if (typeof v.string === "string") {
			let result = v.string;
			for (const [range, ref] of Object.entries(
				v.attachmentsByRange ?? {},
			).reverse()) {
				const index = Number(range.match(/\d+/)?.[0]);
				result =
					result.slice(0, index) + (value(ref) ?? "") + result.slice(index + 1);
			}
			return result;
		}
		return v;
	};
	const has = (v: any) =>
		v != null && v !== "" && (!Array.isArray(v) || v.length > 0);
	for (let i = 0; i < actions.length; i++) {
		const a = actions[i];
		const p = a.WFWorkflowActionParameters;
		const kind = a.WFWorkflowActionIdentifier.replace(
			"is.workflow.actions.",
			"",
		);
		let result: any;
		if (kind === "conditional") {
			if (p.WFControlFlowMode === 2) continue;
			const subject = value(p.WFInput);
			const matched =
				p.WFCondition === 100
					? has(subject)
					: p.WFCondition === 101
						? !has(subject)
						: String(subject ?? "").includes(
								value(p.WFConditionalActionString),
							);
			if (p.WFControlFlowMode === 1 || !matched) {
				while (++i < actions.length) {
					const q = actions[i].WFWorkflowActionParameters;
					if (
						q.GroupingIdentifier === p.GroupingIdentifier &&
						(q.WFControlFlowMode === 2 ||
							(p.WFControlFlowMode === 0 && q.WFControlFlowMode === 1))
					)
						break;
				}
			}
			continue;
		}
		if (kind === "exit") return { stopped: true, prompts, notifications };
		if (kind === "downloadurl")
			return { stopped: false, prompts, notifications, amount: vars.Amount };
		if (kind === "setvariable") vars[p.WFVariableName] = value(p.WFInput);
		if (kind === "gettext") result = value(p.WFTextActionText);
		if (kind === "getdevicedetails") result = "iPhone";
		if (kind === "text.match")
			result =
				String(value(p.text) ?? "").match(
					new RegExp(p.WFTextMatchPattern, "gi"),
				) ?? [];
		if (kind === "getitemfromlist") result = value(p.WFInput)?.[0];
		if (kind === "text.replace")
			result = String(value(p.WFInput)).replaceAll(
				p.WFReplaceTextFind,
				p.WFReplaceTextReplace,
			);
		if (kind === "text.changecase")
			result = String(value(p.text)).toUpperCase();
		if (kind === "notification") notifications++;
		if (kind === "ask") prompts++;
		if (p.UUID) outputs[p.UUID] = result;
	}
	throw new Error("Workflow never stopped or reached its request");
}

test("SMS automation skips credits, OTPs, balance alerts and missing amounts without prompts", () => {
	for (const sms of [
		"INR 500 credited",
		"OTP 123456 for payment of INR 500",
		"Available balance INR 500",
		"Your account was debited",
		"Payment of INR 500 failed",
		"Payment due INR 500",
		"Payment reminder: INR 500 for your card",
	]) {
		const result = runSms(sms);
		assert.equal(result.stopped, true, sms);
		assert.equal(result.prompts, 0, sms);
		assert.equal(result.notifications, 1, sms);
	}
	const spent = runSms("INR 1,250.00 debited at AMAZON on 27-Sep");
	assert.equal(spent.stopped, false);
	assert.equal(spent.prompts, 0);
	assert.equal(spent.amount, "1250.00");
	for (const [sms, amount] of [
		["INR 500 charged to your card at AMAZON", "500"],
		["INR 500 sent to ROHIT via UPI", "500"],
		["Payment of INR 500 to SWIGGY successful", "500"],
		["INR 750 debited at UBER. Next payment due on 05-Oct", "750"],
		["Reminder: INR 300 spent at STARBUCKS", "300"],
	]) {
		const result = runSms(sms);
		assert.equal(result.stopped, false, sms);
		assert.equal(result.prompts, 0, sms);
		assert.equal(result.amount, amount, sms);
	}
});

test("AI group cache write runs after all group selection branches", () => {
	const actions = buildAiShortcut().WFWorkflowActions as Action[];
	const save = actions.findIndex((a) =>
		a.WFWorkflowActionIdentifier.endsWith(".documentpicker.save"),
	);
	assert.ok(save > 0);
	const stack: string[] = [];
	for (const a of actions.slice(0, save)) {
		const p = a.WFWorkflowActionParameters;
		if (!a.WFWorkflowActionIdentifier.endsWith(".conditional")) continue;
		if (p.WFControlFlowMode === 0) stack.push(p.GroupingIdentifier);
		if (p.WFControlFlowMode === 2) stack.pop();
	}
	// Only the successful-parse guard may surround the shared cache write.
	assert.equal(stack.length, 1);
	assert.equal(
		actions[save].WFWorkflowActionParameters.WFInput.Value.VariableName,
		"GroupId",
	);
});
