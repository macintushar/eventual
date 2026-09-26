import { cn } from "#/lib/utils";

const lobe = (name: string) =>
	`https://unpkg.com/@lobehub/icons-static-svg@1.95.0/icons/${name}.svg`;

const iconify = (icon: string) => `https://api.iconify.design/${icon}.svg`;

/**
 * Logos load straight from each source's CDN. Monochrome SVGs use
 * `currentColor`, which an <img> renders black, so they invert in dark mode.
 * A brand whose own colours don't survive inversion names a `darkSrc`
 * instead, and the theme picks between the two.
 */
const brands = {
	shortcuts: {
		name: "Apple Shortcuts",
		src: "https://is1-ssl.mzstatic.com/image/thumb/Purple113/v4/3e/52/07/3e520776-0908-893c-2248-6c9d29a03cc7/AppIcon-0-1x_U007emarketing-0-0-GLES2_U002c0-512MB-sRGB-0-0-0-85-220-0-0-0-7.png/128x128bb.png",
		mono: false,
		appIcon: true,
	},
	claude: { name: "Claude", src: lobe("claude-color"), mono: false },
	openai: { name: "ChatGPT", src: lobe("openai"), mono: true },
	perplexity: {
		name: "Perplexity",
		src: lobe("perplexity-color"),
		mono: false,
	},
	google: { name: "Google", src: lobe("google-color"), mono: false },
	codex: { name: "Codex", src: lobe("codex"), mono: true },
	cursor: { name: "Cursor", src: lobe("cursor"), mono: true },
	opencode: { name: "OpenCode", src: lobe("opencode"), mono: true },
	hermes: { name: "Hermes", src: lobe("nousresearch"), mono: true },
	openclaw: { name: "OpenClaw", src: lobe("openclaw-color"), mono: false },
	upi: { name: "UPI", src: iconify("thesvg-color/upi"), mono: false },
	wise: {
		name: "Wise",
		// Wise pairs forest green with its bright green, each on the other's
		// ground, so the paper theme gets the dark one and the dark theme the
		// bright one.
		src: `${iconify("simple-icons/wise")}?color=%23163300`,
		darkSrc: `${iconify("simple-icons/wise")}?color=%239fe870`,
		mono: false,
	},
} satisfies Record<
	string,
	{
		name: string;
		src: string;
		darkSrc?: string;
		mono: boolean;
		appIcon?: boolean;
	}
>;

export type Brand = keyof typeof brands;

export const assistantBrands: Brand[] = [
	"claude",
	"cursor",
	"opencode",
	"hermes",
	"openclaw",
];

export function BrandLogo({
	brand,
	className,
	decorative = true,
}: {
	brand: Brand;
	className?: string;
	decorative?: boolean;
}) {
	const logo = brands[brand];
	const image = (src: string, theme?: string) => (
		<img
			src={src}
			alt={decorative ? "" : logo.name}
			loading="lazy"
			decoding="async"
			className={cn(
				"size-4 shrink-0 object-contain",
				logo.mono && "dark:invert",
				"appIcon" in logo && "rounded-[22%]",
				className,
				theme,
			)}
		/>
	);
	if (!("darkSrc" in logo)) return image(logo.src);
	// A hidden lazy image is never fetched, so only the theme's one loads.
	return (
		<>
			{image(logo.src, "dark:hidden")}
			{image(logo.darkSrc, "hidden dark:block")}
		</>
	);
}
