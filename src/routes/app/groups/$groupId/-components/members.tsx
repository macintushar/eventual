import { useQuery } from "@tanstack/react-query";
import {
	Check,
	CircleHelp,
	Copy,
	Minus,
	MoreHorizontal,
	PencilLine,
	Plus,
	UserMinus,
	UserPlus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { emailInGroup, type GroupPeople } from "#/components/add-person-dialog";
import { ConfirmDialog } from "#/components/confirm-dialog";
import { EditGuestDialog } from "#/components/edit-guest-dialog";
import { MemberAvatar } from "#/components/member-avatar";
import { MemberProfileDialog } from "#/components/member-profile";
import { RoleLock } from "#/components/role-lock";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "#/components/ui/input-group";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Separator } from "#/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "#/components/ui/sheet";
import { Spinner } from "#/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { copyToClipboard } from "#/lib/clipboard";
import { can } from "#/lib/permissions";
import { groupInvitationsQueryOptions } from "#/lib/queries";
import { type Execute, LoadError, type LoaderData, type Run } from "./shared";

const ROLES = ["owner", "admin", "member"] as const;
type Role = (typeof ROLES)[number];
/** Each group has one owner (its creator), so only these can be granted. */
const ASSIGNABLE_ROLES = ["member", "admin"] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];
const ROLE_ABILITIES: Record<Role, string> = {
	member: "Add expenses, settle up and edit their own recurring expenses.",
	admin:
		"Everything members can, plus add, invite and remove members, set weights, manage categories and recurring expenses, and rename, archive or duplicate the group.",
	owner:
		"Everything admins can, plus change roles, remove admins and delete the group. Each group has one owner, who starts as its creator and hands the group over before leaving.",
};

function RolesInfo() {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon-xs"
					className="rounded-full text-muted-foreground"
					aria-label="What can each role do?"
				>
					<CircleHelp className="size-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-80 p-4">
				<p className="mb-3 text-sm font-medium">What each role can do</p>
				<dl className="flex flex-col gap-3 text-sm">
					{(["member", "admin", "owner"] as const).map((role) => (
						<div key={role} className="flex flex-col gap-0.5">
							<dt className="font-medium capitalize">{role}</dt>
							<dd className="text-muted-foreground">{ROLE_ABILITIES[role]}</dd>
						</div>
					))}
				</dl>
			</PopoverContent>
		</Popover>
	);
}

/* ----------------------------------------------------------------- Members */

/**
 * Row actions for a member, as a sheet. The inline controls opposite need a
 * select and a button side by side, which is more than a phone row can hold —
 * here the same choices get a full-width tap target each.
 */
type GroupMember = LoaderData["group"]["members"][number];

/**
 * − n + control for a member's even-split weight. Taps update the number
 * straight away and commit once they stop, so stepping 1 → 4 is one write;
 * closing the panel mid-pause still saves.
 */
function WeightStepper({
	member,
	groupId,
	execute,
}: {
	member: GroupMember;
	groupId: string;
	execute: Execute;
}) {
	const [value, setValue] = useState(member.weight);
	const pending = useRef<number | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const commit = useRef(() => {});
	commit.current = () => {
		clearTimeout(timer.current);
		const next = pending.current;
		pending.current = null;
		if (next === null || next === member.weight) return;
		void execute({
			action: "member.weight",
			input: { groupId, userId: member.userId, weight: next },
		});
	};
	useEffect(() => () => commit.current(), []);
	useEffect(() => {
		if (pending.current === null) setValue(member.weight);
	}, [member.weight]);

	const change = (next: number) => {
		setValue(next);
		pending.current = next;
		clearTimeout(timer.current);
		timer.current = setTimeout(() => commit.current(), 600);
	};

	return (
		<div className="flex items-center justify-between gap-4">
			<div className="flex min-w-0 flex-col">
				<span className="text-sm font-medium" id={`weight-${member.userId}`}>
					Weight
				</span>
				<span className="text-xs text-muted-foreground">
					How much they count for in an even split
				</span>
			</div>
			<fieldset
				aria-labelledby={`weight-${member.userId}`}
				className="flex shrink-0 items-center gap-1 rounded-full border p-0.5"
			>
				<Button
					variant="ghost"
					size="icon-sm"
					className="rounded-full"
					aria-label="Decrease weight"
					disabled={value <= 1}
					onClick={() => change(value - 1)}
				>
					<Minus />
				</Button>
				<span
					className="min-w-6 text-center text-sm font-medium tabular"
					aria-live="polite"
				>
					{value}
				</span>
				<Button
					variant="ghost"
					size="icon-sm"
					className="rounded-full"
					aria-label="Increase weight"
					onClick={() => change(value + 1)}
				>
					<Plus />
				</Button>
			</fieldset>
		</div>
	);
}

/**
 * Everything you can change about one member, behind a single "⋯": a popover
 * on desktop, a bottom sheet on phones. The row itself stays read-only.
 */
function MemberActions({
	member,
	data,
	groupId,
	run,
	execute,
}: {
	member: GroupMember;
	data: LoaderData;
	groupId: string;
	run: Run;
	execute: Execute;
}) {
	const isSelf = member.userId === data.user.id;
	const myRole = data.group.myRole;
	const canChangeRole =
		can(myRole, "member", "role") && member.role !== "owner";
	// Mirrors the server: only someone who can change roles can remove
	// non-members; everyone else with delete rights removes plain members.
	const canRemove =
		!isSelf &&
		can(myRole, "member", "delete") &&
		(member.role === "member" || can(myRole, "member", "role"));
	const [popoverOpen, setPopoverOpen] = useState(false);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);

	const body = (
		<div className="flex flex-col gap-5">
			{member.isGuest && can(myRole, "member", "update") ? (
				<EditGuestDialog
					groupId={groupId}
					guest={member}
					execute={execute}
					trigger={
						<Button variant="outline">
							<PencilLine data-icon="inline-start" />
							Edit name, email and phone
						</Button>
					}
				/>
			) : null}
			<WeightStepper member={member} groupId={groupId} execute={execute} />
			{canChangeRole ? (
				<div className="flex flex-col gap-2">
					<span className="text-sm font-medium">Role</span>
					<ToggleGroup
						type="single"
						variant="outline"
						spacing={2}
						rovingFocus={false}
						value={member.role}
						onValueChange={(role) => {
							if (!role || role === member.role) return;
							run(
								{
									action: "member.role",
									input: {
										groupId,
										userId: member.userId,
										role: role as AssignableRole,
									},
								},
								"Role updated",
							);
						}}
						className="grid w-full grid-cols-2"
						aria-label={`Role for ${member.name}`}
					>
						{ASSIGNABLE_ROLES.map((role) => (
							<ToggleGroupItem key={role} value={role} className="capitalize">
								{role}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
					<p className="text-xs text-muted-foreground">
						{ROLE_ABILITIES[member.role as Role]}
					</p>
				</div>
			) : null}
			{canRemove ? (
				<>
					<Separator />
					<Button
						variant="ghost"
						className="-mx-2.5 justify-start px-2.5 text-destructive hover:text-destructive"
						onClick={() => {
							setPopoverOpen(false);
							setSheetOpen(false);
							setConfirmOpen(true);
						}}
					>
						<UserMinus data-icon="inline-start" />
						Remove from group
					</Button>
				</>
			) : null}
		</div>
	);

	return (
		<>
			<Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="ghost"
						size="icon-sm"
						className="press hidden text-muted-foreground sm:inline-flex"
						aria-label={`Manage ${member.name}`}
					>
						<MoreHorizontal />
					</Button>
				</PopoverTrigger>
				<PopoverContent align="end" className="w-80 p-4">
					{body}
				</PopoverContent>
			</Popover>

			<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
				<SheetTrigger asChild>
					<Button
						variant="ghost"
						size="icon-sm"
						className="press text-muted-foreground sm:hidden"
						aria-label={`Manage ${member.name}`}
					>
						<MoreHorizontal />
					</Button>
				</SheetTrigger>
				<SheetContent side="bottom" className="gap-6 pb-6">
					<SheetHeader className="flex-row items-center gap-3">
						<MemberAvatar
							name={member.name}
							seed={member.userId}
							image={member.image}
							className="size-10"
						/>
						<span className="flex min-w-0 flex-col">
							<SheetTitle>{member.name}</SheetTitle>
							<SheetDescription className="truncate text-xs">
								{member.isGuest
									? member.invitedEmail
										? `Guest · invited ${member.invitedEmail}`
										: "Guest"
									: member.email}
							</SheetDescription>
						</span>
					</SheetHeader>
					<div className="px-4">{body}</div>
				</SheetContent>
			</Sheet>

			{canRemove ? (
				<ConfirmDialog
					open={confirmOpen}
					onOpenChange={setConfirmOpen}
					media={<UserMinus />}
					title={`Remove ${member.name}?`}
					description={`${member.name} loses access immediately. Their shares in expenses already recorded stay put, and you can invite them back with a new invitation.`}
					confirmLabel="Remove from group"
					onConfirm={() =>
						run(
							{
								action: "member.remove",
								input: { groupId, userId: member.userId },
							},
							"Member removed",
						)
					}
				/>
			) : null}
		</>
	);
}

function AddPersonDialog({
	groupId,
	people,
	execute,
}: {
	groupId: string;
	people: GroupPeople;
	execute: Execute;
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<AssignableRole>("member");
	const [showMore, setShowMore] = useState(false);
	const [phone, setPhone] = useState("");
	const [weight, setWeight] = useState("1");
	const [submitting, setSubmitting] = useState(false);
	const [inviteUrl, setInviteUrl] = useState("");
	const [copied, setCopied] = useState(false);
	const weightValue = weight.trim() === "" ? 1 : Number(weight);
	const hasEmail = Boolean(email.trim());
	const overlap = emailInGroup(people, email);
	const valid =
		Boolean(name.trim()) && Number.isInteger(weightValue) && weightValue > 0;

	const reset = () => {
		setName("");
		setEmail("");
		setRole("member");
		setShowMore(false);
		setPhone("");
		setWeight("1");
		setInviteUrl("");
		setCopied(false);
	};

	const submit = async () => {
		if (overlap) return;
		setSubmitting(true);
		const outcome = await execute({
			action: "member.add",
			input: {
				groupId,
				name,
				email: email.trim() || undefined,
				phone: phone.trim() || undefined,
				weight: weightValue,
				role: hasEmail ? role : undefined,
			},
		});
		setSubmitting(false);
		if (!outcome.ok) return;
		const result = outcome.result as {
			member: unknown;
			invitation: {
				inviteUrl: string;
				emailDelivery: "scheduled" | "unconfigured";
			} | null;
		} | null;
		const invitation = result?.invitation;
		if (!invitation) {
			toast.success(`${name.trim()} added`);
			setOpen(false);
			reset();
			return;
		}
		if (!result.member)
			toast.success("They already have an account — invitation sent", {
				description:
					weightValue !== 1 ? "Set their weight once they accept." : undefined,
			});
		else
			toast.success(
				invitation.emailDelivery === "scheduled"
					? `${name.trim()} added and invited by email`
					: `${name.trim()} added`,
			);
		setInviteUrl(`${window.location.origin}${invitation.inviteUrl}`);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) reset();
			}}
		>
			<DialogTrigger asChild>
				<Button>
					<UserPlus data-icon="inline-start" />
					Add person
				</Button>
			</DialogTrigger>
			<DialogContent>
				{inviteUrl ? (
					<>
						<DialogHeader>
							<DialogTitle>Share the invite</DialogTitle>
							<DialogDescription>
								They can join with this link to see the group and add expenses
								themselves.
							</DialogDescription>
						</DialogHeader>
						<InputGroup>
							<InputGroupInput
								id="invite-url"
								aria-label="Invite link"
								readOnly
								value={inviteUrl}
								className="text-xs"
								onFocus={(event) => event.currentTarget.select()}
							/>
							<InputGroupAddon align="inline-end">
								<InputGroupButton
									aria-label={copied ? "Copied" : "Copy invite link"}
									onClick={async () => {
										const ok = await copyToClipboard(inviteUrl, "invite link");
										if (!ok) return;
										setCopied(true);
										toast.success("Invite link copied");
									}}
								>
									{copied ? <Check /> : <Copy />}
									{copied ? "Copied" : "Copy"}
								</InputGroupButton>
							</InputGroupAddon>
						</InputGroup>
						<DialogFooter>
							<Button variant="outline" onClick={reset}>
								Add another
							</Button>
							<Button
								onClick={() => {
									setOpen(false);
									reset();
								}}
							>
								Done
							</Button>
						</DialogFooter>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>Add a person</DialogTitle>
							<DialogDescription>
								They can be part of expenses right away. Add their email to
								invite them, so they can sign in and see the group.
							</DialogDescription>
						</DialogHeader>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="add-name">Name</FieldLabel>
								<Input
									id="add-name"
									placeholder="Their name"
									value={name}
									onChange={(event) => setName(event.target.value)}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="add-email">Email</FieldLabel>
								<Input
									id="add-email"
									type="email"
									placeholder="friend@example.com"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
								/>
								<FieldDescription>
									Optional. Leave blank for someone who won't use the app.
								</FieldDescription>
								{overlap ? (
									<p role="alert" className="text-sm text-destructive">
										{overlap}
									</p>
								) : null}
							</Field>
							{hasEmail ? (
								<Field>
									<FieldLabel htmlFor="add-role">Role</FieldLabel>
									<Select
										value={role}
										onValueChange={(value) => setRole(value as typeof role)}
									>
										<SelectTrigger id="add-role" className="w-full capitalize">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												{ASSIGNABLE_ROLES.map((option) => (
													<SelectItem
														key={option}
														value={option}
														className="capitalize"
													>
														{option}
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
									<FieldDescription>
										{ROLE_ABILITIES[role]} Applies once they accept the invite.
									</FieldDescription>
								</Field>
							) : null}
							{showMore ? (
								<>
									<Field>
										<FieldLabel htmlFor="add-phone">Phone</FieldLabel>
										<Input
											id="add-phone"
											type="tel"
											inputMode="tel"
											placeholder="+919876543210"
											value={phone}
											onChange={(event) => setPhone(event.target.value)}
										/>
										<FieldDescription>
											Optional, international format with country code.
										</FieldDescription>
									</Field>
									<Field>
										<FieldLabel htmlFor="add-weight">Weight</FieldLabel>
										<Input
											id="add-weight"
											type="number"
											min={1}
											step={1}
											className="w-20 tabular"
											value={weight}
											onChange={(event) => setWeight(event.target.value)}
										/>
										<FieldDescription>
											How much they count for in an even split. Default 1.
										</FieldDescription>
									</Field>
								</>
							) : (
								<Button
									variant="link"
									className="self-start px-0"
									onClick={() => setShowMore(true)}
								>
									<Plus data-icon="inline-start" />
									Phone and weight
								</Button>
							)}
						</FieldGroup>
						<DialogFooter>
							<Button
								disabled={!valid || submitting || Boolean(overlap)}
								onClick={submit}
							>
								{submitting ? <Spinner data-icon="inline-start" /> : null}
								{hasEmail ? "Add & invite" : "Add person"}
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

export function MembersTab({
	data,
	groupId,
	run,
	execute,
}: {
	data: LoaderData;
	groupId: string;
	run: Run;
	execute: Execute;
}) {
	const myRole = data.group.myRole;
	const canAdd = can(myRole, "member", "create");
	const canManageMembers =
		can(myRole, "member", "update") || can(myRole, "member", "delete");
	const canRevokeInvite = can(myRole, "invitation", "cancel");
	const invites = useQuery({
		...groupInvitationsQueryOptions(groupId),
		enabled: can(myRole, "invitation", "read"),
	});
	const invitations = invites.data ?? [];

	return (
		<div className="flex flex-col gap-10 sm:gap-12">
			<section
				aria-labelledby="members-heading"
				className="flex flex-col gap-4"
			>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-1">
						<h2 id="members-heading" className="text-base font-semibold">
							{data.group.members.length}{" "}
							{data.group.members.length === 1 ? "member" : "members"}
						</h2>
						<RolesInfo />
					</div>
					{canAdd ? (
						<AddPersonDialog
							groupId={groupId}
							people={{ myRole, members: data.group.members, invitations }}
							execute={execute}
						/>
					) : (
						<RoleLock
							permissions={{ member: ["create"] }}
							action="add people"
						/>
					)}
				</div>

				<ul className="island-shell divide-y overflow-hidden rounded-2xl">
					{data.group.members.map((member) => (
						<li
							key={member.userId}
							className="flex items-center gap-2 py-2.5 ps-2.5 pe-3 sm:py-3 sm:ps-3 sm:pe-4"
						>
							<MemberProfileDialog
								member={member}
								trigger={
									<button
										type="button"
										className="press flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-muted/60"
									>
										<MemberAvatar
											name={member.name}
											seed={member.userId}
											image={member.image}
										/>
										<span className="flex min-w-0 flex-col">
											<span className="truncate text-sm font-medium">
												{member.name}
												{member.userId === data.user.id ? (
													<span className="text-muted-foreground"> (you)</span>
												) : null}
											</span>
											<span className="truncate text-sm text-muted-foreground">
												{member.isGuest
													? member.invitedEmail
														? `Guest · invited ${member.invitedEmail}`
														: "Guest"
													: member.email}
											</span>
										</span>
										<span className="sr-only">, view profile</span>
									</button>
								}
							/>
							{/* Read-only summary; members are the default, so only
							    deviations (a role, a weight above 1) earn a label. */}
							<div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
								{member.weight !== 1 ? (
									<span className="tabular">Weight {member.weight}</span>
								) : null}
								{member.role !== "member" ? (
									<Badge variant="secondary" className="capitalize">
										{member.role}
									</Badge>
								) : null}
							</div>
							{canManageMembers ? (
								<MemberActions
									member={member}
									data={data}
									groupId={groupId}
									run={run}
									execute={execute}
								/>
							) : null}
						</li>
					))}
				</ul>
			</section>

			{invites.isError ? (
				<section aria-label="Pending invitations">
					<LoadError
						icon={UserPlus}
						title="Couldn't load invitations"
						query={invites}
					/>
				</section>
			) : null}
			{invitations.length > 0 ? (
				<section
					aria-labelledby="invitations-heading"
					className="flex flex-col gap-4"
				>
					<div className="flex flex-col gap-1">
						<h2 id="invitations-heading" className="text-base font-semibold">
							Pending invitations
						</h2>
						<p className="text-sm text-muted-foreground">
							They join as soon as they accept.
						</p>
					</div>
					<ul className="island-shell divide-y overflow-hidden rounded-2xl">
						{invitations.map((invite) => (
							<li
								key={invite.id}
								className="flex items-center gap-3 py-3 ps-5 pe-4 sm:ps-6"
							>
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="truncate text-sm font-medium">
										{invite.email}
									</span>
									{invite.guestUserId ? (
										<span className="truncate text-xs text-muted-foreground">
											Joins as{" "}
											{data.group.members.find(
												(row) => row.userId === invite.guestUserId,
											)?.name ?? "a guest"}
										</span>
									) : null}
								</span>
								<Button
									size="sm"
									variant="ghost"
									aria-label={`Copy invite link for ${invite.email}`}
									onClick={async () => {
										if (
											await copyToClipboard(
												`${window.location.origin}/invite/${invite.id}`,
												"invite link",
											)
										)
											toast.success("Invite link copied");
									}}
								>
									<Copy data-icon="inline-start" />
									Copy link
								</Button>
								<Badge variant="secondary" className="capitalize">
									{invite.role}
								</Badge>
								{canRevokeInvite ? (
									<ConfirmDialog
										media={<UserMinus />}
										title="Revoke this invitation?"
										description={`${invite.email} will not be able to join through this invitation. You can invite them again any time.`}
										confirmLabel="Revoke invitation"
										onConfirm={() =>
											run(
												{
													action: "invitation.revoke",
													input: { invitationId: invite.id },
												},
												"Invitation revoked",
											)
										}
										trigger={
											<Button
												size="sm"
												variant="ghost"
												className="text-destructive"
											>
												Revoke
											</Button>
										}
									/>
								) : null}
							</li>
						))}
					</ul>
				</section>
			) : null}
		</div>
	);
}
