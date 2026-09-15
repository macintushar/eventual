import { ArrowLeft } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import {
	hasOpenPopup,
	PopupContainerProvider,
} from "#/components/ui/popup-container";
import { Spinner } from "#/components/ui/spinner";
import { type Step, StepperRail } from "#/components/ui/stepper";
import { cn } from "#/lib/utils";

/**
 * The shell every stepped form in the app shares: a dialog on a desktop, a
 * bottom sheet on a phone (see the dialog rules in styles.css), with a progress
 * rail under the title and a fixed footer carrying Back and the one forward
 * action. Only the step's own fields scroll.
 *
 * Callers own their state; this owns the chrome.
 */
export function StepDialog({
	open,
	onOpenChange,
	title,
	description,
	steps,
	index,
	onSelectStep,
	onBack,
	onNext,
	nextLabel,
	nextDisabled,
	nextHint,
	pending,
	className,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: ReactNode;
	description?: ReactNode;
	steps: Step[];
	index: number;
	onSelectStep?: (index: number) => void;
	onBack?: () => void;
	onNext: () => void;
	nextLabel: string;
	nextDisabled?: boolean;
	/** Says what is missing when the forward action is blocked. */
	nextHint?: ReactNode;
	pending?: boolean;
	className?: string;
	children: ReactNode;
}) {
	/*
	 * A callback ref rather than `useRef`, because the element only exists once
	 * the dialog has mounted and the popups portalling into it have to re-render
	 * when it appears. See `popup-container.tsx` for why they portal here at all.
	 */
	const [content, setContent] = useState<HTMLElement | null>(null);

	/*
	 * The fields ease in from the side you are heading, so forward and back
	 * feel like moving along the same rail the progress bars draw. WAAPI rather
	 * than a `key`, which would remount the step and throw away its state; a
	 * layout effect, so the new step never paints before it starts moving.
	 */
	const body = useRef<HTMLDivElement>(null);
	const previousIndex = useRef(index);
	useLayoutEffect(() => {
		const from = previousIndex.current;
		previousIndex.current = index;
		if (from === index || !body.current) return;

		const reduced = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		const offset = index > from ? 12 : -12;
		body.current.animate(
			[
				{
					opacity: 0,
					transform: reduced ? "none" : `translateX(${offset}px)`,
				},
				{ opacity: 1, transform: "none" },
			],
			{ duration: 200, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
		);
	}, [index]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				ref={setContent}
				className={cn("step-dialog sm:max-w-xl", className)}
				onOpenAutoFocus={(event) => {
					// Autofocusing the first field pops the keyboard open over a phone's
					// bottom sheet before the step has even been read.
					event.preventDefault();
				}}
				onEscapeKeyDown={(event) => {
					// An open combobox list gets the first Escape; the dialog gets the
					// second. See `hasOpenPopup`.
					if (hasOpenPopup(content)) event.preventDefault();
				}}
			>
				<PopupContainerProvider container={content}>
					<DialogHeader>
						<DialogTitle className="display-title text-2xl font-bold">
							{title}
						</DialogTitle>
						{description ? (
							<DialogDescription>{description}</DialogDescription>
						) : null}
					</DialogHeader>

					<StepperRail
						steps={steps}
						index={index}
						onSelect={pending ? undefined : onSelectStep}
					/>

					<div ref={body} className="step-dialog-body">
						{children}
					</div>

					<div className="flex flex-col gap-2">
						<div className="flex items-center gap-2">
							{index > 0 ? (
								<Button
									type="button"
									variant="outline"
									size="lg"
									className="press"
									disabled={pending}
									onClick={onBack}
								>
									<ArrowLeft data-icon="inline-start" />
									Back
								</Button>
							) : null}
							<Button
								type="button"
								size="lg"
								className="press flex-1"
								disabled={nextDisabled || pending}
								onClick={onNext}
							>
								{pending ? <Spinner data-icon="inline-start" /> : null}
								{nextLabel}
							</Button>
						</div>
						{nextHint && !pending ? (
							<p className="text-center text-xs text-muted-foreground">
								{nextHint}
							</p>
						) : null}
					</div>
				</PopupContainerProvider>
			</DialogContent>
		</Dialog>
	);
}
