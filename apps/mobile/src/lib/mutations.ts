/**
 * A fresh key for one write. The server replays the first response for a
 * repeated key, so a retried request can't apply twice.
 */
export function idempotencyKey() {
	const random = () => Math.random().toString(36).slice(2, 10);
	return `mobile-${Date.now().toString(36)}-${random()}${random()}`;
}
