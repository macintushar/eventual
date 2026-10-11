import type { ErrorCode } from "@eventual/schemas/errors";

export { type ErrorCode, errorStatus } from "@eventual/schemas/errors";

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
