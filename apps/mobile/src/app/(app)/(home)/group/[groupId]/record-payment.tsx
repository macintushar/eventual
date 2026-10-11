import { formatMinor, parseMinor } from "@eventual/schemas/money";
import {
	repaymentLimit,
	validateRepayment,
} from "@eventual/schemas/settlements";
import { isEventualApiError } from "@eventual/sdk";
import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { AmountField } from "../../../../../components/amount-field";
import {
	Body,
	Display,
	Field,
	FormMessage,
	GlassButton,
	Screen,
} from "../../../../../components/brand";
import { SelectField } from "../../../../../components/select-field";
import { idempotencyKey } from "../../../../../lib/mutations";
import {
	useGroupContext,
	useGroupSummary,
	useRefreshAfterWrite,
} from "../../../../../lib/queries";
import { useApi } from "../../../../../lib/session";
import { useTheme } from "../../../../../theme";

export default function RecordPayment() {
	const _t = useTheme();
	const api = useApi();
	const router = useRouter();
	const refresh = useRefreshAfterWrite();
	const params = useLocalSearchParams<{
		groupId: string;
		from?: string;
		to?: string;
		currency?: string;
		amount?: string;
	}>();
	const { groupId } = params;
	const context = useGroupContext(groupId);
	const summary = useGroupSummary(groupId);
	const me = context.data?.user.id ?? "";
	const transfers = summary.data?.balances.transfers ?? [];
	const mine = transfers.find((row) => row.from.userId === me);

	const [from, setFrom] = useState(params.from ?? me);
	const [to, setTo] = useState(params.to ?? mine?.to.userId ?? "");
	const [currency, setCurrency] = useState(
		params.currency ?? mine?.currency ?? transfers[0]?.currency ?? "INR",
	);
	const [amount, setAmount] = useState(params.amount ?? "");
	const [note, setNote] = useState("");
	const [attempted, setAttempted] = useState(false);
	// Defaults wait for the group to load: you as the payer, and whoever you
	// owe. Filled once, so they never overwrite a choice.
	const defaulted = useRef(false);
	useEffect(() => {
		if (defaulted.current || !me || !summary.data) return;
		defaulted.current = true;
		if (!params.from) setFrom(me);
		if (!params.to && mine) {
			setTo(mine.to.userId);
			setCurrency(mine.currency);
		}
	}, [me, mine, params.from, params.to, summary.data]);
	// One key per sheet, so a retry after a dropped connection can't record twice.
	const key = useRef(idempotencyKey());

	const repayment = {
		fromUserId: from,
		toUserId: to,
		currency,
		amountMinor: parseMinor(amount, currency),
	};
	const invalid = validateRepayment(transfers, repayment);
	const limit = repaymentLimit(transfers, repayment);
	const toError = attempted && !to ? "Choose who was paid" : null;
	const amountError = !amount.trim()
		? attempted
			? "Enter an amount"
			: null
		: to
			? invalid
			: null;

	const save = useMutation({
		mutationFn: (amountMinor: number) =>
			api.call(
				"settlement.create",
				{
					groupId,
					fromUserId: from,
					toUserId: to,
					amountMinor,
					currency,
					note: note.trim() || null,
				},
				{ idempotencyKey: key.current },
			),
		onSuccess: async () => {
			await refresh(groupId);
			router.back();
		},
	});

	function submit() {
		setAttempted(true);
		if (invalid || repayment.amountMinor === null || save.isPending) return;
		save.mutate(repayment.amountMinor);
	}

	const members = context.data?.group.members ?? [];
	const name = (userId: string, label: string) =>
		userId === me ? `${label} (you)` : label;
	const currencies = [
		...new Set([currency, ...transfers.map((row) => row.currency)]),
	];

	return (
		<Screen edges={[]} contentStyle={{ paddingTop: 28 }}>
			<View style={{ gap: 8 }}>
				<Display size={28}>Record a payment</Display>
				<Body tone="muted">
					Money that changed hands. Matching shares are marked paid for you.
				</Body>
			</View>
			<SelectField
				label="Paid by"
				value={from}
				options={members.map((member) => ({
					value: member.userId,
					label: name(member.userId, member.name),
				}))}
				onChange={(value) => {
					setFrom(value);
					if (value === to) setTo("");
				}}
			/>
			<SelectField
				label="Paid to"
				value={to}
				placeholder="Choose member"
				error={toError}
				options={members
					.filter((member) => member.userId !== from)
					.map((member) => ({
						value: member.userId,
						label: name(member.userId, member.name),
					}))}
				onChange={setTo}
			/>
			{currencies.length > 1 ? (
				<SelectField
					label="Currency"
					value={currency}
					options={currencies.map((code) => ({ value: code, label: code }))}
					onChange={(value) => {
						setCurrency(value);
						setAmount("");
					}}
				/>
			) : null}
			<AmountField
				currency={currency}
				value={amount}
				onChange={setAmount}
				hint={
					amountError ??
					(to ? `Up to ${formatMinor(limit, currency)} is owed.` : undefined)
				}
				invalid={Boolean(amountError)}
			/>
			<Field
				label="Note"
				placeholder="UPI, cash, … (optional)"
				value={note}
				onChangeText={setNote}
				maxLength={500}
			/>
			{save.isError ? (
				<FormMessage>
					{isEventualApiError(save.error)
						? save.error.message
						: "Couldn’t record the payment. Check your connection and try again; nothing was saved twice."}
				</FormMessage>
			) : null}
			<GlassButton
				prominent
				label={save.isPending ? "Recording…" : "Record payment"}
				busy={save.isPending}
				onPress={submit}
			/>
		</Screen>
	);
}
