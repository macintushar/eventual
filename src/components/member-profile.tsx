import { Copy, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { BrandLogo } from "#/components/brand-logo";
import { MemberAvatar } from "#/components/member-avatar";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from "#/components/ui/item";
import { copyToClipboard } from "#/lib/clipboard";

export type MemberProfile = {
	userId: string;
	name: string;
	email: string;
	image: string | null;
	upiVpa: string | null;
	wiseTag: string | null;
	isGuest: boolean;
};

/** Add future payment methods here; the views do not need to know their shape. */
function paymentTags(member: MemberProfile) {
	return [
		member.upiVpa && {
			label: "UPI ID",
			value: member.upiVpa,
			brand: "upi" as const,
		},
		member.wiseTag && {
			label: "Wisetag",
			value: `@${member.wiseTag}`,
			brand: "wise" as const,
		},
	].filter((tag): tag is Exclude<typeof tag, null | ""> => Boolean(tag));
}

export function MemberProfileDetails({ member }: { member: MemberProfile }) {
	const tags = paymentTags(member);
	return (
		<div className="flex min-w-0 flex-col gap-4">
			<div className="flex min-w-0 items-center gap-3">
				<MemberAvatar
					name={member.name}
					seed={member.userId}
					image={member.image}
					className="size-12"
				/>
				<div className="min-w-0">
					<p className="truncate font-semibold">{member.name}</p>
					{!member.isGuest && (
						<p className="truncate text-sm text-muted-foreground">
							{member.email}
						</p>
					)}
				</div>
			</div>
			<div className="flex flex-col gap-2">
				<p className="text-sm font-medium">Payment tags</p>
				{tags.length ? (
					<ItemGroup className="gap-2">
						{tags.map((tag) => (
							<Item
								key={tag.label}
								variant="outline"
								size="sm"
								className="flex-nowrap"
							>
								<ItemMedia>
									<BrandLogo brand={tag.brand} />
								</ItemMedia>
								<ItemContent className="min-w-0">
									<ItemTitle>{tag.label}</ItemTitle>
									<p
										className="truncate text-sm text-muted-foreground"
										title={tag.value}
									>
										{tag.value}
									</p>
								</ItemContent>
								<ItemActions>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label={`Copy ${tag.label} for ${member.name}`}
										onClick={async () => {
											if (await copyToClipboard(tag.value, tag.label))
												toast.success(`${tag.label} copied`);
										}}
									>
										<Copy />
									</Button>
								</ItemActions>
							</Item>
						))}
					</ItemGroup>
				) : (
					<p className="text-sm text-muted-foreground">
						{member.name} hasn’t added any payment tags yet.
					</p>
				)}
			</div>
		</div>
	);
}

export function MemberProfileDialog({
	member,
	compact = false,
	trigger,
}: {
	member: MemberProfile;
	compact?: boolean;
	/** Replaces the default button, e.g. with the member's row itself. */
	trigger?: ReactNode;
}) {
	return (
		<Dialog>
			<DialogTrigger asChild>
				{trigger ?? (
					<Button
						type="button"
						variant="outline"
						size={compact ? "icon-sm" : "sm"}
						aria-label={compact ? `View ${member.name}'s profile` : undefined}
					>
						{compact ? <UserRound /> : "View profile"}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{member.name}’s profile</DialogTitle>
					<DialogDescription>
						Contact and payment details shared with this group.
					</DialogDescription>
				</DialogHeader>
				<MemberProfileDetails member={member} />
			</DialogContent>
		</Dialog>
	);
}
