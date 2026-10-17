/** Only facts exposed by groupContext/session.get. Global checks stay server-side. */
export type MergeMember = {
	userId: string;
	name: string;
	role: string;
	weight: number;
	isGuest: boolean;
	claimedAt: unknown;
};

export type MergeGroup = {
	name: string;
	myRole: string;
	archivedAt: unknown;
	members: MergeMember[];
};

export type MergeViewer = {
	id: string;
	emailVerified: boolean;
	isGuest?: boolean | null;
};

export function canStartGuestMerge(group: MergeGroup) {
	return (
		!group.archivedAt && (group.myRole === "owner" || group.myRole === "admin")
	);
}

export function isMergeSource(member: MergeMember, viewerId: string) {
	return (
		member.userId !== viewerId &&
		member.isGuest &&
		!member.claimedAt &&
		member.role === "member"
	);
}

export function guestMergeProblem(
	group: MergeGroup,
	viewer: MergeViewer | null,
	guestUserId: string,
	targetUserId: string,
) {
	if (group.archivedAt) return "Unarchive this group before merging a guest.";
	if (!canStartGuestMerge(group))
		return "Only owners and admins can merge guests.";
	if (!viewer) return "Sign in again before merging a guest.";
	if (!guestUserId) return "Choose a guest to merge.";
	if (guestUserId === targetUserId) return "Choose two different people.";
	const source = group.members.find((row) => row.userId === guestUserId);
	if (!source) return "The selected guest is no longer in this group.";
	if (!isMergeSource(source, viewer.id))
		return "Choose an unclaimed guest with the Member role.";
	if (!targetUserId) return "Choose the account to keep.";
	const target = group.members.find((row) => row.userId === targetUserId);
	if (!target) return "The selected account is no longer in this group.";
	if (targetUserId !== viewer.id)
		return "Only the signed-in account holder can approve a merge into their account.";
	if (target.isGuest || viewer.isGuest || !viewer.emailVerified)
		return "The account to keep must be registered with a verified email.";
	if (source.weight !== target.weight)
		return "These membership weights differ. Make them match before merging.";
	return null;
}

/** A changed name, weight, identity or permission requires a new review. */
export function guestMergeReviewKey(
	group: MergeGroup,
	viewer: MergeViewer,
	guestUserId: string,
	targetUserId: string,
) {
	const snapshot = (id: string) => {
		const row = group.members.find((member) => member.userId === id);
		return row
			? [row.userId, row.name, row.role, row.weight, row.isGuest, row.claimedAt]
			: null;
	};
	return JSON.stringify([
		group.name,
		group.myRole,
		group.archivedAt,
		viewer.id,
		viewer.emailVerified,
		viewer.isGuest ?? false,
		snapshot(guestUserId),
		snapshot(targetUserId),
	]);
}
