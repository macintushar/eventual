import type { ReactNode } from "react";
import { useState } from "react";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Spinner } from "#/components/ui/spinner";

/**
 * Confirm-first dialog for actions that change public state — deletions,
 * removals, revocations, leaving. The trigger never runs the action itself;
 * it asks, and the stateful verb on the confirm button is what runs it, so
 * the record being confirmed is still on screen while the dialog is up.
 *
 * Render with a `trigger` node to keep the open state inside the dialog, or
 * with `open`/`onOpenChange` to drive it from a menu or sheet that has to
 * stay mounted while the question is being asked.
 *
 * `onConfirm` returning `false` keeps the dialog up, so a failed action
 * leaves its confirmation on screen; the caller owns the error toast.
 */
export function ConfirmDialog({
	trigger,
	open,
	onOpenChange,
	media,
	title,
	description,
	confirmLabel,
	onConfirm,
	pending,
}: {
	trigger?: ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	media?: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	/** Verb-first, and repeats the consequence rather than answering "Yes". */
	confirmLabel: ReactNode;
	onConfirm: () => Promise<boolean | undefined> | boolean | undefined;
	pending?: boolean;
}) {
	const [triggered, setTriggered] = useState(false);
	const isControlled = open !== undefined;
	const isOpen = isControlled ? open : triggered;
	const setOpen = (next: boolean) => {
		if (isControlled) {
			onOpenChange?.(next);
		} else {
			setTriggered(next);
		}
	};

	const content = (
		<AlertDialogContent>
			<AlertDialogHeader>
				{media ? (
					<AlertDialogMedia className="bg-destructive/10 text-destructive">
						{media}
					</AlertDialogMedia>
				) : null}
				<AlertDialogTitle>{title}</AlertDialogTitle>
				{description ? (
					<AlertDialogDescription>{description}</AlertDialogDescription>
				) : null}
			</AlertDialogHeader>
			<AlertDialogFooter>
				<AlertDialogCancel>Cancel</AlertDialogCancel>
				<AlertDialogAction
					variant="destructive"
					disabled={pending}
					onClick={async (event) => {
						// The action stays open until confirmed, so a dropped connection
						// doesn't leave the answer given but the record still there.
						event.preventDefault();
						if ((await onConfirm()) !== false) setOpen(false);
					}}
				>
					{pending ? <Spinner data-icon="inline-start" /> : null}
					{confirmLabel}
				</AlertDialogAction>
			</AlertDialogFooter>
		</AlertDialogContent>
	);

	if (trigger === undefined) {
		return (
			<AlertDialog open={isOpen} onOpenChange={setOpen}>
				{content}
			</AlertDialog>
		);
	}
	return (
		<AlertDialog open={isOpen} onOpenChange={setOpen}>
			<AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
			{content}
		</AlertDialog>
	);
}
