import { createContext, type ReactNode, useContext } from "react";

type Container = HTMLElement | null;

const PopupContainer = createContext<Container>(null);

/**
 * Where portalled popups should mount.
 *
 * Radix's modal Dialog puts `pointer-events: none` on the body and re-enables
 * it only on its own content, so a Base UI popup portalled to `<body>` — the
 * combobox list, for one — renders but cannot be clicked. Wrapping a dialog's
 * content in this provider moves those popups inside the dialog, where they are
 * interactive and where Radix's dismissable layer counts a click on them as a
 * click inside rather than outside.
 *
 * Radix's own Popover manages the same problem through its layer stack, so it
 * does not need this.
 */
export function PopupContainerProvider({
	container,
	children,
}: {
	container: Container;
	children: ReactNode;
}) {
	return (
		<PopupContainer.Provider value={container}>
			{children}
		</PopupContainer.Provider>
	);
}

export function usePopupContainer() {
	return useContext(PopupContainer);
}

/**
 * Whether a portalled popup is currently open inside `container`.
 *
 * Radix's dismissable layer listens for Escape in the capture phase on the
 * document, so a dialog would otherwise close out from under an open combobox
 * list — and the list would never see the keypress that was meant for it. A
 * dialog hosting popups checks this in `onEscapeKeyDown` and defers.
 */
export function hasOpenPopup(container: Container) {
	return Boolean(
		container?.querySelector("[data-slot='combobox-content'][data-open]"),
	);
}
