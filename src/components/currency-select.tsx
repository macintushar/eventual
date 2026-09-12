import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { currencies, currencySymbol } from "#/lib/currencies";

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
		<Select value={value} onValueChange={onValueChange}>
			<SelectTrigger id={id} className="w-full">
				<SelectValue placeholder="Choose currency" />
			</SelectTrigger>
			<SelectContent position="popper">
				<SelectGroup>
					{currencies.map(({ code, name }) => (
						<SelectItem key={code} value={code}>
							{currencySymbol(code)} · {code} — {name}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}
