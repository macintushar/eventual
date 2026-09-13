import { useCallback, useMemo, useState } from "react";

import { cn } from "#/lib/utils";

export type Step = {
	/** Stable key, also what `useStepper` reports as the current step. */
	id: string;
	title: string;
	description?: string;
};

/**
 * Position in a multi-step form. Steps can be declared conditionally — the
 * expense composer drops its group step when editing — so the index is clamped
 * against the list it is given rather than trusted.
 */
export function useStepper(steps: Step[], initialId?: string) {
	const initial = Math.max(
		0,
		steps.findIndex((step) => step.id === initialId),
	);
	const [index, setIndex] = useState(initial);
	const clamped = Math.min(index, steps.length - 1);

	const goTo = useCallback(
		(next: number) =>
			setIndex(Math.min(Math.max(next, 0), Math.max(steps.length - 1, 0))),
		[steps.length],
	);

	return useMemo(
		() => ({
			index: clamped,
			step: steps[clamped],
			id: steps[clamped]?.id,
			count: steps.length,
			isFirst: clamped === 0,
			isLast: clamped === steps.length - 1,
			goTo,
			next: () => goTo(clamped + 1),
			back: () => goTo(clamped - 1),
			reset: () => setIndex(initial),
		}),
		[clamped, steps, goTo, initial],
	);
}

/**
 * The progress rail. Steps already passed stay reachable, so a review step can
 * send you back to fix one thing without re-walking the whole form; steps ahead
 * are inert, because the form does not yet know if you may enter them.
 */
export function StepperRail({
	steps,
	index,
	onSelect,
	className,
}: {
	steps: Step[];
	index: number;
	onSelect?: (index: number) => void;
	className?: string;
}) {
	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<ol className="flex items-center gap-1.5">
				{steps.map((step, position) => {
					const state =
						position < index ? "done" : position === index ? "current" : "todo";
					return (
						<li key={step.id} className="flex-1">
							<button
								type="button"
								className="stepper-segment"
								data-state={state}
								disabled={position > index || !onSelect}
								aria-current={state === "current" ? "step" : undefined}
								aria-label={`Step ${position + 1} of ${steps.length}: ${step.title}`}
								onClick={() => onSelect?.(position)}
							/>
						</li>
					);
				})}
			</ol>
			<p className="text-xs text-muted-foreground">
				Step {index + 1} of {steps.length} ·{" "}
				<span className="font-medium text-foreground">
					{steps[index]?.title}
				</span>
			</p>
		</div>
	);
}
