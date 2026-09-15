import type { ReactNode } from "react";

import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "#/components/ui/combobox";

export type Option = {
	value: string;
	/** Shown in the input once picked, and what typing filters against. */
	label: string;
	/** Quiet trailing detail — a currency's full name, a member's email. */
	hint?: string;
	media?: ReactNode;
};

/**
 * A searchable single-select over a flat option list.
 *
 * The combobox primitive selects whole item objects; almost everything here
 * stores an id or a currency code, so the mapping lives once, in here, rather
 * than at every call site.
 *
 * Reach for this over `Select` when the list is long enough that typing beats
 * scrolling — currencies, members of a large group, every group you are in.
 */
export function OptionCombobox({
	id,
	options,
	value,
	onValueChange,
	placeholder,
	emptyLabel = "Nothing matches.",
	disabled,
	className,
}: {
	id?: string;
	options: Option[];
	value: string;
	onValueChange: (value: string) => void;
	placeholder?: string;
	emptyLabel?: string;
	disabled?: boolean;
	className?: string;
}) {
	const selected = options.find((option) => option.value === value) ?? null;

	return (
		<Combobox
			items={options}
			value={selected}
			onValueChange={(option: Option | null) => {
				if (option) onValueChange(option.value);
			}}
			itemToStringLabel={(option: Option) => option.label}
			isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
			disabled={disabled}
		>
			<ComboboxInput
				id={id}
				placeholder={placeholder}
				disabled={disabled}
				className={className}
			/>
			<ComboboxContent>
				<ComboboxEmpty>{emptyLabel}</ComboboxEmpty>
				<ComboboxList>
					{(option: Option) => (
						<ComboboxItem key={option.value} value={option}>
							{option.media}
							<span className="truncate">{option.label}</span>
							{option.hint ? (
								<span className="ml-auto truncate text-xs text-muted-foreground">
									{option.hint}
								</span>
							) : null}
						</ComboboxItem>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
}
