import { env } from "#/env";

export type PushConfig = {
	APNS_KEY_ID?: string;
	APNS_TEAM_ID?: string;
	APNS_PRIVATE_KEY?: string;
	APNS_BUNDLE_ID?: string;
	APNS_ENVIRONMENT?: "sandbox" | "production";
	FCM_PROJECT_ID?: string;
	FCM_SERVICE_ACCOUNT?: string;
};

export function pushPlatforms(config: PushConfig = env) {
	return {
		ios: Boolean(
			config.APNS_KEY_ID &&
				config.APNS_TEAM_ID &&
				config.APNS_PRIVATE_KEY &&
				config.APNS_BUNDLE_ID &&
				config.APNS_ENVIRONMENT,
		),
		android: Boolean(config.FCM_PROJECT_ID && config.FCM_SERVICE_ACCOUNT),
	};
}

export function pushCapability(config: PushConfig = env): {
	available: boolean;
	via: "direct" | "none";
} {
	const platforms = pushPlatforms(config);
	const available = platforms.ios || platforms.android;
	return { available, via: available ? "direct" : "none" };
}
