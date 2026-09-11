import { cn } from "#/lib/utils";

const lobe = (name: string) =>
	`https://unpkg.com/@lobehub/icons-static-svg@1.95.0/icons/${name}.svg`;

/**
 * Logos load straight from each source's CDN. Monochrome SVGs use
 * `currentColor`, which an <img> renders black, so they invert in dark mode.
 */
const brands = {
	shortcuts: {
		name: "Apple Shortcuts",
		src: "https://is1-ssl.mzstatic.com/image/thumb/Purple113/v4/3e/52/07/3e520776-0908-893c-2248-6c9d29a03cc7/AppIcon-0-1x_U007emarketing-0-0-GLES2_U002c0-512MB-sRGB-0-0-0-85-220-0-0-0-7.png/128x128bb.png",
		mono: false,
		appIcon: true,
	},
	claude: { name: "Claude", src: lobe("claude-color"), mono: false },
	cursor: { name: "Cursor", src: lobe("cursor"), mono: true },
	opencode: { name: "OpenCode", src: lobe("opencode"), mono: true },
	hermes: { name: "Hermes", src: lobe("nousresearch"), mono: true },
	openclaw: { name: "OpenClaw", src: lobe("openclaw-color"), mono: false },
} satisfies Record<
	string,
	{ name: string; src: string; mono: boolean; appIcon?: boolean }
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
	return (
		<img
			src={logo.src}
			alt={decorative ? "" : logo.name}
			loading="lazy"
			decoding="async"
			className={cn(
				"size-4 shrink-0 object-contain",
				logo.mono && "dark:invert",
				"appIcon" in logo && "rounded-[22%]",
				className,
			)}
		/>
	);
}
