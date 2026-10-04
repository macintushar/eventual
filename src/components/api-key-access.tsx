import { Settings2, ShieldAlert, ShieldCheck, Wallet } from "lucide-react";
import type { ComponentType } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Checkbox } from "#/components/ui/checkbox";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
	FieldLegend,
	FieldSet,
	FieldTitle,
} from "#/components/ui/field";
import { RadioGroup, RadioGroupItem } from "#/components/ui/radio-group";
import {
	type ApiKeyMode,
	FULL_ACCESS_MAX_DAYS,
	keyScopeResources,
	type PermissionResource,
	type Permissions,
	statement,
	transactionalKeyPermissions,
} from "#/lib/permissions";
import { cn } from "#/lib/utils";

export type KeyAccessMode = Exclude<ApiKeyMode, "legacy">;

const modes: {
	value: KeyAccessMode;
	label: string;
	icon: ComponentType<{ className?: string }>;
	description: string;
	hint?: string;
	danger?: boolean;
}[] = [
	{
		value: "transactional",
		label: "Transactional",
		icon: Wallet,
		description:
			"Read groups, record and edit expenses, settle up. Can't delete anything or change who's in a group.",
		hint: "Recommended",
	},
	{
		value: "management",
		label: "Full management",
		icon: ShieldCheck,
		description:
			"Everything you can do in the app, including creating and deleting groups and managing members.",
	},
	{
		value: "custom",
		label: "Custom",
		icon: Settings2,
		description: "Pick exactly which actions this key can take.",
	},
	{
		value: "full",
		label: "Full account access",
		icon: ShieldAlert,
		description:
			"Acts as you across the app, including your profile and group settings. Only for tools you fully trust.",
		hint: "Dangerous",
		danger: true,
	},
];

export const keyModeLabels: Record<ApiKeyMode, string> = {
	transactional: "Transactional",
	management: "Full management",
	full: "Full account access",
	custom: "Custom",
	legacy: "Legacy (unscoped)",
};

const actionLabels: Record<string, string> = {
	read: "View",
	create: "Create",
	update: "Edit",
	delete: "Delete",
	role: "Change roles",
	cancel: "Revoke",
	accept: "Accept",
};

/** A copy of the transactional preset, the starting point for custom keys. */
export function defaultCustomPermissions(): Permissions {
	return Object.fromEntries(
		Object.entries(transactionalKeyPermissions).map(([resource, actions]) => [
			resource,
			[...actions],
		]),
	);
}

export function KeyAccessPicker({
	mode,
	permissions,
	onModeChange,
	onPermissionsChange,
	invalid,
}: {
	mode: KeyAccessMode;
	permissions: Permissions;
	onModeChange: (mode: KeyAccessMode) => void;
	onPermissionsChange: (permissions: Permissions) => void;
	invalid?: boolean;
}) {
	return (
		<FieldSet className="gap-3">
			<FieldLegend variant="label">Access</FieldLegend>
			<RadioGroup
				value={mode}
				onValueChange={(value) => onModeChange(value as KeyAccessMode)}
				className="gap-2"
			>
				{modes.map((option) => (
					<FieldLabel
						key={option.value}
						htmlFor={`key-mode-${option.value}`}
						className={cn(
							option.danger &&
								"has-data-[state=checked]:border-destructive has-data-[state=checked]:bg-destructive/5 dark:has-data-[state=checked]:bg-destructive/10",
						)}
					>
						<Field orientation="horizontal" className="!p-3">
							<option.icon
								className={cn(
									"mt-0.5 size-4 shrink-0 text-muted-foreground",
									option.danger && "text-destructive",
								)}
							/>
							<FieldContent>
								<FieldTitle>
									{option.label}
									{option.hint ? (
										<Badge
											variant={option.danger ? "destructive" : "secondary"}
										>
											{option.hint}
										</Badge>
									) : null}
								</FieldTitle>
								<FieldDescription className="text-pretty">
									{option.description}
								</FieldDescription>
							</FieldContent>
							<RadioGroupItem
								value={option.value}
								id={`key-mode-${option.value}`}
							/>
						</Field>
					</FieldLabel>
				))}
			</RadioGroup>
			{mode === "custom" ? (
				<CustomScopes
					permissions={permissions}
					onChange={onPermissionsChange}
					invalid={invalid}
				/>
			) : null}
			{mode === "full" ? (
				<Alert variant="destructive" role="alert">
					<ShieldAlert />
					<AlertTitle>This key can act as you</AlertTitle>
					<AlertDescription className="text-pretty">
						<p>
							Anyone holding it can do almost anything you can, in every group
							you belong to: delete groups, remove people, change roles and edit
							your profile. Treat it like your password. If it leaks, revoke it
							immediately.
						</p>
						<p>
							Only give it to a tool you fully trust, and keep it out of code,
							chat and shared files. It still can't change your password, email
							or sessions, delete your account or manage API keys, and it
							expires within {FULL_ACCESS_MAX_DAYS} days.
						</p>
					</AlertDescription>
				</Alert>
			) : null}
			<FieldDescription>
				A key can never do more than your role allows in a group.
			</FieldDescription>
		</FieldSet>
	);
}

function CustomScopes({
	permissions,
	onChange,
	invalid,
}: {
	permissions: Permissions;
	onChange: (permissions: Permissions) => void;
	invalid?: boolean;
}) {
	const toggle = (
		resource: PermissionResource,
		action: string,
		on: boolean,
	) => {
		const current = new Set(permissions[resource] ?? []);
		if (on) current.add(action);
		else current.delete(action);
		const next = { ...permissions };
		if (current.size) next[resource] = [...current];
		else delete next[resource];
		onChange(next);
	};

	return (
		<div
			className={cn(
				"max-h-72 overflow-y-auto rounded-md border",
				invalid && "border-destructive",
			)}
			aria-invalid={invalid || undefined}
		>
			<ul className="divide-y">
				{keyScopeResources.map(({ resource, label, description }) => {
					const granted = permissions[resource] ?? [];
					return (
						<li
							key={resource}
							className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between"
						>
							<div className="min-w-0">
								<p className="text-sm font-medium">{label}</p>
								<p className="text-xs text-muted-foreground text-pretty">
									{description}
								</p>
							</div>
							<fieldset
								className="flex shrink-0 flex-wrap gap-x-3 gap-y-1.5 sm:max-w-[13rem] sm:justify-end"
								aria-label={`${label} permissions`}
							>
								{statement[resource].map((action) => {
									const id = `scope-${resource}-${action}`;
									return (
										<label
											key={action}
											htmlFor={id}
											className="inline-flex cursor-pointer items-center gap-1.5 text-xs"
										>
											<Checkbox
												id={id}
												checked={granted.includes(action)}
												onCheckedChange={(checked) =>
													toggle(resource, action, checked === true)
												}
											/>
											{actionLabels[action] ?? action}
										</label>
									);
								})}
							</fieldset>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
