import {
	Archive,
	ArrowLeft,
	Crown,
	HandCoins,
	LogOut,
	Trash2,
	TriangleAlert,
	UsersRound,
} from "lucide-react";
import { RadioGroup } from "radix-ui";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { Amount } from "#/components/amount";
import { MemberAvatar } from "#/components/member-avatar";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { Field, FieldError, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import { type Step, StepperRail } from "#/components/ui/stepper";
import { cn } from "#/lib/utils";

/** The slice of the group page these dialogs read; the route's loader data fits it. */
export type GroupExitData = {
	user: { id: string };
	group: {
		name: string;
		myRole: string;
		members: {
			userId: string;
			name: string;
			image?: string | null;
			role: string;
			isGuest: boolean;
		}[];
	};
	balances: {
		members: { userId: string; currency: string; balanceMinor: number }[];
		transfers: {
			from: { userId: string; name: string };
			to: { userId: string; name: string };
			amountMinor: number;
			currency: string;
		}[];
	};
};

type Transfer = GroupExitData["balances"]["transfers"][number];

/** Confirm handlers return `false` on failure so the dialog stays up, like `ConfirmDialog`. */
type Confirm<Args extends unknown[] = []> = (
	...args: Args
) => Promise<boolean | undefined> | boolean | undefined;

/**
 * Red is kept for what actually destroys something. A dialog that only stops
 * you (settle up first) is a caution, and archiving, which can be undone, is
 * neutral.
 */
const TONES = {
	danger: "bg-destructive/10 text-destructive",
	caution: "bg-warning/10 text-warning",
	neutral: "bg-muted text-foreground",
} as const;

/** Marks the control that takes focus when a stepped dialog moves to a new step. */
const STEP_FOCUS = { "data-step-focus": "" };

function DialogShell({
	open,
	onOpenChange,
	trigger,
	media,
	tone,
	title,
	description,
	steps,
	index = 0,
	onSelectStep,
	children,
	footer,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	trigger: ReactNode;
	media: ReactNode;
	tone: keyof typeof TONES;
	title: ReactNode;
	description: ReactNode;
	steps?: Step[];
	index?: number;
	onSelectStep?: (index: number) => void;
	children?: ReactNode;
	footer: ReactNode;
}) {
	/*
	 * The button that moved the step unmounts with it, which would drop focus
	 * to the document. Radix places focus on open; after that each step names
	 * where focus lands, so a keyboard user carries on from the new step.
	 */
	const content = useRef<HTMLDivElement>(null);
	const previous = useRef(index);
	useEffect(() => {
		if (previous.current === index) return;
		previous.current = index;
		content.current
			?.querySelector<HTMLElement>("[data-step-focus]")
			?.focus({ preventScroll: true });
	}, [index]);

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
			<AlertDialogContent ref={content}>
				<AlertDialogHeader>
					<AlertDialogMedia className={TONES[tone]}>{media}</AlertDialogMedia>
					<AlertDialogTitle className="text-balance [overflow-wrap:anywhere]">
						{title}
					</AlertDialogTitle>
					<AlertDialogDescription className="text-pretty [overflow-wrap:anywhere]">
						{description}
					</AlertDialogDescription>
				</AlertDialogHeader>
				{steps ? (
					<StepperRail steps={steps} index={index} onSelect={onSelectStep} />
				) : null}
				{children}
				<AlertDialogFooter>{footer}</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function BackButton({
	onClick,
	disabled,
}: {
	onClick: () => void;
	disabled?: boolean;
}) {
	return (
		<Button
			type="button"
			variant="ghost"
			disabled={disabled}
			onClick={onClick}
			className="sm:me-auto"
		>
			<ArrowLeft data-icon="inline-start" />
			Back
		</Button>
	);
}

/**
 * Who owes whom, in the viewer's terms: "You owe Sam", "Sam owes you". Every
 * row stays reachable: past four rows the list scrolls, and the fifth peeks
 * out from under the edge so it's clear there's more.
 */
function OpenDebts({
	transfers,
	meId,
}: {
	transfers: Transfer[];
	meId: string;
}) {
	return (
		<ul className="flex max-h-[10.75rem] flex-col divide-y overflow-y-auto overscroll-contain rounded-lg border text-sm">
			{transfers.map((transfer) => (
				<li
					key={`${transfer.from.userId}-${transfer.to.userId}-${transfer.currency}`}
					className="flex items-baseline justify-between gap-3 px-3 py-2"
				>
					<span className="min-w-0 [overflow-wrap:anywhere]">
						<span className="font-medium">
							{transfer.from.userId === meId ? "You" : transfer.from.name}
						</span>
						<span className="text-muted-foreground">
							{transfer.from.userId === meId ? " owe " : " owes "}
						</span>
						<span className="font-medium">
							{transfer.to.userId === meId ? "you" : transfer.to.name}
						</span>
					</span>
					<Amount
						minor={transfer.amountMinor}
						currency={transfer.currency}
						className="shrink-0 font-medium whitespace-nowrap"
					/>
				</li>
			))}
		</ul>
	);
}

function debtCount(count: number) {
	return count === 1 ? "1 debt is" : `${count} debts are`;
}

async function settle(
	confirm: () => ReturnType<Confirm>,
	setPending: (pending: boolean) => void,
	close: () => void,
) {
	setPending(true);
	try {
		if ((await confirm()) !== false) close();
	} finally {
		setPending(false);
	}
}

const LEAVE_STEPS: Step[] = [
	{ id: "owner", title: "Choose the new owner" },
	{ id: "confirm", title: "Confirm" },
];

/**
 * Leaving is a short guided flow rather than one blunt question. Anything that
 * makes it impossible is said up front, before the person has picked a
 * successor only to be turned away:
 *
 *   unsettled balance  → explain and stop
 *   owner, nobody else → explain and stop
 *   owner              → choose the new owner, then confirm
 *   anyone else        → confirm
 *
 * The server enforces all of it again; this only keeps the person informed.
 */
export function LeaveGroupDialog({
	data,
	onConfirm,
	onSettle,
	trigger,
}: {
	data: GroupExitData;
	onConfirm: Confirm<[newOwnerId?: string]>;
	/** Opens the payment form, offered when the viewer is the one who owes. */
	onSettle?: () => void;
	trigger: ReactNode;
}) {
	const meId = data.user.id;
	const errorId = useId();
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState(0);
	const options = useRef<HTMLDivElement>(null);
	const [successor, setSuccessor] = useState("");
	const [missing, setMissing] = useState(false);
	const [pending, setPending] = useState(false);

	const unsettled = data.balances.members.some(
		(row) => row.userId === meId && row.balanceMinor !== 0,
	);
	const mine = data.balances.transfers.filter(
		(row) => row.from.userId === meId || row.to.userId === meId,
	);
	const owesSomeone = mine.some((row) => row.from.userId === meId);
	const isOwner = data.group.myRole === "owner";
	const candidates = data.group.members.filter(
		(row) => row.userId !== meId && !row.isGuest,
	);
	const heir = candidates.find((row) => row.userId === successor);

	const reset = (next: boolean) => {
		if (pending) return;
		setOpen(next);
		if (!next) {
			setStep(0);
			setSuccessor("");
			setMissing(false);
		}
	};

	if (unsettled) {
		return (
			<DialogShell
				open={open}
				onOpenChange={reset}
				trigger={trigger}
				tone="caution"
				media={<HandCoins />}
				title="Settle up before you leave"
				description={
					owesSomeone
						? `You still owe money in “${data.group.name}”. Record a payment, then you can leave.`
						: `People in “${data.group.name}” still owe you. Once they've paid you back, you can leave.`
				}
				footer={
					owesSomeone && onSettle ? (
						<>
							<AlertDialogCancel>Not now</AlertDialogCancel>
							<Button
								onClick={() => {
									reset(false);
									onSettle();
								}}
							>
								<HandCoins data-icon="inline-start" />
								Record a payment
							</Button>
						</>
					) : (
						<AlertDialogCancel>Close</AlertDialogCancel>
					)
				}
			>
				{mine.length > 0 ? <OpenDebts transfers={mine} meId={meId} /> : null}
			</DialogShell>
		);
	}

	if (isOwner && candidates.length === 0) {
		return (
			<DialogShell
				open={open}
				onOpenChange={reset}
				trigger={trigger}
				tone="caution"
				media={<UsersRound />}
				title="No one can take over yet"
				description="Every group needs an owner, and guests can't be one. Invite someone with an account to hand the group to, or delete the group instead."
				footer={<AlertDialogCancel>Close</AlertDialogCancel>}
			/>
		);
	}

	const choosing = isOwner && step === 0;

	if (choosing) {
		const next = (event: FormEvent) => {
			event.preventDefault();
			if (!heir) {
				setMissing(true);
				options.current?.querySelector<HTMLElement>("button")?.focus();
				return;
			}
			setStep(1);
		};
		return (
			<DialogShell
				open={open}
				onOpenChange={reset}
				trigger={trigger}
				tone="danger"
				media={<LogOut />}
				title="Who takes over as owner?"
				description={`Pick who runs “${data.group.name}” once you've left. They'll be able to change roles and delete the group.`}
				steps={LEAVE_STEPS}
				index={0}
				footer={
					<>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<Button type="submit" form={`${errorId}-form`}>
							Continue
						</Button>
					</>
				}
			>
				<form id={`${errorId}-form`} onSubmit={next} className="contents">
					<RadioGroup.Root
						ref={options}
						value={successor}
						onValueChange={(value) => {
							setSuccessor(value);
							setMissing(false);
						}}
						aria-label="New owner"
						aria-invalid={missing || undefined}
						aria-describedby={missing ? errorId : undefined}
						className="flex max-h-[15.5rem] flex-col gap-2 overflow-y-auto overscroll-contain p-0.5"
					>
						{candidates.map((person) => (
							<RadioGroup.Item
								key={person.userId}
								value={person.userId}
								{...(person.userId === successor ? STEP_FOCUS : {})}
								className={cn(
									"group/option flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-start text-sm outline-none",
									"transition-[background-color,border-color,box-shadow] duration-150 ease-(--ease-out-soft)",
									"hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
									"data-[state=checked]:border-primary data-[state=checked]:bg-primary/5",
								)}
							>
								<MemberAvatar
									name={person.name}
									seed={person.userId}
									image={person.image}
									className="size-8"
								/>
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="font-medium [overflow-wrap:anywhere]">
										{person.name}
									</span>
									<span className="text-xs text-muted-foreground capitalize">
										{person.role}
									</span>
								</span>
								{/* A filled dot, not just the tint, says which one is picked. */}
								<span className="grid size-4 shrink-0 place-items-center rounded-full border border-input group-data-[state=checked]/option:border-primary">
									<RadioGroup.Indicator className="size-2 rounded-full bg-primary" />
								</span>
							</RadioGroup.Item>
						))}
					</RadioGroup.Root>
					<FieldError id={errorId}>
						{missing ? "Choose who takes over before you continue." : null}
					</FieldError>
				</form>
			</DialogShell>
		);
	}

	return (
		<DialogShell
			open={open}
			onOpenChange={reset}
			trigger={trigger}
			tone="danger"
			media={<LogOut />}
			title={`Leave “${data.group.name}”?`}
			description="You'll lose access right away and need a new invite to rejoin. Your past expenses stay in the group's history."
			steps={isOwner ? LEAVE_STEPS : undefined}
			index={isOwner ? 1 : 0}
			onSelectStep={pending ? undefined : setStep}
			footer={
				<>
					{isOwner ? (
						<BackButton disabled={pending} onClick={() => setStep(0)} />
					) : null}
					<AlertDialogCancel disabled={pending} {...STEP_FOCUS}>
						Cancel
					</AlertDialogCancel>
					<Button
						variant="destructive"
						disabled={pending}
						onClick={() =>
							settle(
								() => onConfirm(heir?.userId),
								setPending,
								() => {
									setOpen(false);
									setStep(0);
									setSuccessor("");
								},
							)
						}
					>
						{pending ? <Spinner data-icon="inline-start" /> : null}
						{heir ? "Hand over and leave" : "Leave group"}
					</Button>
				</>
			}
		>
			{heir ? (
				<div className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2.5 text-sm">
					<MemberAvatar
						name={heir.name}
						seed={heir.userId}
						image={heir.image}
						className="size-8"
					/>
					<p className="min-w-0 flex-1 [overflow-wrap:anywhere]">
						<span className="font-medium">{heir.name}</span>{" "}
						<span className="text-muted-foreground">becomes the owner</span>
					</p>
					<Crown className="size-4 shrink-0 text-muted-foreground" />
				</div>
			) : null}
		</DialogShell>
	);
}

const DELETE_STEPS: Step[] = [
	{ id: "debts", title: "Review open debts" },
	{ id: "confirm", title: "Confirm" },
];

/**
 * Deleting is irreversible for everyone, so unsettled debts are put in front
 * of the owner before the name check: once the group is gone nobody can see
 * who still owed whom.
 */
export function DeleteGroupDialog({
	data,
	onConfirm,
	trigger,
}: {
	data: GroupExitData;
	onConfirm: Confirm;
	trigger: ReactNode;
}) {
	const debts = data.balances.transfers;
	const inputId = useId();
	const errorId = useId();
	const input = useRef<HTMLInputElement>(null);
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState(0);
	const [typed, setTyped] = useState("");
	const [mismatch, setMismatch] = useState(false);
	const [pending, setPending] = useState(false);

	// Straight to the name check when there is nothing to warn about.
	const stepped = debts.length > 0;
	const reviewing = stepped && step === 0;
	const members = data.group.members.length;

	const reset = (next: boolean) => {
		if (pending) return;
		setOpen(next);
		if (!next) {
			setStep(0);
			setTyped("");
			setMismatch(false);
		}
	};

	if (reviewing) {
		return (
			<DialogShell
				open={open}
				onOpenChange={reset}
				trigger={trigger}
				tone="danger"
				media={<Trash2 />}
				title={`${debtCount(debts.length)} still unsettled`}
				description={`Deleting “${data.group.name}” erases these for everyone. Settle up first if anyone needs a record of who owes whom.`}
				steps={DELETE_STEPS}
				index={0}
				footer={
					<>
						<AlertDialogCancel>Keep group</AlertDialogCancel>
						<Button onClick={() => setStep(1)}>Continue</Button>
					</>
				}
			>
				<OpenDebts transfers={debts} meId={data.user.id} />
			</DialogShell>
		);
	}

	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (typed.trim() !== data.group.name.trim()) {
			setMismatch(true);
			input.current?.focus();
			return;
		}
		void settle(onConfirm, setPending, () => {
			setOpen(false);
			setStep(0);
			setTyped("");
		});
	};

	return (
		<DialogShell
			open={open}
			onOpenChange={reset}
			trigger={trigger}
			tone="danger"
			media={<Trash2 />}
			title={`Delete “${data.group.name}”?`}
			description={
				members === 1
					? "Every expense, payment and activity record is removed. This can't be undone."
					: `Every expense, payment and activity record is removed for all ${members} members. This can't be undone.`
			}
			steps={stepped ? DELETE_STEPS : undefined}
			index={stepped ? 1 : 0}
			onSelectStep={pending ? undefined : setStep}
			footer={
				<>
					{stepped ? (
						<BackButton disabled={pending} onClick={() => setStep(0)} />
					) : null}
					<AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
					<Button
						type="submit"
						form={`${inputId}-form`}
						variant="destructive"
						disabled={pending}
					>
						{pending ? <Spinner data-icon="inline-start" /> : null}
						Delete group
					</Button>
				</>
			}
		>
			<form id={`${inputId}-form`} onSubmit={submit} noValidate>
				<Field data-invalid={mismatch || undefined}>
					<FieldLabel htmlFor={inputId} className="block font-normal">
						Type <span className="font-semibold">{data.group.name}</span> to
						confirm
					</FieldLabel>
					<Input
						ref={input}
						id={inputId}
						value={typed}
						autoComplete="off"
						autoCapitalize="off"
						autoCorrect="off"
						spellCheck={false}
						aria-invalid={mismatch || undefined}
						aria-describedby={mismatch ? errorId : undefined}
						disabled={pending}
						onChange={(event) => {
							setTyped(event.target.value);
							setMismatch(false);
						}}
						{...STEP_FOCUS}
					/>
					<FieldError id={errorId}>
						{mismatch
							? `Type “${data.group.name}” exactly as shown to delete it.`
							: null}
					</FieldError>
				</Field>
			</form>
		</DialogShell>
	);
}

/**
 * Archiving never hides money (archived groups stay settleable), so open
 * debts aren't a blocker. They're listed so nobody archives believing the
 * group is squared away. It's undone with one click, so it isn't painted red.
 */
export function ArchiveGroupDialog({
	data,
	onConfirm,
	trigger,
}: {
	data: GroupExitData;
	onConfirm: Confirm;
	trigger: ReactNode;
}) {
	const debts = data.balances.transfers;
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState(false);

	return (
		<DialogShell
			open={open}
			onOpenChange={(next) => {
				if (!pending) setOpen(next);
			}}
			trigger={trigger}
			tone="neutral"
			media={<Archive />}
			title={`Archive “${data.group.name}”?`}
			description="The group becomes read-only, so no one can add expenses. Balances and history stay visible, and you can unarchive it any time."
			footer={
				<>
					<AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
					<Button
						disabled={pending}
						onClick={() => settle(onConfirm, setPending, () => setOpen(false))}
					>
						{pending ? <Spinner data-icon="inline-start" /> : null}
						Archive group
					</Button>
				</>
			}
		>
			{debts.length > 0 ? (
				<div className="flex flex-col gap-2">
					<div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-warning">
						<TriangleAlert className="mt-0.5 size-4 shrink-0" />
						<p className="text-pretty">
							<span className="font-medium">
								{debtCount(debts.length)} still open.
							</span>{" "}
							People can still record payments after the group is archived.
						</p>
					</div>
					<OpenDebts transfers={debts} meId={data.user.id} />
				</div>
			) : null}
		</DialogShell>
	);
}
