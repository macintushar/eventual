import { useLocalSearchParams } from "expo-router";
import { MergeGuest } from "../../../../../components/group/merge-guest";

export default function MergeGuestRoute() {
	const { groupId, guestUserId } = useLocalSearchParams<{
		groupId: string;
		guestUserId?: string;
	}>();
	return (
		<MergeGuest key={groupId} groupId={groupId} initialGuestId={guestUserId} />
	);
}
