import { isEventualApiError } from "@eventual/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef } from "react";
import { View } from "react-native";
import {
	Body,
	Card,
	Display,
	FormMessage,
	GlassButton,
	Kicker,
	Screen,
} from "../../../../components/brand";
import { idempotencyKey } from "../../../../lib/mutations";
import { notifyInviteAccepted } from "../../../../lib/push/events";
import { useApi, useSession } from "../../../../lib/session";

export default function Invite() {
	const api = useApi();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { user } = useSession();
	const { invitationId } = useLocalSearchParams<{ invitationId: string }>();
	const key = useRef(idempotencyKey());

	const invite = useQuery({
		queryKey: ["invitation", invitationId],
		queryFn: () => api.call("invitation.get", { invitationId }),
		retry: (count, error) =>
			!(isEventualApiError(error) && error.status === 404) && count < 2,
	});

	const accept = useMutation({
		mutationFn: () =>
			api.call(
				"invitation.accept",
				{ invitationId },
				{ idempotencyKey: key.current },
			),
		onSuccess: async ({ groupId }) => {
			// Same D2 trigger as the first expense save (05 D2).
			notifyInviteAccepted();
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
				queryClient.invalidateQueries({ queryKey: ["activity"] }),
			]);
			router.dismiss();
			router.push(`/group/${groupId}`);
		},
	});

	const data = invite.data;
	const notFound =
		invite.isError &&
		isEventualApiError(invite.error) &&
		invite.error.status === 404;

	if (!data)
		return (
			<Screen edges={[]} contentStyle={{ paddingTop: 28 }}>
				{invite.isError ? (
					<>
						<View style={{ gap: 8 }}>
							<Display size={28}>
								{notFound ? "Invitation not found" : "Couldn’t load invitation"}
							</Display>
							<Body tone="muted">
								{notFound
									? "It may have been removed."
									: "Check your connection and try again."}
							</Body>
						</View>
						{notFound ? null : (
							<GlassButton
								prominent
								label="Try again"
								onPress={() => void invite.refetch()}
							/>
						)}
						<GlassButton label="Close" onPress={() => router.dismiss()} />
					</>
				) : (
					<Body tone="muted">Loading invitation…</Body>
				)}
			</Screen>
		);

	const { invitation, groupName, inviterName } = data;
	const expired = new Date(invitation.expiresAt).getTime() < Date.now();
	const role = invitation.role === "admin" ? "an admin" : "a member";
	const email = user?.email ?? "";
	const wrongAccount = email.toLowerCase() !== invitation.email.toLowerCase();

	// Accept needs the exact invited address, so explain before the button fails.
	const blocked =
		invitation.status === "accepted"
			? "This invitation was already accepted."
			: invitation.status !== "pending"
				? "This invitation is no longer valid. Ask for a new one."
				: expired
					? "This invitation has expired. Ask for a new one."
					: wrongAccount
						? `This invitation is for ${invitation.email}, but you’re signed in as ${email}. Sign in with that address to join.`
						: !user?.emailVerified
							? `Verify ${email} to join. Open the link we emailed you, then come back.`
							: null;

	return (
		<Screen edges={[]} contentStyle={{ paddingTop: 28 }}>
			<View style={{ gap: 8 }}>
				<Kicker>Invitation</Kicker>
				<Display size={28}>{`Join ${groupName}`}</Display>
				<Body tone="muted">
					{inviterName} invited you as {role}.
				</Body>
			</View>
			<Card style={{ padding: 16, gap: 4 }}>
				<Body tone="muted" size={14}>
					Sent to
				</Body>
				<Body weight="medium" numberOfLines={1}>
					{invitation.email}
				</Body>
				<Body tone="muted" size={14}>
					{expired ? "Expired " : "Expires "}
					{new Date(invitation.expiresAt).toLocaleDateString("en-IN", {
						day: "numeric",
						month: "short",
						year: "numeric",
					})}
				</Body>
			</Card>
			{blocked ? <FormMessage tone="muted">{blocked}</FormMessage> : null}
			{accept.isError ? (
				<FormMessage>{accept.error.message}</FormMessage>
			) : null}
			{blocked ? null : (
				<GlassButton
					prominent
					label="Join group"
					busy={accept.isPending}
					onPress={() => accept.mutate()}
				/>
			)}
			<GlassButton
				label={blocked ? "Close" : "Not now"}
				onPress={() => router.dismiss()}
			/>
		</Screen>
	);
}
