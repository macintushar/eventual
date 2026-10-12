import { can } from "@eventual/schemas/permissions";
import { useMutation, useQuery } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import { useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { ActivityIndicator } from "react-native";
import {
	Body,
	Card,
	Display,
	FormMessage,
	GlassButton,
	Heading,
	Screen,
} from "../../../../../components/brand";
import { Segmented } from "../../../../../components/segmented";
import { useGroupContext } from "../../../../../lib/queries";
import { useApi, useSession } from "../../../../../lib/session";

type Format = "csv" | "pdf";

const types: Record<Format, { mime: string; uti: string; label: string }> = {
	csv: {
		mime: "text/csv",
		uti: "public.comma-separated-values-text",
		label: "CSV",
	},
	pdf: { mime: "application/pdf", uti: "com.adobe.pdf", label: "PDF" },
};

export default function ExportExpenses() {
	const api = useApi();
	const { auth, origin } = useSession();
	const { groupId } = useLocalSearchParams<{ groupId: string }>();
	const context = useGroupContext(groupId);
	const [format, setFormat] = useState<Format>("csv");
	const [progress, setProgress] = useState<number | null>(null);
	const [error, setError] = useState("");

	// Just enough to tell an empty group from one with something to export.
	const first = useQuery({
		queryKey: ["group", groupId, "expenses", "any"],
		queryFn: () => api.call("expense.page", { groupId, limit: 1 }),
	});

	const download = useMutation({
		mutationFn: async () => {
			const cookie = await auth.getCookie();
			const kind = types[format];
			const file = new File(
				Paths.cache,
				`eventual-expenses-${groupId}.${format}`,
			);
			setProgress(0);
			// The session cookie is ours to send, as in the API client.
			await File.downloadFileAsync(
				`${origin}/api/v1/groups/${encodeURIComponent(groupId)}/reports/expenses?format=${format}`,
				file,
				{
					headers: cookie ? { cookie } : {},
					idempotent: true,
					onProgress: ({ bytesWritten, totalBytes }) =>
						setProgress(totalBytes > 0 ? bytesWritten / totalBytes : null),
				},
			);
			if (!(await Sharing.isAvailableAsync()))
				throw new Error("Sharing isn’t available on this device.");
			await Sharing.shareAsync(file.uri, {
				mimeType: kind.mime,
				UTI: kind.uti,
				dialogTitle: "Expense report",
			});
		},
		onMutate: () => setError(""),
		onError: (cause) =>
			setError(
				cause instanceof Error && cause.message.includes("available")
					? cause.message
					: "Couldn’t download the report. Check your connection and try again.",
			),
		onSettled: () => setProgress(null),
	});

	const group = context.data?.group;
	if (!group)
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

	const allowed = can(group.myRole, "expense", "read");
	const empty = first.data ? first.data.items.length === 0 : false;
	const percent =
		progress === null ? "" : ` ${Math.round(Math.min(progress, 1) * 100)}%`;

	return (
		<Screen tabBar edges={["left", "right"]}>
			<Display size={32}>Export</Display>
			<Body tone="muted" size={15}>
				Every expense in this group, as a spreadsheet or a printable PDF. Save
				it to Files or send it to another app.
			</Body>

			{!allowed ? (
				<Body tone="muted">
					You don’t have access to this group’s expenses.
				</Body>
			) : empty ? (
				<Body tone="muted">There are no expenses to export yet.</Body>
			) : (
				<Card>
					<Heading>Format</Heading>
					<Segmented
						value={format}
						options={[
							{ value: "csv", label: "CSV" },
							{ value: "pdf", label: "PDF" },
						]}
						onChange={setFormat}
					/>
					<GlassButton
						prominent
						label={
							download.isPending
								? `Preparing ${types[format].label}…${percent}`
								: `Export ${types[format].label}`
						}
						busy={download.isPending}
						disabled={first.isPending}
						onPress={() => download.mutate()}
					/>
				</Card>
			)}

			{error ? <FormMessage>{error}</FormMessage> : null}
		</Screen>
	);
}
