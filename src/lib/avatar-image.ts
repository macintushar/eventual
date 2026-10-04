import { AVATAR_MAX_LENGTH } from "#/server/schemas";

/** Twice the largest avatar on screen (48px), so it stays sharp on retina. */
const SIZE = 128;
const QUALITIES = [0.82, 0.7, 0.6, 0.5];

function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
	return canvas.toDataURL(type, quality);
}

/**
 * Turns whatever the picker returned into a small square photo for
 * `user.image`: centre-cropped, 128px, WebP where the browser can encode it
 * and JPEG where it can't. Drawing through a canvas also drops EXIF, so a
 * phone photo's location never leaves the device.
 */
export async function toAvatarDataUrl(file: File): Promise<string> {
	if (!file.type.startsWith("image/")) throw new Error("Choose an image file");

	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		throw new Error("Couldn't read that image. Try a JPEG or PNG.");
	}

	const side = Math.min(bitmap.width, bitmap.height);
	const canvas = document.createElement("canvas");
	canvas.width = SIZE;
	canvas.height = SIZE;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Couldn't process that image");
	context.imageSmoothingQuality = "high";

	const draw = (background?: string) => {
		context.clearRect(0, 0, SIZE, SIZE);
		if (background) {
			context.fillStyle = background;
			context.fillRect(0, 0, SIZE, SIZE);
		}
		context.drawImage(
			bitmap,
			(bitmap.width - side) / 2,
			(bitmap.height - side) / 2,
			side,
			side,
			0,
			0,
			SIZE,
			SIZE,
		);
	};

	try {
		draw();
		// Browsers that can't encode WebP silently hand back a PNG instead.
		const webp = encode(canvas, "image/webp", QUALITIES[0]).startsWith(
			"data:image/webp",
		);
		// JPEG has no alpha, so transparent pixels would come out black.
		if (!webp) draw("#ffffff");
		const type = webp ? "image/webp" : "image/jpeg";
		for (const quality of QUALITIES) {
			const url = encode(canvas, type, quality);
			if (url.length <= AVATAR_MAX_LENGTH) return url;
		}
	} finally {
		bitmap.close();
	}
	throw new Error("Couldn't shrink that photo enough. Try another one.");
}
