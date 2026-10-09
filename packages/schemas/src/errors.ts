import { z } from "zod";

export const errorCodes = [
	"UNAUTHENTICATED",
	"FORBIDDEN",
	"NOT_FOUND",
	"VALIDATION",
	"EXPENSE_LOCKED",
	"CONFLICT",
	"INTERNAL",
] as const;
export type ErrorCode = (typeof errorCodes)[number];

export const errorStatus: Record<ErrorCode, number> = {
	UNAUTHENTICATED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	VALIDATION: 422,
	EXPENSE_LOCKED: 409,
	CONFLICT: 409,
	INTERNAL: 500,
};

/** Every non-2xx JSON response. */
export const apiErrorSchema = z.object({
	error: z.object({
		code: z.enum(errorCodes),
		message: z.string(),
		/** Extra context. Validation errors list the failing fields. */
		details: z.unknown().optional(),
	}),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>["error"];
