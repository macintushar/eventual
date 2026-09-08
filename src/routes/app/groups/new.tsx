import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppBreadcrumb } from "#/components/app-breadcrumb";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { mutateFn } from "#/server/fn/app";

export const Route = createFileRoute("/app/groups/new")({
	component: NewGroup,
});

const suggestions = ["Goa weekend", "Flat 4B", "Office lunches", "Road trip"];

function NewGroup() {
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [pending, setPending] = useState(false);

	return (
		<div className="mx-auto flex w-full max-w-xl flex-col gap-5">
			<AppBreadcrumb
				parent={{ label: "All groups", to: "/app" }}
				page="New group"
			/>
			<Card className="island-shell">
				<CardHeader>
					<CardTitle className="display-title text-2xl">
						Start a group
					</CardTitle>
					<CardDescription>
						A group holds its own expenses, balances and members. You can invite
						people right after.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						className="flex flex-col gap-4"
						onSubmit={async (event) => {
							event.preventDefault();
							setPending(true);
							try {
								const result = await mutateFn({
									data: { action: "group.create", input: { name } },
								});
								if (!result || !("id" in result))
									throw new Error("Group was not created");
								toast.success("Group created");
								await navigate({
									to: "/app/groups/$groupId",
									params: { groupId: result.id },
								});
							} catch (error) {
								toast.error(
									error instanceof Error
										? error.message
										: "Could not create group",
								);
							} finally {
								setPending(false);
							}
						}}
					>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="group-name">Group name</FieldLabel>
								<Input
									id="group-name"
									value={name}
									maxLength={100}
									placeholder="Goa weekend"
									onChange={(event) => setName(event.target.value)}
								/>
							</Field>
							<Field>
								<ToggleGroup
									type="single"
									variant="outline"
									spacing={2}
									rovingFocus={false}
									value={suggestions.includes(name) ? name : ""}
									onValueChange={(value) => {
										if (value) setName(value);
									}}
									className="flex flex-wrap"
									aria-label="Suggested group names"
								>
									{suggestions.map((suggestion) => (
										<ToggleGroupItem key={suggestion} value={suggestion}>
											{suggestion}
										</ToggleGroupItem>
									))}
								</ToggleGroup>
							</Field>
						</FieldGroup>
						<Button disabled={!name.trim() || pending}>
							{pending ? <Spinner data-icon="inline-start" /> : null}
							{pending ? "Creating…" : "Create group"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
