import { useRouter } from "@tanstack/react-router";
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
	DialogTrigger,
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
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "#/components/ui/item";
import { Spinner } from "#/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { copyToClipboard } from "#/lib/clipboard";
import {
	type ApiKeySummary,
	createApiKeyFn,
	deleteApiKeyFn,
} from "#/server/fn/api-keys";

const expiryOptions = [
	{ value: "never", label: "Never" },
	{ value: "7", label: "7 days" },
	{ value: "30", label: "30 days" },
	{ value: "90", label: "90 days" },
	{ value: "365", label: "1 year" },
] as const;

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

export function ApiKeys({ initialKeys }: { initialKeys: ApiKeySummary[] }) {
	const router = useRouter();
	const [createOpen, setCreateOpen] = useState(false);
	const [name, setName] = useState("");
	const [expiry, setExpiry] = useState("never");
	const [nameError, setNameError] = useState("");
	const [creating, setCreating] = useState(false);
	const [secret, setSecret] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [pendingDelete, setPendingDelete] = useState<ApiKeySummary | null>(
		null,
	);
	const [deleting, setDeleting] = useState(false);

	const resetCreate = () => {
		setName("");
		setExpiry("never");
		setNameError("");
	};

	return (
		<>
			<Card className="island-shell">
				<CardHeader>
					{/*
					 * `CardAction` pins the button to a second grid column, which on a
					 * phone squeezes the description into a four-line ribbon. A flex
					 * row that wraps puts the button under the text instead.
					 */}
					<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
						<div className="min-w-0 sm:flex-1">
							<CardTitle>API keys</CardTitle>
							<CardDescription className="mt-1.5">
								Keys belong to your account. Send them as an{" "}
								<code className="rounded bg-muted px-1 py-0.5 text-xs">
									x-api-key
								</code>{" "}
								header to call the REST API or MCP endpoint.
							</CardDescription>
						</div>
						<Dialog
							open={createOpen}
							onOpenChange={(open) => {
								setCreateOpen(open);
								if (!open) resetCreate();
							}}
						>
							<DialogTrigger asChild>
								<Button className="press self-start">
									<Plus data-icon="inline-start" />
									New key
								</Button>
							</DialogTrigger>
							<DialogContent>
								<form
									className="flex flex-col gap-4"
									onSubmit={async (event) => {
										event.preventDefault();
										const trimmed = name.trim();
										if (trimmed.length < 1) {
											setNameError("Give this key a name");
											return;
										}
										setCreating(true);
										try {
											const result = await createApiKeyFn({
												data: {
													name: trimmed,
													expiresIn:
														expiry === "never"
															? null
															: Number(expiry) * 60 * 60 * 24,
												},
											});
											setCreateOpen(false);
											resetCreate();
											setSecret(result.key);
											toast.success("API key created");
											await router.invalidate();
										} catch (error) {
											toast.error(
												error instanceof Error
													? error.message
													: "Could not create API key",
											);
										} finally {
											setCreating(false);
										}
									}}
								>
									<DialogHeader>
										<DialogTitle>Create API key</DialogTitle>
										<DialogDescription>
											The secret is shown once. Store it somewhere safe.
										</DialogDescription>
									</DialogHeader>
									<FieldGroup>
										<Field data-invalid={nameError ? true : undefined}>
											<FieldLabel htmlFor="api-key-name">Name</FieldLabel>
											<Input
												id="api-key-name"
												value={name}
												maxLength={64}
												placeholder="Claude, scripts, CI"
												aria-invalid={nameError ? true : undefined}
												onChange={(event) => {
													setName(event.target.value);
													if (nameError) setNameError("");
												}}
											/>
											<FieldDescription>
												A label so you can tell keys apart later.
											</FieldDescription>
											{nameError ? <FieldError>{nameError}</FieldError> : null}
										</Field>
										<Field>
											<FieldLabel>Expires</FieldLabel>
											<ToggleGroup
												type="single"
												variant="outline"
												spacing={2}
												rovingFocus={false}
												value={expiry}
												onValueChange={(value) => {
													if (value) setExpiry(value);
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
									</FieldGroup>
									<DialogFooter>
										<Button
											type="button"
											variant="outline"
											onClick={() => setCreateOpen(false)}
										>
											Cancel
										</Button>
										<Button type="submit" disabled={creating}>
											{creating ? <Spinner data-icon="inline-start" /> : null}
											{creating ? "Creating…" : "Create key"}
										</Button>
									</DialogFooter>
								</form>
							</DialogContent>
						</Dialog>
					</div>
				</CardHeader>
				<CardContent>
					{initialKeys.length === 0 ? (
						<EmptyState
							icon={KeyRound}
							title="No API keys yet"
							description="Create a key to authenticate scripts, MCP clients, and anything you build on top of Eventual."
							action={
								<Button onClick={() => setCreateOpen(true)}>
									<Plus data-icon="inline-start" />
									New key
								</Button>
							}
						/>
					) : (
						<ItemGroup>
							{initialKeys.map((key) => {
								const expired = isExpired(key.expiresAt);
								return (
									<Item key={key.id} size="sm" className="flex-nowrap">
										<ItemContent className="min-w-0">
											<ItemTitle className="w-full min-w-0">
												<span className="truncate">
													{key.name ?? "Untitled"}
												</span>
												{expired ? (
													<Badge variant="outline" className="shrink-0">
														Expired
													</Badge>
												) : null}
												{!key.enabled ? (
													<Badge variant="secondary" className="shrink-0">
														Disabled
													</Badge>
												) : null}
											</ItemTitle>
											<ItemDescription>
												<code>{key.start ? `${key.start}…` : "ev_…"}</code> ·
												expires {formatDate(key.expiresAt)} · last used{" "}
												{key.lastRequest
													? formatDate(key.lastRequest)
													: "never"}
											</ItemDescription>
										</ItemContent>
										<ItemActions className="shrink-0">
											<Button
												variant="ghost"
												size="sm"
												className="press text-destructive"
												aria-label={`Revoke ${key.name ?? "this key"}`}
												onClick={() => setPendingDelete(key)}
											>
												<Trash2 data-icon="inline-start" />
												<span className="sr-only sm:not-sr-only">Revoke</span>
											</Button>
										</ItemActions>
									</Item>
								);
							})}
						</ItemGroup>
					)}
				</CardContent>
			</Card>

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
					if (!open && !deleting) setPendingDelete(null);
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
						<AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deleting}
							onClick={async (event) => {
								event.preventDefault();
								if (!pendingDelete) return;
								setDeleting(true);
								try {
									await deleteApiKeyFn({
										data: { keyId: pendingDelete.id },
									});
									toast.success("API key revoked");
									setPendingDelete(null);
									await router.invalidate();
								} catch (error) {
									toast.error(
										error instanceof Error
											? error.message
											: "Could not revoke API key",
									);
								} finally {
									setDeleting(false);
								}
							}}
						>
							{deleting ? <Spinner data-icon="inline-start" /> : null}
							{deleting ? "Revoking…" : "Revoke key"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
