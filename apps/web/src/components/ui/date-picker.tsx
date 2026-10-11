import { CalendarIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { Calendar } from "#/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import { atNoon, formatLongDate } from "#/lib/dates";
import { cn } from "#/lib/utils";

/**
 * A single date, chosen from a calendar. The trigger reads as an input rather
 * than a button so it sits level with the fields around it, and the popover
 * closes on pick because there is nothing else to do in there.
 *
 * Dates here are days, not instants: the value is always noon local time, so a
 * timezone shift can never roll an expense onto the day before.
 */
export function DatePicker({
	id,
	value,
	onValueChange,
	placeholder = "Pick a date",
	disabled,
	className,
	...props
}: {
	id?: string;
	value: Date | undefined;
	onValueChange: (value: Date) => void;
	placeholder?: string;
	disabled?: React.ComponentProps<typeof Calendar>["disabled"];
	className?: string;
} & Pick<React.ComponentProps<typeof Calendar>, "startMonth" | "endMonth">) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					id={id}
					type="button"
					variant="outline"
					data-empty={!value}
					className={cn(
						"w-full justify-start border-input font-normal data-[empty=true]:text-muted-foreground",
						className,
					)}
				>
					<CalendarIcon data-icon="inline-start" />
					{value ? formatLongDate(value) : placeholder}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					mode="single"
					autoFocus
					selected={value}
					defaultMonth={value}
					disabled={disabled}
					onSelect={(next) => {
						if (!next) return;
						onValueChange(atNoon(next));
						setOpen(false);
					}}
					{...props}
				/>
			</PopoverContent>
		</Popover>
	);
}
