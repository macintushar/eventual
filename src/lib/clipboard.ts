import { toast } from "sonner";

/**
 * Copies text and reports failure as a toast, returning whether it worked.
 *
 * `navigator.clipboard` is absent on insecure origins and `writeText` rejects
 * when the permission is denied or the call falls outside a user gesture, so a
 * copy button that only flips its icon can report success while handing back
 * nothing. That matters most for the API key, which is shown exactly once.
 *
 * Success is left to the caller: some buttons say so with a toast, others just
 * swap in a tick.
 */
export async function copyToClipboard(value: string, label: string) {
	try {
		await navigator.clipboard.writeText(value);
		return true;
	} catch {
		toast.error("Copy failed", {
			description: `The ${label} could not be copied. Select it and copy it manually.`,
		});
		return false;
	}
}
