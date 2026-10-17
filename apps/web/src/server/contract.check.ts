/**
 * Compile-time proof that every endpoint returns what `@eventual/schemas`
 * says it does. Nothing here runs; `tsc` fails with the offending endpoint
 * names when a handler's JSON and its declared output schema drift apart in
 * either direction — a field the schema lacks, or one the server stopped
 * sending.
 */
import type {
	AppEndpointName,
	EndpointFor,
	OperationName,
} from "@eventual/schemas/contract";
import type { z } from "zod";
import type { handlers } from "#/server/operations";
import type * as webApi from "#/server/web-api";

/** What `JSON.stringify` makes of a value's type. */
type Jsonify<T> = 0 extends 1 & T
	? T
	: T extends Date
		? string
		: T extends string | number | boolean | null | undefined
			? T
			: T extends readonly (infer Item)[]
				? Jsonify<Item>[]
				: T extends object
					? { [Key in keyof T]: Jsonify<T[Key]> }
					: T;

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type Declared<Name extends OperationName | AppEndpointName> = z.input<
	EndpointFor<Name>["output"]
>;
type Returned<Fn> = Fn extends (...args: never[]) => infer Result
	? Jsonify<Awaited<Result>>
	: never;

/**
 * Where the schema is deliberately wider than the server's type: built-in
 * category names and keywords are a long literal union that clients should
 * treat as plain strings. These only need to fit inside the schema.
 */
type Widened = "category.suggest";

type OperationDrift = {
	[Name in OperationName]: Name extends Widened
		? [Returned<(typeof handlers)[Name]>] extends [Declared<Name>]
			? never
			: Name
		: Same<Returned<(typeof handlers)[Name]>, Declared<Name>> extends true
			? never
			: Name;
}[OperationName];

const appHandlers = {
	"push.device.register": null as unknown as typeof webApi.registerPushDevice,
	"push.device.list": null as unknown as typeof webApi.listPushDevices,
	"push.device.delete": null as unknown as typeof webApi.deletePushDevice,
	"push.preferences.get": null as unknown as typeof webApi.getPushPreferences,
	"push.preferences.update":
		null as unknown as typeof webApi.updatePushPreferences,
	"site.get": null as unknown as typeof webApi.siteInfo,
	"legal.get": null as unknown as typeof webApi.legalInfo,
	"session.get": null as unknown as typeof webApi.session,
	"verification.pending": null as unknown as typeof webApi.pendingVerification,
	"verification.send": null as unknown as typeof webApi.sendPendingVerification,
	"app.dashboard": null as unknown as typeof webApi.dashboard,
	"app.composer": null as unknown as typeof webApi.composer,
	"app.groupDirectory": null as unknown as typeof webApi.groupDirectory,
	"app.groupContext": null as unknown as typeof webApi.groupContext,
	"app.groupSummary": null as unknown as typeof webApi.groupSummary,
	"app.groupSettings": null as unknown as typeof webApi.groupSettings,
	"app.groupPage": null as unknown as typeof webApi.groupPage,
	"profile.update": null as unknown as typeof webApi.profile,
	"apiKey.list": null as unknown as typeof webApi.listApiKeys,
	"apiKey.create": null as unknown as typeof webApi.createApiKey,
	"apiKey.delete": null as unknown as typeof webApi.deleteApiKey,
};
/** `health` is a literal in `http.ts`, not a handler. */
type CheckedAppEndpoint = Exclude<AppEndpointName, "health">;
type AppDrift = {
	[Name in CheckedAppEndpoint]: Same<
		Returned<(typeof appHandlers)[Name]>,
		Declared<Name>
	> extends true
		? never
		: Name;
}[CheckedAppEndpoint];

/** On failure, the error lists every endpoint whose schema has drifted. */
export const contractMatchesHandlers: [OperationDrift | AppDrift] extends [
	never,
]
	? true
	: `drifted: ${OperationDrift | AppDrift}` = true;
export type { appHandlers };
