import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";

import {
	apiKeysQueryOptions,
	dashboardQueryOptions,
	sessionQueryOptions,
} from "#/lib/queries";
import {
	createApiKeyFn,
	deleteApiKeyFn,
	mutateFn,
	updateProfileFn,
} from "#/lib/web-api-client";
import type { MutationInput } from "#/server/operations";

function messageFrom(error: unknown, fallback: string) {
	return error instanceof Error ? error.message : fallback;
}

function idOf(input: object, key: string) {
	const value = (input as Record<string, unknown>)[key];
	return typeof value === "string" ? value : undefined;
}

/** Drop every cached read the write could have changed. Prefixes cover detail and list queries. */
export async function invalidateForMutation(
	queryClient: ReturnType<typeof useQueryClient>,
	data: MutationInput,
) {
	const input = data.input;
	const groupId = idOf(input, "groupId");
	const expenseId = idOf(input, "expenseId");
	const name = data.action;
	const writesApp =
		name.startsWith("group.") ||
		name.startsWith("member.") ||
		name.startsWith("invitation.") ||
		name.startsWith("expense.") ||
		name.startsWith("share.") ||
		name.startsWith("settlement.") ||
		name.startsWith("category.") ||
		name.startsWith("reminder.") ||
		name.startsWith("recurring.");

	const keys: Array<readonly unknown[]> = [];
	if (writesApp) {
		keys.push(["dashboard"], ["composer"], ["activity"]);
		keys.push(groupId ? ["group", groupId] : ["group"]);
	}
	if (expenseId) keys.push(["expense", expenseId]);
	if (name.startsWith("invitation.")) keys.push(["invitation"]);

	await Promise.all(
		keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
	);
}

/**
 * One mutation for every app write that goes through `mutateFn`.
 * Success refreshes the cached reads; the caller decides the success toast
 * because several writes share one user-facing message.
 */
export function useAppMutation() {
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationFn: (data: MutationInput) => mutateFn({ data }),
		onSuccess: async (_result, data) => {
			await invalidateForMutation(queryClient, data);
		},
	});

	const run = async (data: MutationInput, message: string) => {
		try {
			await mutation.mutateAsync(data);
			toast.success(message);
			return true;
		} catch (error) {
			toast.error(messageFrom(error, "Action failed"));
			return false;
		}
	};

	const execute = async (data: MutationInput) => {
		try {
			const result = await mutation.mutateAsync(data);
			return { ok: true as const, result };
		} catch (error) {
			toast.error(messageFrom(error, "Action failed"));
			return { ok: false as const, result: null };
		}
	};

	return {
		run,
		execute,
		mutateAsync: mutation.mutateAsync,
		isPending: mutation.isPending,
		isError: mutation.isError,
		isSuccess: mutation.isSuccess,
		isIdle: mutation.isIdle,
		error: mutation.error,
		status: mutation.status,
		reset: mutation.reset,
	};
}

export function useUpdateProfile() {
	const queryClient = useQueryClient();
	const router = useRouter();
	return useMutation({
		mutationFn: (data: Parameters<typeof updateProfileFn>[0]["data"]) =>
			updateProfileFn({ data }),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: sessionQueryOptions.queryKey,
				}),
				queryClient.invalidateQueries({
					queryKey: dashboardQueryOptions.queryKey,
				}),
			]);
			// The shell reads the user from the route guard, not the query.
			await router.invalidate();
		},
	});
}

export function useCreateApiKey() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: { name: string; expiresIn: number | null }) =>
			createApiKeyFn({ data }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: apiKeysQueryOptions.queryKey,
			});
		},
	});
}

export function useDeleteApiKey() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (keyId: string) => deleteApiKeyFn({ data: { keyId } }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: apiKeysQueryOptions.queryKey,
			});
		},
	});
}
