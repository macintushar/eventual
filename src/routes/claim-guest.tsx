import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { GuestClaim } from "#/components/guest-claim";

export const Route = createFileRoute("/claim-guest")({
	validateSearch: z.object({ email: z.string().optional() }),
	head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
	component: GuestClaim,
});
