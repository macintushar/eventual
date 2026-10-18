import { Body, Display, GlassButton, Screen } from "./brand";

/** The original write may already exist; recover it before allowing edits. */
export function WriteRecovery({
	busy,
	retry,
}: {
	busy: boolean;
	retry: () => void;
}) {
	return (
		<Screen edges={[]} contentStyle={{ paddingTop: 28 }}>
			<Display size={28}>
				{busy ? "Saving…" : "Confirm the original save"}
			</Display>
			<Body>
				{busy
					? "Waiting for the server."
					: "The result is uncertain. Retry the original details to confirm whether they were saved. You can edit the saved item afterwards."}
			</Body>
			<GlassButton
				label="Retry original save"
				busy={busy}
				disabled={busy}
				onPress={retry}
			/>
		</Screen>
	);
}
