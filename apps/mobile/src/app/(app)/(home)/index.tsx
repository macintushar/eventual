import { formatMinor } from "@eventual/schemas/money";
import type { EndpointOutput } from "@eventual/sdk";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Amount } from "../../../components/amount";
import {
	Body,
	Card,
	Display,
	GlassButton,
	Heading,
	Kicker,
	Wordmark,
} from "../../../components/brand";
import { useApi, useSession } from "../../../lib/session";
import { fonts, shadow, useTheme } from "../../../theme";

type Dashboard = EndpointOutput<"app.dashboard">;

export default function Groups() {
	const t = useTheme();
	const api = useApi();
	const dashboard = useQuery({
		queryKey: ["dashboard"],
		queryFn: () => api.call("app.dashboard"),
	});
	return (
		<SafeAreaView
			edges={["top", "left", "right"]}
			style={{ flex: 1, backgroundColor: t.canvas }}
		>
			<ScrollView
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{
					paddingHorizontal: 20,
					paddingTop: 8,
					paddingBottom: 120,
					gap: 28,
				}}
				refreshControl={
					<RefreshControl
						refreshing={dashboard.isRefetching}
						onRefresh={() => void dashboard.refetch()}
						tintColor={t.mutedInk}
					/>
				}
			>
				<View style={{ minHeight: 48, justifyContent: "center" }}>
					<Wordmark />
				</View>
				{dashboard.data ? (
					<Loaded data={dashboard.data} />
				) : dashboard.isError ? (
					<Card>
						<Heading>Couldn’t load your groups</Heading>
						<Body tone="muted">
							Check your connection and try again. Nothing here has changed.
						</Body>
						<GlassButton
							label="Try again"
							onPress={() => void dashboard.refetch()}
						/>
					</Card>
				) : (
					<Card elevated>
						<Kicker>Your running total</Kicker>
						<Body tone="muted">Loading your balances…</Body>
					</Card>
				)}
			</ScrollView>
		</SafeAreaView>
	);
}

function Loaded({ data }: { data: Dashboard }) {
	const t = useTheme();
	const router = useRouter();
	const { origin } = useSession();
	const { groups, invitations, crossGroupBalances, user } = data;
	const totals = [...new Set(crossGroupBalances.map((row) => row.currency))]
		.sort()
		.map((currency) => {
			const rows = crossGroupBalances.filter(
				(row) => row.currency === currency,
			);
			return {
				currency,
				owed: rows.reduce((sum, row) => sum + Math.max(row.amountMinor, 0), 0),
				owing: rows.reduce(
					(sum, row) => sum + Math.max(-row.amountMinor, 0),
					0,
				),
			};
		});
	const allSquare = totals.every((row) => row.owed === 0 && row.owing === 0);
	const firstName = user.name.split(" ")[0];

	return (
		<>
			<Card elevated>
				<Kicker>Your running total</Kicker>
				<View style={{ gap: 8 }}>
					<Display>{allSquare ? "You’re all square" : "Your balances"}</Display>
					<Body tone="muted">
						Welcome back, {firstName}. Across{" "}
						{groups.length === 1 ? "1 group" : `${groups.length} groups`}.
					</Body>
				</View>
				{allSquare ? null : (
					<View style={{ flexDirection: "row", gap: 12 }}>
						<TotalTile label="Owed to you">
							{totals.map((row) => (
								<Amount
									key={row.currency}
									minor={row.owed}
									currency={row.currency}
									tone="positive"
									size={22}
								/>
							))}
						</TotalTile>
						<TotalTile label="You owe">
							{totals.map((row) => (
								<Amount
									key={row.currency}
									minor={row.owing}
									currency={row.currency}
									tone="negative"
									size={22}
								/>
							))}
						</TotalTile>
					</View>
				)}
			</Card>

			{invitations.length > 0 ? (
				<View style={{ gap: 12 }}>
					<Heading>Pending invitations</Heading>
					{invitations.map((row) => (
						<Card key={row.invitation.id} style={{ padding: 18, gap: 14 }}>
							<Body weight="semibold">
								{row.inviterName} invited you to {row.groupName}
							</Body>
							<GlassButton
								prominent
								label="Review"
								onPress={() =>
									void WebBrowser.openBrowserAsync(
										`${origin}/invite/${row.invitation.id}`,
									)
								}
							/>
						</Card>
					))}
				</View>
			) : null}

			<View style={{ gap: 14 }}>
				<View style={{ gap: 2 }}>
					<Heading>Groups</Heading>
					<Body tone="muted">Every shared tab in one place.</Body>
				</View>
				{groups.length ? (
					groups.map((group) => {
						const outstanding = group.balances.filter(
							(row) => row.balanceMinor !== 0,
						);
						return (
							<Pressable
								key={group.id}
								accessibilityRole="button"
								onPress={() => router.push(`/group/${group.id}`)}
								accessibilityLabel={`${group.name}, ${
									outstanding.length
										? outstanding
												.map(
													(row) =>
														`${row.balanceMinor > 0 ? "owed to you" : "you owe"} ${formatMinor(Math.abs(row.balanceMinor), row.currency)}`,
												)
												.join(", ")
										: "settled up"
								}`}
								style={({ pressed }) => [
									{
										transform: [{ scale: pressed ? 0.98 : 1 }],
										flexDirection: "row",
										alignItems: "center",
										gap: 16,
										padding: 18,
										borderRadius: 20,
										borderWidth: 1,
										borderColor: t.border,
										backgroundColor: t.paper,
									},
									shadow(t),
								]}
							>
								<View style={{ flex: 1, gap: 8, alignItems: "flex-start" }}>
									<View
										style={{
											backgroundColor: t.muted,
											borderRadius: 999,
											paddingHorizontal: 10,
											paddingVertical: 3,
										}}
									>
										<Body size={13} weight="medium">
											{group.role.charAt(0).toUpperCase() + group.role.slice(1)}
											{group.archivedAt ? " · Archived" : ""}
										</Body>
									</View>
									<Body
										style={{
											fontFamily: fonts.display,
											fontSize: 22,
											lineHeight: 24,
											letterSpacing: -0.5,
										}}
									>
										{group.name}
									</Body>
								</View>
								<View style={{ alignItems: "flex-end" }}>
									{outstanding.length ? (
										outstanding.map((row) => (
											<View
												key={row.currency}
												style={{ alignItems: "flex-end" }}
											>
												<Amount
													minor={row.balanceMinor}
													currency={row.currency}
													tone="signed"
													size={20}
												/>
												<Body tone="muted" size={13}>
													{row.balanceMinor > 0 ? "Owed to you" : "You owe"}
												</Body>
											</View>
										))
									) : (
										<Body tone="muted" size={14}>
											Settled up
										</Body>
									)}
								</View>
							</Pressable>
						);
					})
				) : (
					<Card>
						<Heading>No groups yet</Heading>
						<Body tone="muted">
							Create one for your flat, a dinner, or the next trip — then invite
							people with a link.
						</Body>
					</Card>
				)}
			</View>
		</>
	);
}

function TotalTile({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	const t = useTheme();
	return (
		<View
			style={[
				{
					flex: 1,
					gap: 4,
					padding: 16,
					borderRadius: 18,
					borderWidth: 1,
					borderColor: t.border,
					backgroundColor: t.paper,
				},
				shadow(t),
			]}
		>
			<Body tone="muted" size={14}>
				{label}
			</Body>
			{children}
		</View>
	);
}
