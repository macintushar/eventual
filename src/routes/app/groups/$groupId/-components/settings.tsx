import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	Archive,
	ArchiveRestore,
	ArrowRight,
	Copy,
	Download,
	LogOut,
	Plus,
	Settings,
	Tags,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CategoryReviewDialog } from "#/components/category-review-dialog";
import {
	ArchiveGroupDialog,
	DeleteGroupDialog,
	LeaveGroupDialog,
} from "#/components/group-exit-dialogs";
import { RoleLock, RoleNote } from "#/components/role-lock";
import { SettingsRow, SettingsSection } from "#/components/settings-section";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "#/components/ui/accordion";
import { Field, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Spinner } from "#/components/ui/spinner";
import { builtInCategories, builtInCategory } from "#/lib/categories";
import { can } from "#/lib/permissions";
import { groupSettingsQueryOptions } from "#/lib/queries";
import {
	type Execute,
	LoadError,
	type LoaderData,
	Loading,
	type Run,
} from "./shared";

/* ---------------------------------------------------------------- Settings */

/** Payloads are stored as JSON text; a malformed one should not take the page down. */
function parsePayload<T>(payload: unknown): Partial<T> {
	if (typeof payload !== "string") return (payload ?? {}) as Partial<T>;
	try {
		return JSON.parse(payload) as Partial<T>;
	} catch {
		return {};
	}
}

function formatWhen(value: Date | string) {
	return new Date(value).toLocaleString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

/**
 * Grouped by what a setting is for — the group itself, what runs on its own,
 * getting data out, and the irreversible actions last — so the page reads top
 * to bottom from everyday to rare.
 */
export function SettingsTab({
	data,
	groupId,
	run,
	execute,
	onLeave,
	onSettle,
}: {
	data: LoaderData;
	groupId: string;
	run: Run;
	execute: Execute;
	onLeave: () => void;
	onSettle: () => void;
}) {
	const [groupName, setGroupName] = useState(data.group.name);
	const settings = useQuery(groupSettingsQueryOptions(groupId));
	const categoryRules = settings.data?.categoryRules ?? [];
	const [rulePattern, setRulePattern] = useState("");
	const [ruleCategory, setRuleCategory] = useState("");
	const [ruleApplyToExisting, setRuleApplyToExisting] = useState(true);
	const ruleBuiltIn = rulePattern.trim() ? builtInCategory(rulePattern) : null;
	const [reminderUser, setReminderUser] = useState(
		data.group.members.find((member) => member.userId !== data.user.id)
			?.userId ?? data.user.id,
	);
	const [reminderAt, setReminderAt] = useState("");
	const role = data.group.myRole;
	const canEditGroup = can(role, "group", "update");
	const canDeleteGroup = can(role, "group", "delete");
	const canAddRule = can(role, "category", "create");
	const canDeleteRule = can(role, "category", "delete");
	const navigate = useNavigate();
	const [duplicating, setDuplicating] = useState(false);
	const archived = Boolean(data.group.archivedAt);
	const reportHref = (format: "csv" | "pdf") =>
		`/api/v1/groups/${groupId}/reports/expenses?format=${format}`;
	const names = new Map(
		data.group.members.map((member) => [member.userId, member.name]),
	);
	const pendingReminders = (settings.data?.reminders ?? []).filter(
		(job) => !job.completedAt,
	);
	if (settings.isPending) return <Loading label="Loading settings…" />;
	if (settings.isError)
		return (
			<LoadError
				icon={Settings}
				title="Couldn't load settings"
				query={settings}
			/>
		);

	return (
		<div className="flex flex-col gap-10 sm:gap-12">
			<SettingsSection
				title="General"
				description="The basics everyone in the group sees."
			>
				{/*
				 * Roles that can't change any of these get the one line that says
				 * why, rather than a page of disabled controls.
				 */}
				{!canEditGroup ? (
					<>
						{archived ? (
							<SettingsRow
								title="Archived"
								description="This group is read-only. An owner or admin can unarchive it."
							/>
						) : null}
						<RoleNote
							permissions={{ group: ["update"] }}
							className="p-5 sm:p-6"
						>
							rename or archive this group
						</RoleNote>
					</>
				) : (
					<>
						<SettingsRow
							title="Group name"
							htmlFor="group-rename"
							description="Everyone in the group sees the new name."
						>
							<form
								className="flex w-full gap-2 sm:w-80"
								onSubmit={(event) => {
									event.preventDefault();
									if (!groupName.trim()) return;
									if (groupName === data.group.name) return;
									void run(
										{
											action: "group.rename",
											input: { groupId, name: groupName },
										},
										"Group renamed",
									);
								}}
							>
								<Input
									id="group-rename"
									value={groupName}
									onChange={(event) => setGroupName(event.target.value)}
								/>
								<Button
									type="submit"
									variant="outline"
									disabled={!groupName.trim() || groupName === data.group.name}
								>
									Save
								</Button>
							</form>
						</SettingsRow>
						<SettingsRow
							title={archived ? "Archived" : "Archive"}
							description={
								archived
									? "This group is read-only. Unarchive it to add expenses again."
									: "Make the group read-only. Balances and history stay visible."
							}
						>
							{archived ? (
								<Button
									variant="outline"
									onClick={() =>
										run(
											{ action: "group.unarchive", input: { groupId } },
											"Group unarchived",
										)
									}
								>
									<ArchiveRestore data-icon="inline-start" />
									Unarchive
								</Button>
							) : (
								<ArchiveGroupDialog
									data={data}
									onConfirm={() =>
										run(
											{ action: "group.archive", input: { groupId } },
											"Group archived",
										)
									}
									trigger={
										<Button variant="outline">
											<Archive data-icon="inline-start" />
											Archive
										</Button>
									}
								/>
							)}
						</SettingsRow>
					</>
				)}
			</SettingsSection>

			<SettingsSection
				title="Automation"
				description="Rules and reminders Eventual runs for this group on its own. Recurring expenses live on the Expenses tab."
			>
				<SettingsRow
					layout="stacked"
					title="Category rules"
					description="New expenses whose description contains the phrase get the category automatically. Common expenses are already covered by built-in keywords; your rules run first, so they can also override them."
				>
					<div className="flex flex-col gap-4">
						<CategoryReviewDialog
							groupId={groupId}
							execute={execute}
							trigger={
								<Button variant="outline" className="self-start">
									<Tags data-icon="inline-start" />
									Review categories
								</Button>
							}
						/>
						<Accordion
							type="single"
							collapsible
							className="rounded-xl border px-4"
						>
							<AccordionItem value="built-in">
								<AccordionTrigger className="text-sm">
									Built-in keywords
								</AccordionTrigger>
								<AccordionContent>
									<dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
										{builtInCategories.map(([category, keywords]) => (
											<div key={category} className="contents">
												<dt className="font-medium">{category}</dt>
												<dd className="text-muted-foreground">
													{keywords.join(", ")}
												</dd>
											</div>
										))}
									</dl>
									<p className="mt-3 text-xs text-muted-foreground">
										These match whole words, so “bus” doesn't match “business”.
										Anything else is filed under Other.
									</p>
								</AccordionContent>
							</AccordionItem>
						</Accordion>
						{categoryRules.length > 0 ? (
							<ul className="divide-y rounded-xl border">
								{categoryRules.map((rule) => (
									<li
										key={rule.id}
										className="flex items-center gap-3 py-2 ps-4 pe-2 text-sm"
									>
										<span className="min-w-0 flex-1 truncate">
											<span className="text-muted-foreground">Contains </span>
											<span className="font-medium">“{rule.pattern}”</span>
											<ArrowRight
												className="mx-2 inline size-3.5 text-muted-foreground"
												aria-hidden="true"
											/>
											<span className="sr-only">sets category to </span>
											<Badge variant="secondary">{rule.category}</Badge>
										</span>
										<CategoryReviewDialog
											groupId={groupId}
											ruleId={rule.id}
											execute={execute}
											trigger={
												<Button
													size="sm"
													variant="ghost"
													aria-label={`Apply rule for “${rule.pattern}” to existing expenses`}
												>
													Apply to existing
												</Button>
											}
										/>
										{canDeleteRule ? (
											<Button
												size="icon-sm"
												variant="ghost"
												className="text-muted-foreground hover:text-destructive"
												aria-label={`Delete rule for “${rule.pattern}”`}
												onClick={() =>
													run(
														{
															action: "category.delete",
															input: { groupId, ruleId: rule.id },
														},
														"Category rule deleted",
													)
												}
											>
												<Trash2 />
											</Button>
										) : null}
									</li>
								))}
							</ul>
						) : null}
						{!canAddRule ? (
							<RoleNote permissions={{ category: ["create"] }}>
								add or remove rules
							</RoleNote>
						) : (
							<form
								className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
								onSubmit={async (event) => {
									event.preventDefault();
									if (!rulePattern.trim() || !ruleCategory.trim()) return;
									const outcome = await execute({
										action: "category.create",
										input: {
											groupId,
											pattern: rulePattern,
											category: ruleCategory,
											priority: 0,
											applyToExisting: ruleApplyToExisting,
										},
									});
									if (outcome.ok) {
										const { recategorized } = outcome.result as {
											recategorized: number;
										};
										toast.success(
											recategorized
												? `Category rule added. ${recategorized} existing ${recategorized === 1 ? "expense" : "expenses"} updated.`
												: "Category rule added",
										);
										setRulePattern("");
										setRuleCategory("");
									}
								}}
							>
								<Field className="gap-1.5">
									<FieldLabel htmlFor="category-pattern">
										Description contains
									</FieldLabel>
									<Input
										id="category-pattern"
										value={rulePattern}
										onChange={(event) => setRulePattern(event.target.value)}
										placeholder="coffee"
									/>
								</Field>
								<Field className="gap-1.5">
									<FieldLabel htmlFor="category-name">Category</FieldLabel>
									<Input
										id="category-name"
										value={ruleCategory}
										onChange={(event) => setRuleCategory(event.target.value)}
										placeholder="Food & drink"
									/>
								</Field>
								<Button
									type="submit"
									variant="outline"
									disabled={!rulePattern.trim() || !ruleCategory.trim()}
								>
									<Plus data-icon="inline-start" />
									Add rule
								</Button>
								<Field orientation="horizontal" className="gap-2 sm:col-span-3">
									<Checkbox
										id="category-apply-existing"
										checked={ruleApplyToExisting}
										onCheckedChange={(value) =>
											setRuleApplyToExisting(value === true)
										}
									/>
									<FieldLabel
										htmlFor="category-apply-existing"
										className="font-normal"
									>
										Also update existing expenses that match
									</FieldLabel>
								</Field>
								{ruleBuiltIn ? (
									<p className="text-sm text-muted-foreground sm:col-span-3">
										{!ruleCategory.trim() ||
										ruleCategory.trim().toLowerCase() ===
											ruleBuiltIn.category.toLowerCase()
											? `Already covered: “${ruleBuiltIn.keyword}” is a built-in keyword for ${ruleBuiltIn.category}. You don't need a rule for it.`
											: `This overrides the built-in ${ruleBuiltIn.category} category for “${ruleBuiltIn.keyword}”.`}
									</p>
								) : null}
							</form>
						)}
					</div>
				</SettingsRow>

				<SettingsRow
					layout="stacked"
					title="Email reminders"
					description="Email someone a nudge about their balance at a time you choose. Failed sends are retried."
				>
					<div className="flex flex-col gap-4">
						{pendingReminders.length > 0 ? (
							<ul className="divide-y rounded-xl border">
								{pendingReminders.map((job) => {
									const payload = parsePayload<{ userId: string }>(job.payload);
									return (
										<li
											key={job.id}
											className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
										>
											<span className="truncate font-medium">
												{names.get(payload.userId ?? "") ?? "A member"}
											</span>
											<span className="shrink-0 text-muted-foreground">
												{formatWhen(job.dueAt)}
											</span>
										</li>
									);
								})}
							</ul>
						) : null}
						<form
							className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
							onSubmit={async (event) => {
								event.preventDefault();
								const dueAt = new Date(reminderAt);
								if (!reminderUser || Number.isNaN(dueAt.getTime())) return;
								if (
									await run(
										{
											action: "reminder.schedule",
											input: { groupId, userId: reminderUser, dueAt },
										},
										"Reminder scheduled",
									)
								)
									setReminderAt("");
							}}
						>
							<Field className="gap-1.5">
								<FieldLabel htmlFor="reminder-user">Remind</FieldLabel>
								<Select value={reminderUser} onValueChange={setReminderUser}>
									<SelectTrigger id="reminder-user" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{data.group.members.map((member) => (
												<SelectItem key={member.userId} value={member.userId}>
													{member.name}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
							<Field className="gap-1.5">
								<FieldLabel htmlFor="reminder-at">Send on</FieldLabel>
								<Input
									id="reminder-at"
									type="datetime-local"
									value={reminderAt}
									onChange={(event) => setReminderAt(event.target.value)}
								/>
							</Field>
							<Button
								type="submit"
								variant="outline"
								disabled={!reminderAt || !reminderUser}
							>
								Schedule
							</Button>
						</form>
					</div>
				</SettingsRow>
			</SettingsSection>

			<SettingsSection
				title="Data"
				description="Take this group's records elsewhere, or start fresh with the same people."
			>
				<SettingsRow
					title="Expense report"
					description="Every expense in this group, as a spreadsheet or a printable PDF."
				>
					<Button variant="outline" asChild>
						<a href={reportHref("csv")} download>
							<Download data-icon="inline-start" />
							CSV
						</a>
					</Button>
					<Button variant="outline" asChild>
						<a href={reportHref("pdf")} download>
							<Download data-icon="inline-start" />
							PDF
						</a>
					</Button>
				</SettingsRow>
				<SettingsRow
					title="Duplicate group"
					description="An empty copy with the same members, roles and weights."
				>
					{!canEditGroup ? (
						<RoleLock permissions={{ group: ["update"] }} />
					) : (
						<Button
							variant="outline"
							disabled={duplicating}
							onClick={async () => {
								setDuplicating(true);
								const outcome = await execute({
									action: "group.duplicate",
									input: { groupId },
								});
								setDuplicating(false);
								if (
									!outcome.ok ||
									!outcome.result ||
									typeof outcome.result !== "object" ||
									!("id" in outcome.result) ||
									typeof outcome.result.id !== "string"
								)
									return;
								toast.success("Group duplicated");
								await navigate({
									to: "/app/groups/$groupId",
									params: { groupId: outcome.result.id },
								});
							}}
						>
							{duplicating ? (
								<Spinner data-icon="inline-start" />
							) : (
								<Copy data-icon="inline-start" />
							)}
							{duplicating ? "Duplicating…" : "Duplicate"}
						</Button>
					)}
				</SettingsRow>
			</SettingsSection>

			<SettingsSection
				title="Danger zone"
				tone="danger"
				description="These can't be undone from here."
			>
				<SettingsRow
					title="Leave group"
					description="You can leave once your balance is zero and none of your shares are unpaid. Owners choose a new owner first."
				>
					<LeaveGroupDialog
						data={data}
						onSettle={onSettle}
						onConfirm={async (newOwnerId) => {
							const ok = await run(
								{ action: "group.leave", input: { groupId, newOwnerId } },
								"You left the group",
							);
							if (ok) onLeave();
							return ok;
						}}
						trigger={
							<Button variant="outline" className="text-destructive">
								<LogOut data-icon="inline-start" />
								Leave
							</Button>
						}
					/>{" "}
				</SettingsRow>
				{!canDeleteGroup ? (
					<SettingsRow
						title="Delete group"
						description="Permanently removes every expense, payment and activity record."
					>
						<RoleLock permissions={{ group: ["delete"] }} />
					</SettingsRow>
				) : (
					<SettingsRow
						title="Delete group"
						description={`Permanently removes every expense, payment and activity record for all ${data.group.members.length} ${
							data.group.members.length === 1 ? "member" : "members"
						}.`}
					>
						<DeleteGroupDialog
							data={data}
							onConfirm={async () => {
								const ok = await run(
									{ action: "group.delete", input: { groupId } },
									"Group deleted",
								);
								if (ok) onLeave();
								return ok;
							}}
							trigger={
								<Button variant="destructive">
									<Trash2 data-icon="inline-start" />
									Delete
								</Button>
							}
						/>
					</SettingsRow>
				)}
			</SettingsSection>
		</div>
	);
}
