import { isEventualApiError } from "@eventual/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, View } from "react-native";
import {
	Body,
	Card,
	Display,
	FormMessage,
	GlassButton,
	Heading,
	Screen,
} from "../../../components/brand";
import { Checkbox } from "../../../components/checkbox";
import {
	notificationSettingsState,
	pushCapability,
} from "../../../lib/push/permissions";
import {
	fillPreferences,
	isGroupMuted,
	mutedAfterToggle,
	type PushPreferences,
} from "../../../lib/push/preferences";
import {
	ensurePushRegistration,
	notificationsSupported,
	type OsPermission,
	readNotificationPermission,
	requestNotificationPermission,
} from "../../../lib/push/registration";
import { HOSTED_ORIGIN } from "../../../lib/server";
import { useSession } from "../../../lib/session";

const CATEGORIES = [
	{
		key: "expenses" as const,
		title: "Expenses",
		detail: "Added, edited or deleted",
	},
	{
		key: "payments" as const,
		title: "Payments",
		detail: "Recorded or deleted",
	},
	{
		key: "recurring" as const,
		title: "Recurring",
		detail: "A recurring expense was added",
	},
];

/** Account notification settings (docs 05 D2/D3 + N-09). */
export default function Notifications() {
	const queryClient = useQueryClient();
	const { site, origin, user, api } = useSession();
	const capability = pushCapability(HOSTED_ORIGIN, origin, site);
	const [permission, setPermission] = useState<OsPermission>("unknown");
	const [moduleSupported, setModuleSupported] = useState<boolean | null>(null);
	const [error, setError] = useState("");

	useEffect(() => {
		if (capability !== "available") return;
		let cancelled = false;
		void (async () => {
			const supported = await notificationsSupported();
			const read = supported
				? await readNotificationPermission()
				: ("unknown" as OsPermission);
			if (!cancelled) {
				setModuleSupported(supported);
				setPermission(read);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [capability]);

	const preferences = useQuery({
		queryKey: ["push", "preferences"],
		queryFn: () => api.call("push.preferences.get"),
		enabled: capability === "available",
	});
	const dashboard = useQuery({
		queryKey: ["dashboard"],
		queryFn: () => api.call("app.dashboard"),
		enabled: capability === "available",
		staleTime: 30_000,
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
					: "Couldn’t save the notification setting. Try again.",
			),
	});

	const state = notificationSettingsState({
		capability,
		moduleSupported,
		osPermission: permission,
	});

	function patchPreferences(patch: Partial<PushPreferences>) {
		setError("");
		update.mutate(patch);
	}

	if (capability !== "available") {
		return (
			<Screen masthead>
				<Display size={32}>Notifications</Display>
				<Card style={{ gap: 10 }}>
					<Heading>Not available on this server</Heading>
					<Body tone="muted" size={15}>
						This server can’t reach the notification services that push needs,
						so notifications are turned off here. Everything else works the
						same, and email reminders still arrive.
					</Body>
				</Card>
			</Screen>
		);
	}

	if (state === "unavailable-module") {
		return (
			<Screen masthead>
				<Display size={32}>Notifications</Display>
				<Card>
					<Heading>This build doesn’t support notifications</Heading>
					<Body tone="muted" size={15}>
						Install an up-to-date build of the app; notifications then work on
						this server without any other setup.
					</Body>
				</Card>
			</Screen>
		);
	}

	if (state === "loading" || !preferences.isSuccess) {
		return (
			<Screen masthead>
				<Display size={32}>Notifications</Display>
				<ActivityIndicator style={{ marginTop: 40 }} />
			</Screen>
		);
	}

	const preferencesFilled = fillPreferences(preferences.data);
	const mutedGroups = (dashboard.data?.groups ?? [])
		.filter((group) => isGroupMuted(preferencesFilled, group.id))
		.map((group) => ({ id: group.id, name: group.name }));

	return (
		<Screen masthead tabBar>
			<Display size={32}>Notifications</Display>

			{state === "denied" ? (
				<Card style={{ gap: 10 }}>
					<Heading>Notifications are switched off</Heading>
					<Body tone="muted" size={15}>
						Eventual doesn’t have permission to send notifications on this
						device. Turn them on from system settings, then come back here.
					</Body>
					<GlassButton
						label="Open system settings"
						onPress={() => void Linking.openSettings()}
					/>
				</Card>
			) : null}

			{state === "not-determined" ? (
				<Card style={{ gap: 10 }}>
					<Heading>Turn on notifications</Heading>
					<Body tone="muted" size={15}>
						Get a nudge when someone in your groups adds, updates or deletes an
						expense, or records a payment.
					</Body>
					<GlassButton
						label="Turn on notifications"
						onPress={() =>
							void (async () => {
								const granted = await requestNotificationPermission();
								setPermission(granted);
								if (granted === "granted" && user)
									void ensurePushRegistration(api, {
										origin,
										userId: user.id,
										hostedOrigin: HOSTED_ORIGIN,
										site,
									});
							})()
						}
					/>
				</Card>
			) : null}

			{state === "granted" ? (
				<>
					<Card style={{ gap: 6 }}>
						{CATEGORIES.map((category) => (
							<View
								key={category.key}
								style={{
									flexDirection: "row",
									gap: 12,
									alignItems: "center",
									minHeight: 48,
								}}
							>
								<Checkbox
									checked={preferencesFilled[category.key]}
									busy={
										update.isPending &&
										update.variables?.[category.key] !== undefined
									}
									label={category.title}
									onChange={(checked) =>
										patchPreferences({ [category.key]: checked })
									}
								/>
								<View style={{ flex: 1 }}>
									<Body weight="medium">{category.title}</Body>
									<Body tone="muted" size={14}>
										{category.detail}
									</Body>
								</View>
							</View>
						))}
					</Card>

					<Card style={{ gap: 8 }}>
						<Heading>Muted groups</Heading>
						{mutedGroups.length === 0 ? (
							<Body tone="muted" size={15}>
								No group is muted. Mute a group from its settings and stop all
								activity notifications for that group.
							</Body>
						) : (
							mutedGroups.map((group) => (
								<View
									key={group.id}
									style={{
										flexDirection: "row",
										alignItems: "center",
										gap: 12,
										minHeight: 48,
									}}
								>
									<View style={{ flex: 1 }}>
										<Body weight="medium" numberOfLines={1}>
											{group.name || group.id}
										</Body>
										<Body tone="muted" size={14}>
											Muted · all activity notifications
										</Body>
									</View>
									<GlassButton
										label="Unmute"
										busy={update.isPending}
										disabled={update.isPending}
										onPress={() =>
											patchPreferences({
												mutedGroupIds: mutedAfterToggle(
													preferencesFilled,
													group.id,
													false,
												),
											})
										}
									/>
								</View>
							))
						)}
					</Card>
				</>
			) : null}

			{error ? <FormMessage>{error}</FormMessage> : null}
		</Screen>
	);
}
