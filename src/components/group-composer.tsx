import { useForm, useStore } from "@tanstack/react-form";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { useId } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
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
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from "#/components/ui/item";
import { Separator } from "#/components/ui/separator";
import { StepDialog } from "#/components/ui/step-dialog";
import { type Step, useStepper } from "#/components/ui/stepper";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { useAppMutation } from "#/lib/app-mutation";

const STEPS: Step[] = [
	{ id: "name", title: "Name", description: "What this shared tab is called." },
	{
		id: "people",
		title: "People",
		description: "Invite them now, or add them later.",
	},
	{
		id: "review",
		title: "Review",
		description: "One last look before it lands.",
	},
];

const suggestions = ["Goa weekend", "Flat 4B", "Office lunches", "Road trip"];

type Invitee = { email: string; role: "member" | "admin" };

const looksLikeEmail = (value: string) =>
	/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/**
 * Start a group, as a stepped dialog. Naming it and filling it with people were
 * two separate screens before — a page to create the group, then the members
 * tab to invite anyone — which is one job split across a redirect. Here the
 * invitations ride along with the group that needs them.
 */
export function GroupComposer({
	open,
	onOpenChange,
	onCreated,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: (groupId: string) => void | Promise<void>;
}) {
	const fieldId = useId();
	const stepper = useStepper(STEPS);
	const mutation = useAppMutation();
	const form = useForm({
		defaultValues: {
			name: "",
			email: "",
			invitees: [] as Invitee[],
		},
		onSubmit: async ({ value }) => {
			try {
				const group = await mutation.mutateAsync({
					action: "group.create",
					input: { name: value.name.trim() },
				});
				if (
					!group ||
					typeof group !== "object" ||
					!("id" in group) ||
					typeof group.id !== "string"
				)
					throw new Error("Group was not created");

				/*
				 * The group exists from here on, so a failed invitation must not read as
				 * a failed creation. They are reported separately and the flow still
				 * lands you in the group, where the members tab can retry them.
				 */
				const failed: string[] = [];
				for (const invitee of value.invitees) {
					try {
						await mutation.mutateAsync({
							action: "invitation.create",
							input: {
								groupId: group.id,
								email: invitee.email,
								role: invitee.role,
							},
						});
					} catch {
						failed.push(invitee.email);
					}
				}

				toast.success(
					value.invitees.length
						? `Group created · ${value.invitees.length - failed.length} of ${value.invitees.length} invited`
						: "Group created",
				);
				if (failed.length)
					toast.error(`Could not invite ${failed.join(", ")}`, {
						description: "Try again from the group's Members tab.",
					});

				onOpenChange(false);
				await onCreated(group.id);
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Could not create group",
				);
			}
		},
	});
	const name = useStore(form.store, (state) => state.values.name);
	const email = useStore(form.store, (state) => state.values.email);
	const invitees = useStore(form.store, (state) => state.values.invitees);
	const saving = useStore(form.store, (state) => state.isSubmitting);

	const trimmed = email.trim().toLowerCase();
	const duplicate = invitees.some((row) => row.email === trimmed);
	const canAdd = looksLikeEmail(trimmed) && !duplicate;

	const addInvitee = () => {
		if (!canAdd) return;
		form.setFieldValue("invitees", [
			...form.getFieldValue("invitees"),
			{ email: trimmed, role: "member" },
		]);
		form.setFieldValue("email", "");
	};

	const blocker =
		stepper.id === "name" && !name.trim() ? "Give the group a name." : "";

	return (
		<StepDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Start a group"
			description={stepper.step?.description}
			steps={STEPS}
			index={stepper.index}
			onSelectStep={stepper.goTo}
			onBack={stepper.back}
			onNext={() => {
				if (stepper.isLast) void form.handleSubmit();
				else stepper.next();
			}}
			nextLabel={
				stepper.isLast ? (saving ? "Creating…" : "Create group") : "Continue"
			}
			nextDisabled={Boolean(blocker)}
			nextHint={blocker}
			pending={saving}
		>
			{stepper.id === "name" ? (
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor={`${fieldId}-name`}>Group name</FieldLabel>
						<Input
							id={`${fieldId}-name`}
							value={name}
							maxLength={100}
							placeholder="Goa weekend"
							onChange={(event) =>
								form.setFieldValue("name", event.target.value)
							}
						/>
						<FieldDescription>
							A group holds its own expenses, balances and members.
						</FieldDescription>
					</Field>
					<Field>
						<FieldLabel>Or start from one of these</FieldLabel>
						<ToggleGroup
							type="single"
							variant="outline"
							spacing={2}
							rovingFocus={false}
							value={suggestions.includes(name) ? name : ""}
							onValueChange={(value) => {
								if (value) form.setFieldValue("name", value);
							}}
							className="flex flex-wrap"
							aria-label="Suggested group names"
						>
							{suggestions.map((suggestion) => (
								<ToggleGroupItem key={suggestion} value={suggestion}>
									{suggestion}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</Field>
				</FieldGroup>
			) : null}

			{stepper.id === "people" ? (
				<FieldGroup>
					<Field data-invalid={Boolean(trimmed) && !canAdd}>
						<FieldLabel htmlFor={`${fieldId}-email`}>
							Invite by email
						</FieldLabel>
						<InputGroup>
							<InputGroupInput
								id={`${fieldId}-email`}
								type="email"
								inputMode="email"
								autoComplete="off"
								placeholder="friend@example.com"
								aria-invalid={Boolean(trimmed) && !canAdd}
								value={email}
								onChange={(event) =>
									form.setFieldValue("email", event.target.value)
								}
								onKeyDown={(event) => {
									if (event.key !== "Enter") return;
									// Enter inside a dialog otherwise reaches the footer's
									// primary action and skips the step.
									event.preventDefault();
									addInvitee();
								}}
							/>
							<InputGroupAddon align="inline-end">
								<InputGroupButton
									disabled={!canAdd}
									onClick={addInvitee}
									aria-label="Add invitation"
								>
									<Plus />
									Add
								</InputGroupButton>
							</InputGroupAddon>
						</InputGroup>
						<FieldDescription>
							{duplicate
								? "That address is already on the list."
								: "Optional — you can invite people any time from the group."}
						</FieldDescription>
					</Field>

					{invitees.length ? (
						<Field>
							<FieldLabel>
								{invitees.length} {invitees.length === 1 ? "person" : "people"}
							</FieldLabel>
							<ItemGroup>
								{invitees.map((invitee) => (
									<Item
										key={invitee.email}
										size="sm"
										variant="outline"
										className="flex-nowrap"
									>
										<ItemContent className="min-w-0">
											<ItemTitle className="w-full min-w-0">
												<span className="truncate">{invitee.email}</span>
											</ItemTitle>
										</ItemContent>
										<ItemActions className="shrink-0">
											<ToggleGroup
												type="single"
												variant="outline"
												spacing={1}
												rovingFocus={false}
												value={invitee.role}
												aria-label={`Role for ${invitee.email}`}
												onValueChange={(value) => {
													if (!value) return;
													form.setFieldValue(
														"invitees",
														form
															.getFieldValue("invitees")
															.map((row) =>
																row.email === invitee.email
																	? { ...row, role: value as Invitee["role"] }
																	: row,
															),
													);
												}}
											>
												<ToggleGroupItem value="member">Member</ToggleGroupItem>
												<ToggleGroupItem value="admin">Admin</ToggleGroupItem>
											</ToggleGroup>
											<Button
												type="button"
												variant="ghost"
												size="icon-sm"
												aria-label={`Remove ${invitee.email}`}
												onClick={() =>
													form.setFieldValue(
														"invitees",
														form
															.getFieldValue("invitees")
															.filter((row) => row.email !== invitee.email),
													)
												}
											>
												<Trash2 />
											</Button>
										</ItemActions>
									</Item>
								))}
							</ItemGroup>
						</Field>
					) : null}
				</FieldGroup>
			) : null}

			{stepper.id === "review" ? (
				<div className="flex flex-col gap-4">
					<div>
						<p className="island-kicker">New group</p>
						<p className="display-title text-3xl font-bold">{name.trim()}</p>
						<p className="mt-1 text-sm text-muted-foreground">
							You will be its owner.
						</p>
					</div>

					<Separator />

					{invitees.length ? (
						<ItemGroup>
							{invitees.map((invitee) => (
								<Item key={invitee.email} size="sm" className="flex-nowrap">
									<ItemMedia variant="icon">
										<UserPlus />
									</ItemMedia>
									<ItemContent className="min-w-0">
										<ItemTitle className="w-full min-w-0">
											<span className="truncate">{invitee.email}</span>
										</ItemTitle>
										<ItemDescription className="capitalize">
											{invitee.role}
										</ItemDescription>
									</ItemContent>
								</Item>
							))}
						</ItemGroup>
					) : (
						<p className="text-sm text-muted-foreground">
							Nobody invited yet. You can add people from the group's Members
							tab whenever you like.
						</p>
					)}
				</div>
			) : null}
		</StepDialog>
	);
}
