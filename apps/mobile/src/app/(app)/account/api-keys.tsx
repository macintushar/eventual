import {
	type ApiKeySummary,
	apiKeySummarySchema,
} from "@eventual/schemas/account";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	RefreshControl,
	ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiKeyCreator } from "../../../components/api-key-creator";
import {
	Body,
	Card,
	Display,
	FormMessage,
	GlassButton,
} from "../../../components/brand";
import { keyModeLabels } from "../../../lib/api-key-policy";
import { useApi } from "../../../lib/session";
import { useTheme } from "../../../theme";

function date(value: string | null) {
	return value ? new Date(value).toLocaleDateString() : "Never";
}
export default function ApiKeys() {
	const t = useTheme();
	const api = useApi();
	const queryClient = useQueryClient();
	const [creating, setCreating] = useState(false);
	const [revoking, setRevoking] = useState<string | null>(null);
	const revokeBusy = useRef(false);
	const [notice, setNotice] = useState("");
	// Native tabs retain their stacks. Don't leave a pending protection request
	// or a modal alive behind a screen the user has navigated away from.
	useFocusEffect(useCallback(() => () => setCreating(false), []));
	const keys = useQuery({
		queryKey: ["api-keys"],
		queryFn: async ({ signal }) =>
			(await api.call("apiKey.list", {}, { signal })).map((key) =>
				apiKeySummarySchema.parse(key),
			),
		staleTime: 30_000,
	});
	function refresh() {
		void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
	}
	function confirmRevoke(key: ApiKeySummary) {
		Alert.alert(
			"Revoke this key?",
			`${key.name ?? "This key"} will stop working immediately. Anything still using it will get a 401.`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Revoke key",
					style: "destructive",
					onPress: () => {
						void revoke(key.id);
					},
				},
			],
		);
	}
	async function revoke(keyId: string) {
		if (revokeBusy.current) return;
		revokeBusy.current = true;
		setRevoking(keyId);
		setNotice("");
		try {
			await api.call("apiKey.delete", { keyId });
			setNotice("API key revoked.");
			refresh();
		} catch {
			Alert.alert(
				"Couldn’t revoke API key",
				"Try again. The key may still be active.",
			);
		} finally {
			revokeBusy.current = false;
			setRevoking(null);
		}
	}
	return (
		<SafeAreaView
			edges={["left", "right"]}
			style={{ flex: 1, backgroundColor: t.canvas }}
		>
			<ScrollView
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 24 }}
				refreshControl={
					<RefreshControl
						refreshing={keys.isFetching && !keys.isPending}
						onRefresh={() => void keys.refetch()}
						tintColor={t.ink}
					/>
				}
			>
				<Display>API keys</Display>
				<Body tone="muted">
					Keys belong to your account. Use them with scripts, the REST API or
					MCP — not to sign in to this app.
				</Body>
				<GlassButton
					prominent
					label={creating ? "Preparing protected screen…" : "New key"}
					onPress={() => setCreating(true)}
					disabled={creating}
				/>
				{notice ? <FormMessage tone="positive">{notice}</FormMessage> : null}
				{keys.isPending ? <ActivityIndicator color={t.ink} /> : null}
				{keys.isError ? (
					<Card>
						<FormMessage>
							{keys.data
								? "Couldn’t refresh. Showing the last list loaded."
								: "Couldn’t load API keys."}
						</FormMessage>
						<GlassButton
							label="Try again"
							onPress={() => void keys.refetch()}
						/>
					</Card>
				) : null}
				{keys.data?.length === 0 ? (
					<Card>
						<Body weight="semibold">No API keys yet</Body>
						<Body tone="muted">
							Create a key for your integrations. Its secret will only be shown
							once.
						</Body>
					</Card>
				) : null}
				{keys.data?.map((key) => (
					<Card key={key.id}>
						<Body weight="semibold">{key.name ?? "Untitled"}</Body>
						<Body>{key.start ? `${key.start}…` : "ev_…"}</Body>
						<Body tone="muted">
							{keyModeLabels[key.mode]} ·{" "}
							{key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()
								? "Expired"
								: key.enabled
									? "Active"
									: "Disabled"}
						</Body>
						{key.mode === "legacy" ? (
							<Body tone="muted" size={14}>
								Created before scoped keys. Revoke and recreate to limit access.
							</Body>
						) : null}
						<Body size={14}>
							Created {date(key.createdAt)}
							{"\n"}Expires {date(key.expiresAt)}
							{"\n"}Last used {date(key.lastRequest)}
						</Body>
						<GlassButton
							destructive
							label={
								revoking === key.id
									? "Revoking…"
									: `Revoke ${key.name ?? "key"}`
							}
							busy={revoking === key.id}
							disabled={revoking !== null}
							onPress={() => confirmRevoke(key)}
						/>
					</Card>
				))}
			</ScrollView>
			{creating ? (
				<ApiKeyCreator onClose={() => setCreating(false)} onCreated={refresh} />
			) : null}
		</SafeAreaView>
	);
}
