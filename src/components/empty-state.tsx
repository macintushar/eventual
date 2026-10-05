import type { LucideIcon } from "lucide-react";
import type { AriaRole, ReactNode } from "react";

import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "#/components/ui/empty";
import { cn } from "#/lib/utils";

export function EmptyState({
	icon: Icon,
	title,
	description,
	action,
	className,
	role,
}: {
	icon: LucideIcon;
	title: string;
	description: string;
	action?: ReactNode;
	className?: string;
	/** "alert" for a failure that appears after the page has loaded. */
	role?: AriaRole;
}) {
	return (
		<Empty role={role} className={cn("border border-dashed", className)}>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<Icon />
				</EmptyMedia>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
			{action ? <EmptyContent>{action}</EmptyContent> : null}
		</Empty>
	);
}
