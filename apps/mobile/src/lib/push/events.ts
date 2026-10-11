/**
 * The D2 trigger: exactly one in-context offer, raised by the first
 * successful expense save or invitation accept while signed in on a server
 * with push. A plain external store keeps this free of screen imports, so
 * the composer and the invite screen can fire it from anywhere.
 */
type Listener = () => void;

let pendingOpportunity = false;
const listeners = new Set<Listener>();

function emit() {
	for (const listener of listeners) listener();
}

/** The composer calls this after a successful expense save. */
export function notifyExpenseSaved() {
	pendingOpportunity = true;
	emit();
}

/** The invite screen calls this after a successful accept. */
export function notifyInviteAccepted() {
	pendingOpportunity = true;
	emit();
}

/** The lifecycle consumed it (screen shown or dismissed). */
export function consumeOpportunity() {
	if (!pendingOpportunity) return;
	pendingOpportunity = false;
	emit();
}

export function subscribeOpportunity(listener: Listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function getOpportunity() {
	return pendingOpportunity;
}
