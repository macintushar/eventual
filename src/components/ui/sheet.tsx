"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import type * as React from "react";

/**
 * A panel that slides in from an edge. Built on Radix Dialog, so it is modal
 * and gets focus trapping, Escape and scroll locking for free, but it carries
 * its own `data-slot`s — the phone rules in styles.css reshape
 * `dialog-content` into a bottom sheet, and a sheet must not be reshaped twice.
 *
 * Reach for this over `Dialog` when the content is a list of choices or a
 * secondary surface rather than a question that needs answering: menus, row
 * actions, filters, detail panels.
 */
function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
	return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({
	...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
	return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
	...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
	return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetOverlay({
	className,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
	return (
		<SheetPrimitive.Overlay
			data-slot="sheet-overlay"
			className={cn(
				"fixed inset-0 z-50 bg-black/45 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
				className,
			)}
			{...props}
		/>
	);
}

const sheetVariants = cva(
	"fixed z-50 flex flex-col gap-4 bg-popover text-popover-foreground shadow-lg outline-none transition-none data-[state=closed]:animate-out data-[state=open]:animate-in",
	{
		variants: {
			side: {
				bottom:
					"inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[calc(var(--radius)+10px)] border-t px-5 pt-7 pb-[calc(1.5rem+var(--safe-bottom))] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
				top: "inset-x-0 top-0 max-h-[88dvh] rounded-b-[calc(var(--radius)+10px)] border-b px-5 pt-[calc(1.5rem+var(--safe-top))] pb-7 data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
				right:
					"inset-y-0 right-0 w-[min(24rem,calc(100vw-2rem))] border-l p-5 pt-[calc(1.25rem+var(--safe-top))] pb-[calc(1.25rem+var(--safe-bottom))] data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
				left: "inset-y-0 left-0 w-[min(24rem,calc(100vw-2rem))] border-r p-5 pt-[calc(1.25rem+var(--safe-top))] pb-[calc(1.25rem+var(--safe-bottom))] data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
			},
		},
		defaultVariants: { side: "bottom" },
	},
);

function SheetContent({
	className,
	children,
	side = "bottom",
	showCloseButton = false,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Content> &
	VariantProps<typeof sheetVariants> & { showCloseButton?: boolean }) {
	return (
		<SheetPrimitive.Portal>
			<SheetOverlay />
			<SheetPrimitive.Content
				data-slot="sheet-content"
				data-side={side}
				className={cn(
					sheetVariants({ side }),
					"duration-320 ease-[cubic-bezier(0.16,1,0.3,1)]",
					className,
				)}
				{...props}
			>
				{/* Grab handle, so a bottom sheet reads as something you could pull. */}
				{side === "bottom" ? (
					<span
						aria-hidden="true"
						className="absolute top-2.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-border"
					/>
				) : null}

				{children}

				{showCloseButton ? (
					<SheetPrimitive.Close
						data-slot="sheet-close"
						className="absolute top-4 right-4 rounded-full p-1 opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
					>
						<XIcon className="size-4" />
						<span className="sr-only">Close</span>
					</SheetPrimitive.Close>
				) : null}
			</SheetPrimitive.Content>
		</SheetPrimitive.Portal>
	);
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sheet-header"
			className={cn("flex flex-col gap-1", className)}
			{...props}
		/>
	);
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sheet-footer"
			className={cn("mt-auto flex flex-col gap-2", className)}
			{...props}
		/>
	);
}

function SheetTitle({
	className,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
	return (
		<SheetPrimitive.Title
			data-slot="sheet-title"
			className={cn("text-base leading-tight font-semibold", className)}
			{...props}
		/>
	);
}

function SheetDescription({
	className,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
	return (
		<SheetPrimitive.Description
			data-slot="sheet-description"
			className={cn("text-sm text-muted-foreground", className)}
			{...props}
		/>
	);
}

export {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetOverlay,
	SheetTitle,
	SheetTrigger,
};
