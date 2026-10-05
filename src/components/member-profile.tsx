import { AtSign, Copy, Phone, UserRound } from "lucide-react";
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
	/** Null when they hid it from the group; the server withholds it. */
	email: string | null;
	image: string | null;
	upiVpa: string | null;
	wiseTag: string | null;
	/** A public note about them, if they wrote one. */
	bio?: string | null;
	/** Their number, if they saved one. */
	phone?: string | null;
	/**
	 * Whether the member chose to show their email / phone here. Absent means no
	 * choice was recorded, which reads as shown: contact has always been visible
	 * to a group, so an older profile must not go dark by being read wrong.
	 */
	isEmailPublic?: boolean;
	isPhonePublic?: boolean;
	isGuest: boolean;
};

type Detail = { key: string; label: string; value: string; media: ReactNode };

/** Add future payment methods here; the views do not need to know their shape. */
function paymentDetails(member: MemberProfile): Detail[] {
	const details: (Detail | null)[] = [
		member.upiVpa
			? {
					key: "upi",
					label: "UPI ID",
					value: member.upiVpa,
					media: <BrandLogo brand="upi" />,
				}
			: null,
		member.wiseTag
			? {
					key: "wise",
					label: "Wisetag",
					value: `@${member.wiseTag}`,
					media: <BrandLogo brand="wise" />,
				}
			: null,
	];
	return details.filter((detail): detail is Detail => detail !== null);
}

/**
 * Contact is the part a member can keep to themselves, so each half is shown
 * only when its own toggle allows it. Guests keep their placeholder address to
 * themselves whatever they cannot set.
 */
function contactDetails(member: MemberProfile): Detail[] {
	const details: (Detail | null)[] = [
		member.phone && member.isPhonePublic !== false
			? {
					key: "phone",
					label: "Phone",
					value: member.phone,
					media: <Phone />,
				}
			: null,
		member.email && !member.isGuest && member.isEmailPublic !== false
			? {
					key: "email",
					label: "Email",
					value: member.email,
					media: <AtSign />,
				}
			: null,
	];
	return details.filter((detail): detail is Detail => detail !== null);
}

/** One labelled, copyable row; contact and payment details share the shape. */
function DetailList({ details, name }: { details: Detail[]; name: string }) {
	return (
		<ItemGroup className="gap-2">
			{details.map((detail) => (
				<Item
					key={detail.key}
					variant="outline"
					size="sm"
					className="flex-nowrap"
				>
					<ItemMedia>{detail.media}</ItemMedia>
					<ItemContent className="min-w-0">
						<ItemTitle>{detail.label}</ItemTitle>
						<p
							className="truncate text-sm text-muted-foreground"
							title={detail.value}
						>
							{detail.value}
						</p>
					</ItemContent>
					<ItemActions>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={`Copy ${detail.label} for ${name}`}
							onClick={async () => {
								if (await copyToClipboard(detail.value, detail.label))
									toast.success(`${detail.label} copied`);
							}}
						>
							<Copy />
						</Button>
					</ItemActions>
				</Item>
			))}
		</ItemGroup>
	);
}

export function MemberProfileDetails({ member }: { member: MemberProfile }) {
	const payment = paymentDetails(member);
	const contact = contactDetails(member);
	return (
		<div className="flex min-w-0 flex-col gap-4">
			<div className="flex min-w-0 items-start gap-3">
				<MemberAvatar
					name={member.name}
					seed={member.userId}
					image={member.image}
					className="size-12"
				/>
				<div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
					<p className="truncate font-semibold">{member.name}</p>
					{/*
					 * The bio is written knowing it is public, so it is shown
					 * verbatim — not shortened, and not behind a toggle.
					 */}
					{member.bio ? (
						<p className="text-sm text-pretty text-muted-foreground">
							{member.bio}
						</p>
					) : null}
				</div>
			</div>
			{contact.length ? (
				<div className="flex flex-col gap-2">
					<p className="text-sm font-medium">Contact</p>
					<DetailList details={contact} name={member.name} />
				</div>
			) : null}
			<div className="flex flex-col gap-2">
				<p className="text-sm font-medium">Payment tags</p>
				{payment.length ? (
					<DetailList details={payment} name={member.name} />
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
