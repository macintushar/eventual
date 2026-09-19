import { z } from "zod";
import { createExpenseSchema, groupIdSchema, idSchema } from "./index";

export const recurrenceSchema = z.enum([
	"daily",
	"weekly",
	"monthly",
	"yearly",
]);
export const scheduleReminderSchema = groupIdSchema.extend({
	userId: idSchema,
	dueAt: z.coerce.date(),
});
export const listRemindersSchema = groupIdSchema;
export const reminderPreferencesSchema = z.object({
	emailReminders: z.boolean(),
});
export const getReminderPreferencesSchema = z.object({});
export const recurringExpensePayloadSchema = createExpenseSchema.omit({
	groupId: true,
	date: true,
});
export const createRecurringExpenseSchema = groupIdSchema.extend({
	recurrence: recurrenceSchema,
	nextRunAt: z.coerce.date(),
	payload: recurringExpensePayloadSchema,
	active: z.boolean().default(true),
});
export const recurringExpenseIdSchema = z.object({ templateId: idSchema });
export const listRecurringExpensesSchema = groupIdSchema;
export const updateRecurringExpenseSchema = createRecurringExpenseSchema
	.omit({ groupId: true })
	.partial()
	.extend({ templateId: idSchema });
export const deleteRecurringExpenseSchema = recurringExpenseIdSchema;
