import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { ImageResponse } from "@vercel/og";
import { allOgImages, OG_HEIGHT, OG_WIDTH, type OgImage } from "#/lib/og";

/**
 * Renders every share image in src/lib/og.ts to public/og/<slug>.png.
 *
 * Runs under Bun: @vercel/og's Node build loads its wasm with a dynamic
 * require that tsx's ESM loader rejects.
 *
 * Images are committed like the OpenAPI snapshot, so the deployed site serves
 * plain files and needs no image function. `--check` fails when a file is
 * missing or stale instead of writing.
 */

const require = createRequire(import.meta.url);
const outDir = path.resolve(import.meta.dirname, "../public/og");
const check = process.argv.includes("--check");

// Satori reads woff but not woff2. The latin-ext subsets carry ₹ and the
// other currency signs, so each weight loads both.
async function font(pkg: string, file: string) {
	const dir = path.dirname(require.resolve(`${pkg}/package.json`));
	return (await readFile(path.join(dir, "files", file))).buffer as ArrayBuffer;
}

async function fonts() {
	const faces = [
		["@fontsource/inter-tight", "inter-tight", "Inter Tight", 500],
		["@fontsource/inter-tight", "inter-tight", "Inter Tight", 600],
		["@fontsource/instrument-sans", "instrument-sans", "Instrument Sans", 500],
	] as const;
	return Promise.all(
		faces.flatMap(([pkg, prefix, name, weight]) =>
			["latin", "latin-ext"].map(async (subset) => ({
				name,
				weight,
				style: "normal" as const,
				data: await font(pkg, `${prefix}-${subset}-${weight}-normal.woff`),
			})),
		),
	);
}

const ink = "#000000";
const canvas = "#f3f6f9";
const muted = "#46403f";
const tape = "#3a9edd";

function LogoMark({ size }: { size: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
			<rect width="64" height="64" rx="32" fill={ink} />
			<g fill="none" strokeWidth="5" strokeLinecap="round" stroke={canvas}>
				<path d="M31 12A20 20 0 0 0 31 52" />
				<path d="M38 17A15 15 0 0 1 38 47" />
			</g>
		</svg>
	);
}

function Card({ kicker, title }: OgImage) {
	return (
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				padding: "72px 80px",
				background: canvas,
				color: ink,
				fontFamily: "Instrument Sans",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
				<LogoMark size={52} />
				<span
					style={{
						fontFamily: "Inter Tight",
						fontWeight: 600,
						fontSize: 44,
						letterSpacing: "-0.03em",
					}}
				>
					Eventual
				</span>
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 16,
						fontSize: 30,
						fontWeight: 500,
						color: muted,
					}}
				>
					<div
						style={{
							width: 36,
							height: 14,
							borderRadius: 3,
							background: tape,
							opacity: 0.75,
							transform: "rotate(-4deg)",
						}}
					/>
					{kicker}
				</div>
				<div
					style={{
						fontFamily: "Inter Tight",
						fontWeight: 500,
						fontSize: title.length > 48 ? 68 : 80,
						lineHeight: 1.05,
						letterSpacing: "-0.035em",
						maxWidth: 1040,
					}}
				>
					{title}
				</div>
			</div>

			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					fontSize: 26,
					fontWeight: 500,
					color: muted,
				}}
			>
				<div style={{ display: "flex", gap: 14 }}>
					{["Web", "iPhone", "Android", "API", "MCP"].map((name, index) => (
						<span key={name} style={{ display: "flex", gap: 14 }}>
							{index > 0 ? <span>·</span> : null}
							{name}
						</span>
					))}
				</div>
				<span>eventual.macintushar.xyz</span>
			</div>
		</div>
	);
}

const loaded = await fonts();
await mkdir(outDir, { recursive: true });

const stale: string[] = [];
const expected = new Set<string>();
for (const image of allOgImages()) {
	const file = path.join(outDir, `${image.slug}.png`);
	expected.add(path.basename(file));
	const png = Buffer.from(
		await new ImageResponse(<Card {...image} />, {
			width: OG_WIDTH,
			height: OG_HEIGHT,
			fonts: loaded,
		}).arrayBuffer(),
	);
	const current = await readFile(file).catch(() => null);
	if (current?.equals(png)) continue;
	if (check) stale.push(image.slug);
	else await writeFile(file, png);
}

// Icons share the pipeline: the touch icon is an opaque square (iOS draws
// its own corners), the 512px logo keeps the round mark on transparency for
// structured data and the web manifest.
const icons = [
	{ file: "apple-touch-icon.png", size: 180, tile: true },
	{ file: "icon-512.png", size: 512, tile: false },
];
for (const { file, size, tile } of icons) {
	const target = path.resolve(outDir, "..", file);
	const png = Buffer.from(
		await new ImageResponse(
			<div
				style={{
					width: "100%",
					height: "100%",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					background: tile ? canvas : "transparent",
				}}
			>
				<LogoMark size={tile ? Math.round(size * 0.72) : size} />
			</div>,
			{ width: size, height: size, fonts: loaded },
		).arrayBuffer(),
	);
	const current = await readFile(target).catch(() => null);
	if (current?.equals(png)) continue;
	if (check) stale.push(file);
	else await writeFile(target, png);
}

const orphans = (await readdir(outDir)).filter(
	(name) => name.endsWith(".png") && !expected.has(name),
);
if (check) stale.push(...orphans);
else await Promise.all(orphans.map((name) => rm(path.join(outDir, name))));

if (stale.length) {
	console.error(
		`Share images are stale: ${stale.join(", ")}. Run bun run og:generate.`,
	);
	process.exit(1);
}
console.log(
	`${check ? "Checked" : "Wrote"} ${expected.size} share images and ${icons.length} icons.`,
);
