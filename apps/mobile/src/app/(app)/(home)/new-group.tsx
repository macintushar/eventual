import { isEventualApiError } from "@eventual/sdk";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";
import {
	Body,
	Display,
	Field,
	FormMessage,
	GlassButton,
	Screen,
} from "../../../components/brand";
import { idempotencyKey } from "../../../lib/mutations";
import { useApi } from "../../../lib/session";

export default function NewGroup() {
	const api = useApi();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const key = useRef(idempotencyKey());
	const create = useMutation({
		mutationFn: () =>
			api.call(
				"group.create",
				{ name: name.trim() },
				{ idempotencyKey: key.current },
			),
		onSuccess: async (group) => {
			await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
			router.dismiss();
			router.push({
				pathname: "/group/[groupId]",
				params: { groupId: group.id },
			});
		},
	});
	return (
		<Screen edges={[]} contentStyle={{ paddingTop: 28 }}>
			<View style={{ gap: 8 }}>
				<Display size={28}>Start a group</Display>
				<Body tone="muted">
					For your flat, a dinner, or the next trip. You can add people next.
				</Body>
			</View>
			<Field
				label="Group name"
				placeholder="Goa trip"
				value={name}
				onChangeText={setName}
				autoFocus
				maxLength={100}
				returnKeyType="go"
				onSubmitEditing={() => {
					if (name.trim() && !create.isPending) create.mutate();
				}}
			/>
			{create.isError ? (
				<FormMessage>
					{isEventualApiError(create.error)
						? create.error.message
						: "Couldn’t create the group. Check your connection and try again."}
				</FormMessage>
			) : null}
			<GlassButton
				prominent
				label={create.isPending ? "Creating…" : "Create group"}
				busy={create.isPending}
				disabled={!name.trim()}
				onPress={() => create.mutate()}
			/>
		</Screen>
	);
}
