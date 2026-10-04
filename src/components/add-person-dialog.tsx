import { Check, Copy, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
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
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Spinner } from "#/components/ui/spinner";
import type { useAppMutation } from "#/lib/app-mutation";
import { copyToClipboard } from "#/lib/clipboard";

type Role = "owner" | "admin" | "member";

export type GroupPeople = {
	myRole: string;
	members: {
		userId: string;
		name: string;
		/** Null when the member hid it; the server still refuses a duplicate. */
		email: string | null;
		isGuest: boolean;
		invitedEmail: string | null;
	}[];
	invitations: { email: string }[];
};

type Added = {
	member: unknown;
	invitation: { inviteUrl: string; emailDelivery: string } | null;
} | null;

/** Who, if anyone, in the group this address already reaches. */
export function emailInGroup(people: GroupPeople, email: string) {
	const normalized = email.trim().toLowerCase();
	if (!normalized) return null;
	const member = people.members.find(
		(row) =>
			(row.isGuest ? row.invitedEmail : row.email)?.toLowerCase() ===
			normalized,
	);
	if (member)
		return member.isGuest
			? `${member.name} is already in this group as a guest and invited at this address.`
			: `${member.name} is already in this group.`;
	if (people.invitations.some((row) => row.email.toLowerCase() === normalized))
		return `${normalized} already has a pending invitation. They'll join once they accept.`;
	return null;
}

/**
 * The one way to bring someone into a group. Everyone gets a place in the
 * group straight away, so expenses can include them. With an email they are
 * also invited; when they accept, their account takes over that place.
 */
export function AddPersonDialog({
	groupId,
	people,
	execute,
}: {
	groupId: string;
	people: GroupPeople;
	execute: ReturnType<typeof useAppMutation>["execute"];
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [role, setRole] = useState<Role>("member");
	const [weight, setWeight] = useState("1");
	const [saving, setSaving] = useState(false);
	const [shared, setShared] = useState<{ url: string; note: string } | null>(
		null,
	);
	const [copied, setCopied] = useState(false);
	const weightValue = weight.trim() === "" ? 1 : Number(weight);
	const valid =
		Boolean(name.trim()) && Number.isInteger(weightValue) && weightValue > 0;
	const overlap = emailInGroup(people, email);
	const roles: Role[] =
		people.myRole === "owner"
			? ["member", "admin", "owner"]
			: ["member", "admin"];

	const reset = () => {
		setName("");
		setEmail("");
		setPhone("");
		setRole("member");
		setWeight("1");
		setShared(null);
		setCopied(false);
	};

	const submit = async () => {
		setSaving(true);
		const outcome = await execute({
			action: "member.add",
			input: {
				groupId,
				name,
				email: email.trim() || undefined,
				phone: phone.trim() || undefined,
				weight: weightValue,
				role: email.trim() ? role : undefined,
			},
		});
		setSaving(false);
		if (!outcome.ok) return;
		const added = outcome.result as Added;
		const who = name.trim();
		if (!added?.invitation) {
			toast.success(`${who} added`);
			setOpen(false);
			reset();
			return;
		}
		// Registered people join only by accepting. Everyone else is in the
		// group already and takes over their place when they accept.
		const note = added.member
			? `${who} is in the group now, so you can add them to expenses. When they accept, their account takes over everything recorded for them.`
			: `${who} already has an account, so we sent an invitation. They'll appear as a member once they accept.`;
		toast.success(
			added.member ? `${who} added and invited` : "Invitation sent",
		);
		setShared({
			url: `${window.location.origin}${added.invitation.inviteUrl}`,
			note,
		});
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
				<DialogHeader>
					<DialogTitle>Add a person</DialogTitle>
					<DialogDescription>
						They can be added to expenses right away. Add their email to invite
						them; when they accept, their account takes over.
					</DialogDescription>
				</DialogHeader>
				{shared ? (
					<>
						<Alert className="border-primary/30 bg-primary/5">
							<AlertTitle>Share this invitation</AlertTitle>
							<AlertDescription>
								<p>{shared.note}</p>
								<InputGroup className="mt-2">
									<InputGroupInput
										id="invite-url"
										readOnly
										value={shared.url}
										className="text-xs"
										onFocus={(event) => event.currentTarget.select()}
									/>
									<InputGroupAddon align="inline-end">
										<InputGroupButton
											aria-label={copied ? "Copied" : "Copy invite link"}
											onClick={async () => {
												if (!(await copyToClipboard(shared.url, "invite link")))
													return;
												setCopied(true);
												toast.success("Invite link copied");
											}}
										>
											{copied ? <Check /> : <Copy />}
											{copied ? "Copied" : "Copy"}
										</InputGroupButton>
									</InputGroupAddon>
								</InputGroup>
							</AlertDescription>
						</Alert>
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
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="add-name">Name</FieldLabel>
								<Input
									id="add-name"
									placeholder="Gomathi"
									value={name}
									onChange={(event) => setName(event.target.value)}
								/>
								<FieldDescription>
									How they appear until they join with an account.
								</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor="add-email">Email</FieldLabel>
								<Input
									id="add-email"
									type="email"
									placeholder="person@example.com"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
								/>
								{overlap ? (
									<FieldDescription className="text-amber-700 dark:text-amber-400">
										{overlap}
									</FieldDescription>
								) : (
									<FieldDescription>
										Optional. We invite this address, and they must accept with
										it.
									</FieldDescription>
								)}
							</Field>
							{email.trim() ? (
								<Field>
									<FieldLabel htmlFor="add-role">
										Role once they join
									</FieldLabel>
									<Select
										value={role}
										onValueChange={(value) => setRole(value as Role)}
									>
										<SelectTrigger id="add-role" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												{roles.map((option) => (
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
								</Field>
							) : null}
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
									Optional, with the country code. Leave it empty for someone
									who already has an account.
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
									How many shares they count as in an even split. Default 1.
								</FieldDescription>
							</Field>
						</FieldGroup>
						<DialogFooter>
							<Button disabled={!valid || saving} onClick={submit}>
								{saving ? <Spinner data-icon="inline-start" /> : null}
								{email.trim() ? "Add and invite" : "Add person"}
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
