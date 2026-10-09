import { useEffect, useRef } from "react";

/** Share of the sheet's height that dismisses on release, however slowly. */
const DISTANCE = 0.25;
/** px per ms. A flick dismisses at any distance past `MIN_FLICK`. */
const VELOCITY = 0.4;
/** A flick shorter than this is a twitch, not an intent to close. */
const MIN_FLICK = 16;
/** Movement before the gesture is read as a drag rather than a tap. */
const SLOP = 4;

/*
 * Controls that own a vertical gesture of their own. Dragging on one of these
 * means "use this control", never "close the sheet".
 */
const OWNS_GESTURE = [
	"input",
	"textarea",
	"select",
	"[contenteditable='true']",
	"[role='slider']",
	"[role='listbox']",
	"[role='menu']",
	"[data-no-drag]",
].join(",");

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * Pull a bottom sheet down to close it, the way its grab handle promises.
 *
 * Touch events rather than pointer events: a sheet only exists at phone width,
 * a touch keeps delivering to the element it started on (so no pointer capture
 * is needed), and only a non-passive `touchmove` can stop the browser from
 * turning the same gesture into a scroll.
 *
 * The sheet follows the finger by writing `transform` on the element itself —
 * not a custom property — so the rows inside never restyle mid-drag. On
 * release it either closes, and tw-animate's exit keyframe (which only defines
 * `to`) carries on from wherever the finger let go, or springs back.
 */
export function useDragDismiss(
	element: HTMLElement | null,
	onDismiss: () => void,
	{
		enabled = true,
		media,
		slot,
	}: {
		enabled?: boolean;
		/** Only drag while this media query matches (e.g. a dialog that is a sheet on phones only). */
		media?: string;
		/** Only drag while the element still carries this `data-slot`, so a caller that re-slots the content opts out. */
		slot?: string;
	} = {},
) {
	// Held in a ref so a new closure each render does not re-bind the listeners.
	const dismiss = useRef(onDismiss);
	dismiss.current = onDismiss;

	useEffect(() => {
		if (!element || !enabled) return;
		const sheet = element;

		let start: { x: number; y: number; time: number; id: number } | null = null;
		let dragging = false;
		let offset = 0;

		function springBack() {
			sheet.style.transition = "transform 200ms var(--ease-out-soft)";
			sheet.style.transform = "";
			sheet.addEventListener(
				"transitionend",
				() => {
					sheet.style.transition = "";
				},
				{ once: true },
			);
		}

		function reset() {
			start = null;
			dragging = false;
			offset = 0;
		}

		// Content scrolled away from its top gets the gesture back as a scroll.
		function scrolledAway(target: Element) {
			for (
				let node: Element | null = target;
				node && node !== sheet.parentElement;
				node = node.parentElement
			) {
				if (node.scrollTop > 0) return true;
			}
			return false;
		}

		function onTouchStart(event: TouchEvent) {
			// A second finger mid-drag is ignored rather than becoming the new
			// origin, which would make the sheet jump under it.
			if (start) return;
			if (event.touches.length > 1) return;
			if (media && !window.matchMedia(media).matches) return;
			if (slot && sheet.dataset.slot !== slot) return;

			const target = event.target as Element;
			if (target.closest(OWNS_GESTURE) || scrolledAway(target)) return;

			const touch = event.touches[0];
			start = {
				x: touch.clientX,
				y: touch.clientY,
				time: event.timeStamp,
				id: touch.identifier,
			};
		}

		function onTouchMove(event: TouchEvent) {
			if (!start) return;
			const origin = start;
			const touch = Array.from(event.touches).find(
				(candidate) => candidate.identifier === origin.id,
			);
			if (!touch) return;

			const dx = touch.clientX - origin.x;
			const dy = touch.clientY - origin.y;

			if (!dragging) {
				if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
				// Upward or sideways is a scroll or a rail swipe; let it through.
				if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
					reset();
					return;
				}
				dragging = true;
				sheet.style.transition = "none";
			}

			if (event.cancelable) event.preventDefault();

			// Past its resting place the sheet resists instead of hitting a wall:
			// the further up you pull, the less it follows.
			offset = dy >= 0 ? dy : -Math.sqrt(-dy) * 2;
			sheet.style.transform = `translateY(${offset}px)`;
		}

		function onTouchEnd(event: TouchEvent) {
			if (!start) return;
			const origin = start;
			// Lifting some other finger does not end the drag.
			if (
				Array.from(event.touches).some(
					(touch) => touch.identifier === origin.id,
				)
			) {
				return;
			}

			if (!dragging) {
				reset();
				return;
			}

			const elapsed = Math.max(event.timeStamp - origin.time, 1);
			const velocity = offset / elapsed;
			const far = offset > sheet.offsetHeight * DISTANCE;
			const flicked = offset > MIN_FLICK && velocity > VELOCITY;
			reset();

			if (!far && !flicked) {
				springBack();
				return;
			}

			sheet.style.transition = "";
			if (window.matchMedia(REDUCED_MOTION).matches) {
				// The reduced exit only fades. Pin it where the finger left it so it
				// does not glide back up while fading.
				sheet.style.setProperty(
					"--tw-exit-translate-y",
					sheet.style.transform.slice("translateY(".length, -1),
				);
			}
			dismiss.current();

			// If the owner kept it open, don't leave it stranded half off screen.
			requestAnimationFrame(() => {
				if (sheet.isConnected && sheet.dataset.state === "open") {
					sheet.style.removeProperty("--tw-exit-translate-y");
					springBack();
				}
			});
		}

		function onTouchCancel() {
			if (dragging) springBack();
			reset();
		}

		sheet.addEventListener("touchstart", onTouchStart, { passive: true });
		sheet.addEventListener("touchmove", onTouchMove, { passive: false });
		sheet.addEventListener("touchend", onTouchEnd);
		sheet.addEventListener("touchcancel", onTouchCancel);
		return () => {
			sheet.removeEventListener("touchstart", onTouchStart);
			sheet.removeEventListener("touchmove", onTouchMove);
			sheet.removeEventListener("touchend", onTouchEnd);
			sheet.removeEventListener("touchcancel", onTouchCancel);
		};
	}, [element, enabled, media, slot]);
}
