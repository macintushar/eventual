import { Link } from "@tanstack/react-router";

import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "#/components/ui/breadcrumb";

type Parent =
	| { label: string; to: "/app" }
	| {
			label: string;
			to: "/app/groups/$groupId";
			params: { groupId: string };
	  };

export function AppBreadcrumb({
	parent,
	page,
}: {
	parent: Parent;
	page: string;
}) {
	return (
		<Breadcrumb>
			<BreadcrumbList>
				<BreadcrumbItem>
					<BreadcrumbLink asChild>
						{parent.to === "/app" ? (
							<Link to="/app">{parent.label}</Link>
						) : (
							<Link to="/app/groups/$groupId" params={parent.params}>
								{parent.label}
							</Link>
						)}
					</BreadcrumbLink>
				</BreadcrumbItem>
				<BreadcrumbSeparator />
				<BreadcrumbItem>
					<BreadcrumbPage>{page}</BreadcrumbPage>
				</BreadcrumbItem>
			</BreadcrumbList>
		</Breadcrumb>
	);
}
