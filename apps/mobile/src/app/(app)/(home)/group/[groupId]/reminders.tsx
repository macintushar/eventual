import { formatDateTime } from "@eventual/schemas/dates";
import { can } from "@eventual/schemas/permissions";
import { isEventualApiError } from "@eventual/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Switch, View } from "react-native";
import {
	Body,
	Card,
	Display,
	FormMessage,
	GlassButton,
	Heading,
	Screen,
} from "../../../../../components/brand";
import { DateField } from "../../../../../components/date-field";
import { SelectField } from "../../../../../components/select-field";
import { idempotencyKey } from "../../../../../lib/mutations";
import { useGroupContext } from "../../../../../lib/queries";
import { useApi } from "../../../../../lib/session";
import { useTheme } from "../../../../../theme";

const errorText = (cause: unknown, fallback: string) =>
	isEventualApiError(cause) ? cause.message : fallback;

/** Reminders go out at 9:00 local time on the chosen day. */
function sendTime(day: Date) {
	const at = new Date(day);
	at.setHours(9, 0, 0, 0);
	return at;
}

function tomorrow() {
	const day = new Date();
	day.setDate(day.getDate() + 1);
	return day;
}

function recipientId(payload: string) {
	try {
		const parsed: unknown = JSON.parse(payload);
		if (parsed && typeof parsed === "object" && "userId" in parsed)
			return String(parsed.userId);
	} catch {}
	return "";
}

export default function Reminders() {
	const api = useApi();
	const t = useTheme();
	const queryClient = useQueryClient();
	const { groupId } = useLocalSearchParams<{ groupId: string }>();
	const context = useGroupContext(groupId);
	const jobs = useQuery({
		queryKey: ["group", groupId, "reminders"],
		queryFn: () => api.call("reminder.list", { groupId }),
	});
	const prefs = useQuery({
		queryKey: ["reminder-preferences"],
		queryFn: () => api.call("reminder.preferences.get", {}),
	});
	const [userId, setUserId] = useState("");
	const [day, setDay] = useState(tomorrow);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

	const schedule = useMutation({
		mutationFn: (recipient: string) =>
			api.call(
				"reminder.schedule",
				{ groupId, userId: recipient, dueAt: sendTime(day) },
				{ idempotencyKey: idempotencyKey() },
			),
		onMutate: () => {
			setError("");
			setMessage("");
		},
		onSuccess: async () => {
			setMessage("Reminder scheduled.");
			await queryClient.invalidateQueries({
				queryKey: ["group", groupId, "reminders"],
			});
		},
		onError: (cause) =>
			setError(errorText(cause, "Couldn’t schedule the reminder.")),
	});
	const setPreference = useMutation({
		mutationFn: (emailReminders: boolean) =>
			api.call(
				"reminder.preferences.update",
				{ emailReminders },
				{ idempotencyKey: idempotencyKey() },
			),
		onMutate: () => setError(""),
		onSuccess: (result) =>
			queryClient.setQueryData(["reminder-preferences"], result),
		onError: (cause) =>
			setError(errorText(cause, "Couldn’t update your preference.")),
	});

	const group = context.data?.group;
	const meId = context.data?.user.id;
	if (!group || !meId)
		return (
			<Screen edges={["left", "right"]}>
				{context.isError ? (
					<Card>
						<Heading>Couldn’t load this group</Heading>
						<GlassButton
							label="Try again"
							onPress={() => void context.refetch()}
						/>
					</Card>
				) : (
					<ActivityIndicator style={{ marginTop: 40 }} />
				)}
			</Screen>
		);

	const names = new Map(group.members.map((m) => [m.userId, m.name]));
	const archived = Boolean(group.archivedAt);
	const canSchedule = !archived && can(group.myRole, "reminder", "create");
	const canSetPreference = can(group.myRole, "reminder", "update");
	const recipient = userId || meId;
	const pending = (jobs.data ?? [])
		.filter((job) => !job.completedAt)
		.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
	const emailReminders = prefs.data?.emailReminders ?? true;

	return (
		<Screen tabBar edges={["left", "right"]}>
			<Display size={32}>Email reminders</Display>
			<Body tone="muted" size={15}>
				Email someone a nudge about their balance on a day you choose. Failed
				sends are retried.
			</Body>

			<Card>
				<Heading>Scheduled</Heading>
				{jobs.isPending ? (
					<ActivityIndicator />
				) : jobs.isError ? (
					<>
						<Body tone="muted" size={15}>
							Couldn’t load reminders.
						</Body>
						<GlassButton
							label="Try again"
							onPress={() => void jobs.refetch()}
						/>
					</>
				) : pending.length === 0 ? (
					<Body tone="muted" size={15}>
						No reminders scheduled.
					</Body>
				) : (
					pending.map((job) => (
						<View
							key={job.id}
							style={{
								flexDirection: "row",
								justifyContent: "space-between",
								gap: 12,
							}}
						>
							<Body weight="medium" numberOfLines={1} style={{ flex: 1 }}>
								{names.get(recipientId(job.payload)) ?? "A member"}
							</Body>
							<Body tone="muted" size={15}>
								{formatDateTime(job.dueAt)}
							</Body>
						</View>
					))
				)}
			</Card>

			{canSchedule ? (
				<Card>
					<Heading>Schedule a reminder</Heading>
					<SelectField
						label="Remind"
						value={recipient}
						options={group.members.map((member) => ({
							value: member.userId,
							label:
								member.userId === meId ? `${member.name} (you)` : member.name,
						}))}
						onChange={setUserId}
					/>
					<DateField label="Send on" value={day} onChange={setDay} future />
					<Body tone="muted" size={14}>
						Sent at 9:00 AM that day.
					</Body>
					<GlassButton
						prominent
						label={schedule.isPending ? "Scheduling…" : "Schedule"}
						busy={schedule.isPending}
						onPress={() => schedule.mutate(recipient)}
					/>
				</Card>
			) : archived ? (
				<Body tone="muted" size={15}>
					This group is archived, so new reminders can’t be scheduled.
				</Body>
			) : (
				<Body tone="muted" size={15}>
					Only people who can manage reminders can schedule them.
				</Body>
			)}

			{canSetPreference ? (
				<Card>
					<View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
						<View style={{ flex: 1, gap: 4 }}>
							<Heading>Reminders to me</Heading>
							<Body tone="muted" size={15}>
								Get balance reminder emails from any of your groups.
							</Body>
						</View>
						{prefs.isPending || setPreference.isPending ? (
							<ActivityIndicator />
						) : (
							<Switch
								accessibilityLabel="Email me balance reminders"
								value={emailReminders}
								disabled={prefs.isError}
								trackColor={{ true: t.positive }}
								onValueChange={(next) => setPreference.mutate(next)}
							/>
						)}
					</View>
					{prefs.isError ? (
						<Body tone="muted" size={15}>
							Couldn’t load your preference.
						</Body>
					) : null}
				</Card>
			) : null}

			{message ? <FormMessage tone="positive">{message}</FormMessage> : null}
			{error ? <FormMessage>{error}</FormMessage> : null}
		</Screen>
	);
}
