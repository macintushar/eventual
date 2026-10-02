import { type ReactNode, useState } from "react";
import { toast } from "sonner";

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
import { Spinner } from "#/components/ui/spinner";
import type { useAppMutation } from "#/lib/app-mutation";

export type GuestContact = {
	userId: string;
	name: string;
	invitedEmail: string | null;
	phone: string | null;
};

/**
 * Admins correct a guest's details. The email is where their invitation goes,
 * so fixing a mistyped address sends a fresh invitation to the right one.
 */
export function EditGuestDialog({
	groupId,
	guest,
	execute,
	trigger,
}: {
	groupId: string;
	guest: GuestContact;
	execute: ReturnType<typeof useAppMutation>["execute"];
	trigger: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState(guest.name);
	const [email, setEmail] = useState(guest.invitedEmail ?? "");
	const [phone, setPhone] = useState(guest.phone ?? "");
	const [saving, setSaving] = useState(false);

	const changes = {
		...(name.trim() !== guest.name ? { name: name.trim() } : {}),
		...(email.trim().toLowerCase() !== (guest.invitedEmail ?? "")
			? { email: email.trim() || null }
			: {}),
		...(phone.trim() !== (guest.phone ?? "")
			? { phone: phone.trim() || null }
			: {}),
	};
	const dirty = Object.keys(changes).length > 0;

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (next) {
					setName(guest.name);
					setEmail(guest.invitedEmail ?? "");
					setPhone(guest.phone ?? "");
				}
			}}
		>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit {guest.name}</DialogTitle>
					<DialogDescription>
						Guests don't have an account, so group admins keep their details.
					</DialogDescription>
				</DialogHeader>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="guest-name">Name</FieldLabel>
						<Input
							id="guest-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="guest-email">Email</FieldLabel>
						<Input
							id="guest-email"
							type="email"
							placeholder="person@example.com"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
						/>
						<FieldDescription>
							We invite this address. Use the one they sign in with; when they
							accept, their account takes over {guest.name}'s expenses.
						</FieldDescription>
					</Field>
					<Field>
						<FieldLabel htmlFor="guest-phone">Phone</FieldLabel>
						<Input
							id="guest-phone"
							type="tel"
							inputMode="tel"
							placeholder="+919876543210"
							value={phone}
							onChange={(event) => setPhone(event.target.value)}
						/>
						<FieldDescription>
							Optional, with the country code.
						</FieldDescription>
					</Field>
				</FieldGroup>
				<DialogFooter>
					<Button
						disabled={!dirty || !name.trim() || saving}
						onClick={async () => {
							setSaving(true);
							const outcome = await execute({
								action: "member.updateGuest",
								input: { groupId, userId: guest.userId, ...changes },
							});
							setSaving(false);
							if (!outcome.ok) return;
							const result = outcome.result as {
								invitation: unknown;
							} | null;
							toast.success(
								result?.invitation
									? `Saved. We sent a new invitation to ${email.trim().toLowerCase()}.`
									: `${name.trim()} updated`,
							);
							setOpen(false);
						}}
					>
						{saving ? <Spinner data-icon="inline-start" /> : null}
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
