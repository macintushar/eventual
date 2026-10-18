import { AVATAR_MAX_LENGTH } from "@eventual/schemas";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { ImagePickerAsset } from "expo-image-picker";

/** Same as the web (`apps/web/src/lib/avatar-image.ts`): 2× the largest avatar. */
const SIZE = 128;
const QUALITIES = [0.82, 0.7, 0.6, 0.5];

/**
 * Turns a picked photo into what `user.image` stores: a centre-cropped,
 * 128px JPEG data URL under the server's size cap. Re-encoding also drops
 * EXIF, so a photo's location never leaves the device. JPEG rather than the
 * web's WebP because every platform can encode it.
 */
export async function toAvatarDataUrl(asset: ImagePickerAsset) {
	const context = ImageManipulator.manipulate(asset.uri);
	// iOS already crops to a square; this covers Android and odd sizes.
	if (asset.width > 0 && asset.height > 0 && asset.width !== asset.height) {
		const side = Math.min(asset.width, asset.height);
		context.crop({
			originX: (asset.width - side) / 2,
			originY: (asset.height - side) / 2,
			width: side,
			height: side,
		});
	}
	context.resize({ width: SIZE, height: SIZE });
	const image = await context.renderAsync();
	try {
		for (const compress of QUALITIES) {
			const { base64 } = await image.saveAsync({
				format: SaveFormat.JPEG,
				compress,
				base64: true,
			});
			if (!base64) break;
			const url = `data:image/jpeg;base64,${base64}`;
			if (url.length <= AVATAR_MAX_LENGTH) return url;
		}
	} finally {
		image.release();
		context.release();
	}
	throw new Error("Couldn’t shrink that photo enough. Try another one.");
}
