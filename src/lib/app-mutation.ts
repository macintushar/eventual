import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { invalidateForMutation } from "#/lib/mutation-invalidation";
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

export { invalidateForMutation } from "#/lib/mutation-invalidation";

function messageFrom(error: unknown, fallback: string) {
	return error instanceof Error ? error.message : fallback;
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
		onSuccess: async (result, data) => {
			await invalidateForMutation(queryClient, data, result);
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
			return { ok: false as const, result: null, error };
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
		onSuccess: async (saved) => {
			// The response is the saved profile, so write it straight into the
			// session instead of refetching it — that would resend the photo
			// the browser just uploaded.
			queryClient.setQueryData(sessionQueryOptions.queryKey, (current) =>
				current ? { ...current, user: { ...current.user, ...saved } } : current,
			);
			// Your name and photo also appear on group, composer and activity
			// reads. Mark them stale; only the ones on screen refetch, which from
			// settings is none of them.
			await Promise.all(
				[
					dashboardQueryOptions.queryKey,
					["composer"],
					["groups"],
					["group"],
					["activity"],
				].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
			);
			// The shell reads the user from the route guard's context. Re-running
			// the guard reads the session cache written above, not the network.
			await router.invalidate();
		},
	});
}

export function useCreateApiKey() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: Parameters<typeof createApiKeyFn>[0]["data"]) =>
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
