import { useForm } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
	columnFilteringFeature,
	createColumnHelper,
	createFilteredRowModel,
	createSortedRowModel,
	filterFn_includesString,
	globalFilteringFeature,
	rowSortingFeature,
	sortFn_basic,
	sortFn_text,
	tableFeatures,
	useTable,
} from "@tanstack/react-table";
import {
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	Check,
	Copy,
	KeyRound,
	Plus,
	Trash2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { EmptyState } from "#/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "#/components/ui/input-group";
import { Spinner } from "#/components/ui/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { useCreateApiKey, useDeleteApiKey } from "#/lib/app-mutation";
import { copyToClipboard } from "#/lib/clipboard";
import { fieldError } from "#/lib/form-error";
import { apiKeysQueryOptions } from "#/lib/queries";
import { cn } from "#/lib/utils";
import type { ApiKeySummary } from "#/lib/web-api-client";

const expiryOptions = [
	{ value: "never", label: "Never" },
	{ value: "7", label: "7 days" },
	{ value: "30", label: "30 days" },
	{ value: "90", label: "90 days" },
	{ value: "365", label: "1 year" },
] as const;

type Expiry = (typeof expiryOptions)[number]["value"];

const features = tableFeatures({
	rowSortingFeature,
	sortedRowModel: createSortedRowModel(),
	sortFns: { text: sortFn_text, basic: sortFn_basic },
	columnFilteringFeature,
	globalFilteringFeature,
	filteredRowModel: createFilteredRowModel(),
	filterFns: { includesString: filterFn_includesString },
});

const helper = createColumnHelper<typeof features, ApiKeySummary>();
const EMPTY_KEYS: ApiKeySummary[] = [];

function formatDate(value: string | null) {
	if (!value) return "Never";
	return new Date(value).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function isExpired(expiresAt: string | null) {
	return expiresAt ? new Date(expiresAt).getTime() < Date.now() : false;
}

function SortMark({ sorted }: { sorted: false | "asc" | "desc" }) {
	if (sorted === "asc") return <ArrowUp className="size-3.5" aria-hidden />;
	if (sorted === "desc") return <ArrowDown className="size-3.5" aria-hidden />;
	return <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />;
}

export function ApiKeys() {
	const {
		data: keys,
		isFetching,
		isError,
		error,
		refetch,
	} = useSuspenseQuery(apiKeysQueryOptions);
	const createKey = useCreateApiKey();
	const deleteKey = useDeleteApiKey();
	const deleteState = useRef(deleteKey);
	deleteState.current = deleteKey;
	const [createOpen, setCreateOpen] = useState(false);
	const [secret, setSecret] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [pendingDelete, setPendingDelete] = useState<ApiKeySummary | null>(
		null,
	);
	const [globalFilter, setGlobalFilter] = useState("");
	const form = useForm({
		defaultValues: { name: "", expiry: "never" as Expiry },
		onSubmit: async ({ value }) => {
			try {
				const result = await createKey.mutateAsync({
					name: value.name.trim(),
					expiresIn:
						value.expiry === "never"
							? null
							: Number(value.expiry) * 60 * 60 * 24,
				});
				setCreateOpen(false);
				form.reset();
				setSecret(result.key);
				toast.success("API key created");
			} catch (cause) {
				toast.error(
					cause instanceof Error ? cause.message : "Could not create API key",
				);
			}
		},
	});

	const columns = useMemo(
		() =>
			helper.columns([
				helper.accessor((row) => row.name ?? "Untitled", {
					id: "name",
					header: "Name",
					sortFn: "text",
					cell: (info) => (
						<span className="font-medium">{info.getValue()}</span>
					),
				}),
				helper.accessor((row) => (row.start ? `${row.start}…` : "ev_…"), {
					id: "start",
					header: "Key",
					sortFn: "text",
					cell: (info) => <code>{info.getValue()}</code>,
				}),
				helper.accessor((row) => new Date(row.createdAt).getTime(), {
					id: "createdAt",
					header: "Created",
					sortFn: "basic",
					enableGlobalFilter: false,
					cell: (info) => formatDate(info.row.original.createdAt),
				}),
				helper.accessor(
					(row) =>
						row.expiresAt ? new Date(row.expiresAt).getTime() : undefined,
					{
						id: "expires",
						header: "Expires",
						sortFn: "basic",
						sortUndefined: "last",
						enableGlobalFilter: false,
						cell: (info) => formatDate(info.row.original.expiresAt),
					},
				),
				helper.accessor(
					(row) =>
						row.lastRequest ? new Date(row.lastRequest).getTime() : undefined,
					{
						id: "lastRequest",
						header: "Last used",
						sortFn: "basic",
						sortUndefined: "last",
						enableGlobalFilter: false,
						cell: (info) =>
							info.row.original.lastRequest
								? formatDate(info.row.original.lastRequest)
								: "Never",
					},
				),
				helper.accessor(
					(row) =>
						isExpired(row.expiresAt)
							? "Expired"
							: row.enabled
								? "Active"
								: "Disabled",
					{
						id: "status",
						header: "Status",
						sortFn: "text",
						enableGlobalFilter: false,
						cell: (info) => {
							const status = info.getValue();
							return (
								<Badge
									variant={
										status === "Expired"
											? "outline"
											: status === "Disabled"
												? "secondary"
												: "default"
									}
								>
									{status}
								</Badge>
							);
						},
					},
				),
				helper.display({
					id: "actions",
					header: "",
					enableSorting: false,
					enableGlobalFilter: false,
					cell: (info) => {
						const key = info.row.original;
						const revoking =
							deleteState.current.isPending &&
							deleteState.current.variables === key.id;
						return (
							<Button
								variant="ghost"
								size="sm"
								className="press text-destructive"
								aria-label={`Revoke ${key.name ?? "this key"}`}
								disabled={revoking}
								onClick={() => setPendingDelete(key)}
							>
								{revoking ? (
									<Spinner data-icon="inline-start" />
								) : (
									<Trash2 data-icon="inline-start" />
								)}
								<span className="sr-only sm:not-sr-only">
									{revoking ? "Revoking…" : "Revoke"}
								</span>
							</Button>
						);
					},
				}),
			]),
		[],
	);

	const table = useTable({
		features,
		columns,
		data: keys.length ? keys : EMPTY_KEYS,
		getRowId: (row) => row.id,
		globalFilterFn: "includesString",
		enableSortingRemoval: true,
		state: { globalFilter },
		onGlobalFilterChange: setGlobalFilter,
		initialState: { sorting: [{ id: "createdAt", desc: true }] },
	});
	const rows = table.getRowModel().rows;
	const hasKeys = keys.length > 0;

	return (
		<>
			<Card className="island-shell">
				<CardHeader>
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div className="min-w-0 sm:flex-1">
							<CardTitle className="flex items-center gap-2">
								API keys
								{isFetching ? (
									<span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
										<Spinner className="size-3" />
										Updating
									</span>
								) : null}
							</CardTitle>
							<CardDescription className="mt-1.5">
								Keys belong to your account. Send them as an{" "}
								<code className="rounded bg-muted px-1 py-0.5 text-xs">
									x-api-key
								</code>{" "}
								header to call the REST API or MCP endpoint.
							</CardDescription>
						</div>
						{hasKeys ? (
							<Button
								className="press self-start sm:self-auto"
								onClick={() => {
									form.reset();
									setCreateOpen(true);
								}}
							>
								<Plus data-icon="inline-start" />
								New key
							</Button>
						) : null}
					</div>
				</CardHeader>
				<CardContent>
					{isError ? (
						<Alert variant="destructive" className="mb-4">
							<AlertTitle>Couldn't refresh API keys</AlertTitle>
							<AlertDescription>
								{error instanceof Error
									? error.message
									: "Showing the last list we loaded."}
							</AlertDescription>
							<Button
								className="mt-3"
								variant="outline"
								onClick={() => void refetch()}
							>
								Try again
							</Button>
						</Alert>
					) : null}
					{hasKeys ? (
						<div className="flex flex-col gap-3">
							<Input
								type="search"
								value={globalFilter}
								onChange={(event) => setGlobalFilter(event.target.value)}
								placeholder="Filter by name or key"
								aria-label="Filter API keys"
							/>
							<div
								className={cn(isFetching && "opacity-70")}
								aria-busy={isFetching}
							>
								<Table>
									<TableHeader>
										{table.getHeaderGroups().map((group) => (
											<TableRow key={group.id} className="hover:bg-transparent">
												{group.headers.map((header) => {
													const sorted = header.column.getIsSorted();
													return (
														<TableHead
															key={header.id}
															aria-sort={
																sorted === "asc"
																	? "ascending"
																	: sorted === "desc"
																		? "descending"
																		: undefined
															}
														>
															{header.isPlaceholder ||
															!header.column.getCanSort() ? (
																header.isPlaceholder ? null : (
																	<table.FlexRender header={header} />
																)
															) : (
																<button
																	type="button"
																	className="inline-flex items-center gap-1"
																	onClick={header.column.getToggleSortingHandler()}
																>
																	<table.FlexRender header={header} />
																	<SortMark sorted={sorted} />
																	<span className="sr-only">
																		{sorted === "asc"
																			? ", sorted ascending"
																			: sorted === "desc"
																				? ", sorted descending"
																				: ", not sorted"}
																	</span>
																</button>
															)}
														</TableHead>
													);
												})}
											</TableRow>
										))}
									</TableHeader>
									<TableBody>
										{rows.length === 0 ? (
											<TableRow>
												<TableCell
													colSpan={columns.length}
													className="py-8 text-center text-muted-foreground"
												>
													No keys match that filter.
												</TableCell>
											</TableRow>
										) : (
											rows.map((row) => (
												<TableRow key={row.id}>
													{row.getAllCells().map((cell) => (
														<TableCell key={cell.id}>
															<table.FlexRender cell={cell} />
														</TableCell>
													))}
												</TableRow>
											))
										)}
									</TableBody>
								</Table>
							</div>
						</div>
					) : (
						<EmptyState
							icon={KeyRound}
							title="No API keys yet"
							description="Create a key to authenticate scripts, MCP clients, and anything you build on top of Eventual."
							action={
								<Button
									onClick={() => {
										form.reset();
										setCreateOpen(true);
									}}
								>
									<Plus data-icon="inline-start" />
									New key
								</Button>
							}
						/>
					)}
				</CardContent>
			</Card>

			<Dialog
				open={createOpen}
				onOpenChange={(open) => {
					setCreateOpen(open);
					if (!open) form.reset();
				}}
			>
				<DialogContent>
					<form
						className="flex flex-col gap-4"
						onSubmit={(event) => {
							event.preventDefault();
							event.stopPropagation();
							void form.handleSubmit();
						}}
					>
						<DialogHeader>
							<DialogTitle>Create API key</DialogTitle>
							<DialogDescription>
								The secret is shown once. Store it somewhere safe.
							</DialogDescription>
						</DialogHeader>
						<FieldGroup>
							<form.Field
								name="name"
								validators={{
									onBlur: z
										.string()
										.trim()
										.min(1, "Give this key a name")
										.max(64, "Use 64 characters or fewer"),
									onSubmit: z
										.string()
										.trim()
										.min(1, "Give this key a name")
										.max(64, "Use 64 characters or fewer"),
								}}
							>
								{(field) => {
									const message = field.state.meta.isTouched
										? fieldError(field.state.meta.errors)
										: undefined;
									return (
										<Field data-invalid={message ? true : undefined}>
											<FieldLabel htmlFor={field.name}>Name</FieldLabel>
											<Input
												id={field.name}
												name={field.name}
												value={field.state.value}
												maxLength={64}
												placeholder="Claude, scripts, CI"
												aria-invalid={message ? true : undefined}
												onBlur={field.handleBlur}
												onChange={(event) =>
													field.handleChange(event.target.value)
												}
											/>
											<FieldDescription>
												A label so you can tell keys apart later.
											</FieldDescription>
											{message ? <FieldError>{message}</FieldError> : null}
										</Field>
									);
								}}
							</form.Field>
							<form.Field name="expiry">
								{(field) => (
									<Field>
										<FieldLabel>Expires</FieldLabel>
										<ToggleGroup
											type="single"
											variant="outline"
											spacing={2}
											rovingFocus={false}
											value={field.state.value}
											onValueChange={(value) => {
												if (value) field.handleChange(value as Expiry);
											}}
											className="flex flex-wrap"
											aria-label="Key expiration"
										>
											{expiryOptions.map((option) => (
												<ToggleGroupItem
													key={option.value}
													value={option.value}
												>
													{option.label}
												</ToggleGroupItem>
											))}
										</ToggleGroup>
									</Field>
								)}
							</form.Field>
						</FieldGroup>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setCreateOpen(false)}
							>
								Cancel
							</Button>
							<form.Subscribe selector={(state) => state.isSubmitting}>
								{(creating) => (
									<Button
										type="submit"
										disabled={creating || createKey.isPending}
									>
										{creating || createKey.isPending ? (
											<Spinner data-icon="inline-start" />
										) : null}
										{creating || createKey.isPending
											? "Creating…"
											: "Create key"}
									</Button>
								)}
							</form.Subscribe>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog
				open={secret !== null}
				onOpenChange={(open) => {
					if (!open) {
						setSecret(null);
						setCopied(false);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Copy your API key</DialogTitle>
						<DialogDescription>
							This is the only time the full key is shown.
						</DialogDescription>
					</DialogHeader>
					<Alert>
						<AlertTitle>Store this now</AlertTitle>
						<AlertDescription>
							We cannot show the secret again. Revoke the key if you lose it.
						</AlertDescription>
					</Alert>
					<InputGroup>
						<InputGroupInput
							readOnly
							value={secret ?? ""}
							aria-label="New API key"
						/>
						<InputGroupAddon align="inline-end">
							<InputGroupButton
								size="icon-xs"
								aria-label={copied ? "Copied" : "Copy API key"}
								onClick={async () => {
									if (!secret) return;
									if (!(await copyToClipboard(secret, "API key"))) return;
									setCopied(true);
									toast.success("API key copied");
								}}
							>
								{copied ? <Check /> : <Copy />}
							</InputGroupButton>
						</InputGroupAddon>
					</InputGroup>
					<DialogFooter>
						<Button
							onClick={() => {
								setSecret(null);
								setCopied(false);
							}}
						>
							Done
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<AlertDialog
				open={pendingDelete !== null}
				onOpenChange={(open) => {
					if (!open && !deleteKey.isPending) setPendingDelete(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Revoke this key?</AlertDialogTitle>
						<AlertDialogDescription>
							{pendingDelete?.name ?? "This key"} will stop working immediately.
							Anything still using it will get a 401.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleteKey.isPending}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deleteKey.isPending}
							onClick={(event) => {
								event.preventDefault();
								if (!pendingDelete) return;
								void deleteKey
									.mutateAsync(pendingDelete.id)
									.then(() => {
										toast.success("API key revoked");
										setPendingDelete(null);
									})
									.catch((cause: unknown) => {
										toast.error(
											cause instanceof Error
												? cause.message
												: "Could not revoke API key",
										);
									});
							}}
						>
							{deleteKey.isPending ? (
								<Spinner data-icon="inline-start" />
							) : null}
							{deleteKey.isPending ? "Revoking…" : "Revoke key"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
