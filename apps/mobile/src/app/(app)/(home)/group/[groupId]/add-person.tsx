import { can } from "@eventual/schemas/permissions";
import { isEventualApiError } from "@eventual/sdk";
import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Share, View } from "react-native";
import {
	Body,
	Card,
	Display,
	Field,
	FormMessage,
	GlassButton,
	Screen,
} from "../../../../../components/brand";
import { Segmented } from "../../../../../components/segmented";
import { WriteRecovery } from "../../../../../components/write-recovery";
import { createWriteAttempt } from "../../../../../lib/mutations";
import {
	useGroupContext,
	useRefreshAfterWrite,
} from "../../../../../lib/queries";
import { useApi, useSession } from "../../../../../lib/session";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AddPerson() {
	const api = useApi();
	const router = useRouter();
	const refresh = useRefreshAfterWrite();
	const { origin } = useSession();
	const { groupId } = useLocalSearchParams<{ groupId: string }>();
	const context = useGroupContext(groupId);
	const myRole = context.data?.group.myRole ?? "member";
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<"member" | "admin">("member");
	const [inviteUrl, setInviteUrl] = useState("");
	const [notice, setNotice] = useState("");
	const attempt = useRef(createWriteAttempt()).current;

	const address = email.trim().toLowerCase();
	const overlap = address
		? context.data?.group.members.find(
				(member) =>
					member.email?.toLowerCase() === address ||
					member.invitedEmail?.toLowerCase() === address,
			)
		: undefined;
	const problem = !name.trim()
		? ""
		: address && !EMAIL.test(address)
			? "Enter a valid email address"
			: overlap
				? `${overlap.name} already uses that email in this group.`
				: "";

	const add = useMutation({
		mutationFn: () =>
			attempt.run((key) =>
				api.call(
					"member.add",
					{
						groupId,
						name: name.trim(),
						email: address || undefined,
						// The role applies once they accept the emailed invitation.
						role: address ? role : undefined,
					},
					{ idempotencyKey: key },
				),
			),
		onSuccess: async (result) => {
			await refresh(groupId);
			if (!result.invitation) return router.back();
			setNotice(
				!result.member
					? "They already have an account, so they were invited instead."
					: result.invitation.emailDelivery === "scheduled"
						? `${name.trim()} was added and invited by email.`
						: `${name.trim()} was added.`,
			);
			setInviteUrl(`${origin}${result.invitation.inviteUrl}`);
		},
	});

	if (attempt.unresolved)
		return <WriteRecovery busy={add.isPending} retry={() => add.mutate()} />;
	if (inviteUrl)
		return (
			<Screen edges={[]} contentStyle={{ paddingTop: 28 }}>
				<View style={{ gap: 8 }}>
					<Display size={28}>Share the invite</Display>
					<Body tone="muted">
						{notice} They can join with this link to see the group and add
						expenses themselves.
					</Body>
				</View>
				<Card style={{ padding: 16 }}>
					<Body size={15} numberOfLines={2} selectable>
						{inviteUrl}
					</Body>
				</Card>
				<GlassButton
					prominent
					label="Share link"
					onPress={() =>
						void Share.share({
							message: `Join ${context.data?.group.name ?? "my group"} on Eventual: ${inviteUrl}`,
							url: inviteUrl,
						})
					}
				/>
				<GlassButton label="Done" onPress={() => router.back()} />
			</Screen>
		);

	return (
		<Screen edges={[]} contentStyle={{ paddingTop: 28 }}>
			<View style={{ gap: 8 }}>
				<Display size={28}>Add a person</Display>
				<Body tone="muted">
					They can be part of expenses right away. Add their email to invite
					them.
				</Body>
			</View>
			<Field
				label="Name"
				placeholder="Their name"
				value={name}
				onChangeText={setName}
				autoCapitalize="words"
				autoFocus
				maxLength={100}
			/>
			<Field
				label="Email (optional)"
				placeholder="friend@example.com"
				value={email}
				onChangeText={setEmail}
				keyboardType="email-address"
				autoCapitalize="none"
				autoCorrect={false}
				error={problem || undefined}
			/>
			{address && can(myRole, "member", "role") ? (
				<View style={{ gap: 8 }}>
					<Body weight="medium" size={15}>
						Role once they join
					</Body>
					<Segmented
						value={role}
						onChange={setRole}
						options={[
							{ value: "member", label: "Member" },
							{ value: "admin", label: "Admin" },
						]}
					/>
				</View>
			) : null}
			{problem ? <FormMessage>{problem}</FormMessage> : null}
			{add.isError ? (
				<FormMessage>
					{isEventualApiError(add.error)
						? add.error.message
						: "Couldn’t add them. Check your connection and try again."}
				</FormMessage>
			) : null}
			<GlassButton
				prominent
				label={
					add.isPending ? "Adding…" : address ? "Add and invite" : "Add person"
				}
				busy={add.isPending}
				disabled={!name.trim() || Boolean(problem)}
				onPress={() => add.mutate()}
			/>
		</Screen>
	);
}
