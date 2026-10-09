import { OptionCombobox } from "#/components/option-combobox";
import { currencies, currencySymbol } from "#/lib/currencies";

const options = currencies.map(({ code, name }) => ({
	value: code,
	label: `${currencySymbol(code)} ${code}`,
	hint: name,
}));

/**
 * Currency picker. There are more than twenty, and people know the code they
 * want, so this is a combobox: typing "yen" or "JPY" beats scrolling a menu.
 */
export function CurrencySelect({
	id,
	value,
	onValueChange,
}: {
	id: string;
	value: string;
	onValueChange: (value: string) => void;
}) {
	return (
		<OptionCombobox
			id={id}
			options={options}
			value={value}
			onValueChange={onValueChange}
			placeholder="Choose currency"
			emptyLabel="No currency matches."
		/>
	);
}
