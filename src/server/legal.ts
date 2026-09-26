import { env } from "#/env";

export type LegalProcessor = {
	name: string;
	purpose: string;
	privacyUrl: string;
	/** Where it processes data; null for global services like Google sign-in. */
	location: string | null;
};

export type LegalInfo = {
	/** Null on an instance whose operator hasn't named themselves. */
	operator: string | null;
	governingLaw: string | null;
	/** Null when the operator hasn't published a privacy and legal address. */
	contactEmail: string | null;
	/** Where the database lives, e.g. "India"; null when the operator hasn't said. */
	dataLocation: string | null;
	origin: string;
	processors: LegalProcessor[];
};

const US = "United States";

/** Sentry's EU region ingests at `*.de.sentry.io`; everything else is US. */
function sentryLocation(dsn: string) {
	try {
		return new URL(dsn).hostname.includes(".de.") ? "Germany" : US;
	} catch {
		return US;
	}
}

/**
 * The privacy policy lists only the vendors this instance is configured to
 * use, so a self-hosted copy without Sentry or PostHog doesn't claim to send
 * data to them.
 */
function configuredProcessors(): LegalProcessor[] {
	const processors: LegalProcessor[] = [];
	if (process.env.VERCEL) {
		processors.push({
			name: "Vercel",
			purpose:
				"Hosts the app and handles web requests, including request logs.",
			privacyUrl: "https://vercel.com/legal/privacy-policy",
			// vercel.json sets no `regions`, so functions run in the default iad1.
			location: US,
		});
	}
	if (env.TURSO_DATABASE_URL.startsWith("libsql://")) {
		processors.push({
			name: "Turso",
			purpose: "Stores the database: accounts, groups, expenses and balances.",
			privacyUrl: "https://turso.tech/privacy-policy",
			location: env.LEGAL_DATA_LOCATION,
		});
	}
	if (env.RESEND_API_KEY && env.EMAIL_FROM) {
		processors.push({
			name: "Resend",
			purpose:
				"Delivers account emails, such as verification and password-reset links.",
			privacyUrl: "https://resend.com/legal/privacy-policy",
			// Resend's default sending region, us-east-1.
			location: US,
		});
	}
	if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
		processors.push({
			name: "Google",
			purpose: "Signs you in when you choose Continue with Google.",
			privacyUrl: "https://policies.google.com/privacy",
			location: null,
		});
	}
	const sentryDsn = env.SENTRY_DSN ?? env.VITE_SENTRY_DSN;
	if (sentryDsn) {
		processors.push({
			name: "Sentry",
			purpose:
				"Receives error reports so we can fix crashes. Request bodies, cookies and API keys are stripped first.",
			privacyUrl: "https://sentry.io/privacy/",
			location: sentryLocation(sentryDsn),
		});
	}
	if (env.POSTHOG_PROJECT_TOKEN || env.VITE_POSTHOG_PROJECT_TOKEN) {
		processors.push({
			name: "PostHog",
			purpose:
				"Counts page views and feature use against your account ID. It never receives amounts, descriptions or other transaction details.",
			privacyUrl: "https://posthog.com/privacy",
			location: new URL(
				env.VITE_POSTHOG_HOST ?? env.POSTHOG_HOST,
			).hostname.startsWith("eu.")
				? "European Union"
				: US,
		});
	}
	return processors;
}

export const getLegalInfo = (): LegalInfo => ({
	operator: env.LEGAL_OPERATOR_NAME,
	governingLaw: env.LEGAL_GOVERNING_LAW,
	contactEmail: env.LEGAL_CONTACT_EMAIL,
	dataLocation: env.LEGAL_DATA_LOCATION,
	origin: new URL(env.BETTER_AUTH_URL).origin,
	processors: configuredProcessors(),
});
