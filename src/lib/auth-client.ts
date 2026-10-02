import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { getAppLogger } from "#/lib/logging";

export const authClient = createAuthClient({
	fetchOptions: {
		onRequest: () => {
			getAppLogger("auth-client").debug("Authentication request started");
		},
		onSuccess: () => {
			getAppLogger("auth-client").info("Authentication request completed");
		},
		onError: (context) => {
			getAppLogger("auth-client").warning("Authentication request rejected", {
				status: context.response.status,
			});
		},
	},
	plugins: [organizationClient()],
});
