import { isEventualApiError } from "@eventual/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import {
	Body,
	Card,
	Display,
	FormMessage,
	GlassButton,
	Heading,
	Screen,
} from "../../../../../components/brand";
import { Checkbox } from "../../../../../components/checkbox";
import { pushCapability } from "../../../../../lib/push/permissions";
import {
	fillPreferences,
	isGroupMuted,
	mutedAfterToggle,
	type PushPreferences,
} from "../../../../../lib/push/preferences";
import { HOSTED_ORIGIN } from "../../../../../lib/server";
import { useApi, useSession } from "../../../../../lib/session";

/** Group Settings › Notifications — the per-group mute entry (docs 05 D2). */
export default function GroupNotifications() {
	const queryClient = useQueryClient();
	const api = useApi();
	const { groupId } = useLocalSearchParams<{ groupId: string }>();
	const { site, origin } = useSession();
	const capability = pushCapability(HOSTED_ORIGIN, origin, site);
	const [error, setError] = useState("");

	const preferences = useQuery({
		queryKey: ["push", "preferences"],
		queryFn: () => api.call("push.preferences.get"),
		enabled: capability === "available",
	});
	const update = useMutation({
		mutationFn: (patch: Partial<PushPreferences>) =>
			api.call("push.preferences.update", patch),
		onSuccess: (next) => {
			queryClient.setQueryData(["push", "preferences"], next);
			setError("");
		},
		onError: (cause) =>
			setError(
				isEventualApiError(cause)
					? cause.message
					: "Couldn’t save the mute setting. Try again.",
			),
	});

	if (capability !== "available") {
		return (
			<Screen>
				<Display size={28}>Notifications</Display>
				<Card>
					<Heading>Not available on this server</Heading>
					<Body tone="muted" size={15}>
						This server can’t send push notifications, so there is nothing to
						mute here. Email reminders and everything else work as usual.
					</Body>
				</Card>
			</Screen>
		);
	}

	if (!preferences.isSuccess)
		return (
			<Screen>
				<Display size={28}>Notifications</Display>
				{preferences.isError ? (
					<Card>
						<Heading>Couldn’t load your settings</Heading>
						<GlassButton
							label="Try again"
							onPress={() => void preferences.refetch()}
						/>
					</Card>
				) : (
					<ActivityIndicator style={{ marginTop: 40 }} />
				)}
			</Screen>
		);

	const filled = fillPreferences(preferences.data);
	const muted = isGroupMuted(filled, groupId);

	return (
		<Screen tabBar>
			<Display size={28}>Notifications</Display>
			<Card
				style={{
					flexDirection: "row",
					alignItems: "center",
					gap: 12,
				}}
			>
				<Checkbox
					checked={muted}
					busy={update.isPending}
					label="Mute this group"
					onChange={(next) =>
						update.mutate({
							mutedGroupIds: mutedAfterToggle(filled, groupId, next),
						})
					}
				/>
				<View style={{ flex: 1 }}>
					<Body weight="medium">Mute this group</Body>
					<Body tone="muted" size={14}>
						{muted
							? "You won’t be notified about activity in this group."
							: "Stop expenses, payments and recurring updates from this group."}
					</Body>
				</View>
			</Card>
			{error ? <FormMessage>{error}</FormMessage> : null}
		</Screen>
	);
}
