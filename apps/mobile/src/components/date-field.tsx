import { formatLongDate } from "@eventual/schemas/dates";
import {
	Host as ComposeHost,
	DatePickerDialog,
} from "@expo/ui/jetpack-compose";
import { DatePicker, Host } from "@expo/ui/swift-ui";
import { datePickerStyle, tint } from "@expo/ui/swift-ui/modifiers";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { fonts, useTheme } from "../theme";

/**
 * A date in the same field frame as the others. iOS shows the system's
 * compact picker, which carries the date and opens Apple's calendar;
 * Android shows the date and opens the Material dialog.
 */
export function DateField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: Date;
	onChange: (date: Date) => void;
}) {
	const t = useTheme();
	const [open, setOpen] = useState(false);
	return (
		<View style={{ gap: 8 }}>
			<Text style={{ fontFamily: fonts.medium, fontSize: 15, color: t.ink }}>
				{label}
			</Text>
			{Platform.OS === "ios" ? (
				<View
					style={{
						minHeight: 52,
						borderRadius: 14,
						borderWidth: 1,
						borderColor: t.input,
						backgroundColor: t.paper,
						paddingHorizontal: 16,
						flexDirection: "row",
						alignItems: "center",
						justifyContent: "flex-start",
					}}
				>
					<Host matchContents>
						<DatePicker
							selection={value}
							displayedComponents={["date"]}
							range={{ end: new Date() }}
							onDateChange={onChange}
							modifiers={[datePickerStyle("compact"), tint(t.ink)]}
						/>
					</Host>
				</View>
			) : (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={`${label}: ${formatLongDate(value)}`}
					onPress={() => setOpen(true)}
					style={{
						minHeight: 52,
						borderRadius: 14,
						borderWidth: 1,
						borderColor: t.input,
						backgroundColor: t.paper,
						paddingHorizontal: 16,
						justifyContent: "center",
					}}
				>
					<Text style={{ fontFamily: fonts.body, fontSize: 17, color: t.ink }}>
						{formatLongDate(value)}
					</Text>
					{open ? (
						<ComposeHost>
							<DatePickerDialog
								initialDate={value.toISOString()}
								selectableDates={{ end: new Date() }}
								onDateSelected={(date) => {
									setOpen(false);
									onChange(date);
								}}
								onDismissRequest={() => setOpen(false)}
							/>
						</ComposeHost>
					) : null}
				</Pressable>
			)}
		</View>
	);
}
