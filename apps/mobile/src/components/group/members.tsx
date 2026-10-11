import { can } from "@eventual/schemas/permissions";
import { isEventualApiError } from "@eventual/sdk";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Ellipsis } from "lucide-react-native";
import { Alert, Pressable, View } from "react-native";
import { idempotencyKey } from "../../lib/mutations";
import { useGroupContext, useRefreshAfterWrite } from "../../lib/queries";
import { useApi } from "../../lib/session";
import { useTheme } from "../../theme";
import { Body, Card, GlassButton, Heading } from "../brand";
import { MemberAvatar } from "../member-avatar";

const roleName = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);

export function MembersTab({ groupId }: { groupId: string }) {
	const t = useTheme();
	const api = useApi();
	const router = useRouter();
	const refresh = useRefreshAfterWrite();
	const context = useGroupContext(groupId);
	const myRole = context.data?.group.myRole ?? "member";
	const invitations = useQuery({
		queryKey: ["group", groupId, "invitations"],
		queryFn: () => api.call("invitation.list", { groupId }),
		enabled: Boolean(context.data) && can(myRole, "invitation", "read"),
	});
	const revoke = useMutation({
		mutationFn: (invitationId: string) =>
			api.call(
				"invitation.revoke",
				{ invitationId },
				{ idempotencyKey: idempotencyKey() },
			),
		onSuccess: () => refresh(groupId),
		onError: (cause) =>
			Alert.alert(
				"Couldn’t revoke the invitation",
				isEventualApiError(cause)
					? cause.message
					: "Check your connection and try again.",
			),
	});
	if (!context.data) return null;
	const { group, user } = context.data;
	const archived = Boolean(group.archivedAt);
	const pending = (invitations.data ?? []).filter(
		(invite) => invite.status === "pending",
	);

	return (
		<View style={{ gap: 20 }}>
			<Card style={{ gap: 0, paddingVertical: 8 }}>
				{group.members.map((member, index) => (
					<Pressable
						key={member.userId}
						accessibilityRole="button"
						accessibilityLabel={`${member.name}${member.role === "member" ? "" : `, ${member.role}`}. Manage`}
						onPress={() =>
							router.push({
								pathname: "/group/[groupId]/member/[userId]",
								params: { groupId, userId: member.userId },
							})
						}
						style={({ pressed }) => ({
							flexDirection: "row",
							alignItems: "center",
							gap: 12,
							paddingVertical: 14,
							borderTopWidth: index === 0 ? 0 : 1,
							borderTopColor: t.border,
							opacity: pressed ? 0.6 : 1,
						})}
					>
						<MemberAvatar
							name={member.name}
							seed={member.userId}
							image={member.image}
							size={40}
						/>
						<View style={{ flex: 1 }}>
							<Body weight="semibold" numberOfLines={1}>
								{member.userId === user.id
									? `${member.name} (you)`
									: member.name}
							</Body>
							<Body tone="muted" size={14} numberOfLines={1}>
								{member.isGuest
									? member.invitedEmail
										? `Guest · invited ${member.invitedEmail}`
										: "Guest"
									: (member.email ?? " ")}
							</Body>
						</View>
						{member.role === "member" ? null : (
							<View
								style={{
									backgroundColor: t.muted,
									borderRadius: 999,
									paddingHorizontal: 10,
									paddingVertical: 3,
								}}
							>
								<Body size={13} weight="medium">
									{roleName(member.role)}
								</Body>
							</View>
						)}
						<Ellipsis size={20} color={t.mutedInk} />
					</Pressable>
				))}
			</Card>

			{!archived && can(myRole, "member", "create") ? (
				<GlassButton
					label="Add person"
					onPress={() =>
						router.push({
							pathname: "/group/[groupId]/add-person",
							params: { groupId },
						})
					}
				/>
			) : null}

			{pending.length > 0 ? (
				<Card>
					<Heading>Pending invitations</Heading>
					{pending.map((invite) => (
						<View
							key={invite.id}
							style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
						>
							<View style={{ flex: 1 }}>
								<Body weight="medium" numberOfLines={1}>
									{invite.email}
								</Body>
								<Body tone="muted" size={14}>
									{roleName(invite.role ?? "member")} · expires{" "}
									{new Date(invite.expiresAt).toLocaleDateString("en-IN", {
										day: "numeric",
										month: "short",
									})}
								</Body>
							</View>
							{can(myRole, "invitation", "cancel") ? (
								<Pressable
									accessibilityRole="button"
									accessibilityLabel={`Revoke invitation for ${invite.email}`}
									hitSlop={8}
									disabled={revoke.isPending}
									onPress={() =>
										Alert.alert(
											"Revoke this invitation?",
											`${invite.email} won’t be able to join through it.`,
											[
												{ text: "Cancel", style: "cancel" },
												{
													text: "Revoke",
													style: "destructive",
													onPress: () => revoke.mutate(invite.id),
												},
											],
										)
									}
								>
									<Body tone="negative" weight="semibold" size={15}>
										Revoke
									</Body>
								</Pressable>
							) : null}
						</View>
					))}
				</Card>
			) : null}
		</View>
	);
}
