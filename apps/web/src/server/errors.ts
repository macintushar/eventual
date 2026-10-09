export type ErrorCode =
	| "UNAUTHENTICATED"
	| "FORBIDDEN"
	| "NOT_FOUND"
	| "VALIDATION"
	| "EXPENSE_LOCKED"
	| "CONFLICT"
	| "INTERNAL";

export const errorStatus: Record<ErrorCode, number> = {
	UNAUTHENTICATED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	VALIDATION: 422,
	EXPENSE_LOCKED: 409,
	CONFLICT: 409,
	INTERNAL: 500,
};

export class AppError extends Error {
	constructor(
		public code: ErrorCode,
		message: string,
		public details?: unknown,
	) {
		super(message);
		this.name = "AppError";
	}
}
