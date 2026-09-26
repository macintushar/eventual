"use client";

import {
	ChevronLeft,
	ChevronRight,
	Expand,
	Minus,
	Plus,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import type { HelpArticle } from "#/lib/help";
import { cn } from "#/lib/utils";

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

export type HelpStep = HelpArticle["steps"][number];

function clampZoom(value: number) {
	const stepped = Math.round(value / ZOOM_STEP) * ZOOM_STEP;
	return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, stepped));
}

export function HelpShot({
	steps = [],
	index = 0,
	caption,
	moreLabel,
}: {
	steps?: HelpStep[];
	index?: number;
	caption?: string;
	moreLabel?: string;
}) {
	const start = Math.min(Math.max(index, 0), Math.max(steps.length - 1, 0));
	const [open, setOpen] = useState(false);
	const [current, setCurrent] = useState(start);
	const [zoom, setZoom] = useState(1);
	const [pan, setPan] = useState({ x: 0, y: 0 });
	const drag = useRef<{
		x: number;
		y: number;
		panX: number;
		panY: number;
	} | null>(null);

	const step = steps[current] ?? steps[start];
	const last = steps.length - 1;

	useEffect(() => {
		if (zoom <= 1) setPan({ x: 0, y: 0 });
	}, [zoom]);

	const resetView = () => {
		setZoom(1);
		setPan({ x: 0, y: 0 });
	};

	const bumpZoom = (delta: number) => {
		setZoom((value) => clampZoom(value + delta));
	};

	const goTo = (nextIndex: number) => {
		setCurrent(Math.min(Math.max(nextIndex, 0), last));
		resetView();
	};

	const onOpenChange = (next: boolean) => {
		setOpen(next);
		if (next) {
			setCurrent(start);
			resetView();
		} else {
			resetView();
		}
	};

	if (!step) return null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<figure className="island-shell overflow-hidden rounded-2xl">
				<DialogTrigger asChild>
					<button
						type="button"
						className="relative block w-full cursor-zoom-in"
					>
						<img
							src={steps[start].image}
							alt={steps[start].alt}
							loading="lazy"
							decoding="async"
							className="w-full bg-muted"
						/>
						<span className="sr-only">View larger</span>
						<span
							aria-hidden="true"
							className="pointer-events-none absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm"
						>
							<Expand />
						</span>
					</button>
				</DialogTrigger>
				{caption || moreLabel ? (
					<figcaption className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
						{caption ? <span>{caption}</span> : null}
						{moreLabel ? (
							<DialogTrigger asChild>
								<button
									type="button"
									className="ml-auto font-medium text-foreground underline decoration-tape decoration-2 underline-offset-3"
								>
									{moreLabel}
								</button>
							</DialogTrigger>
						) : null}
					</figcaption>
				) : null}
			</figure>

			<DialogContent
				showCloseButton={false}
				data-slot="dialog-lightbox"
				className="flex flex-col bg-stage-dark sm:flex-row"
				onKeyDown={(event) => {
					if (event.key === "+" || event.key === "=") {
						event.preventDefault();
						bumpZoom(ZOOM_STEP);
					} else if (event.key === "-" || event.key === "_") {
						event.preventDefault();
						bumpZoom(-ZOOM_STEP);
					} else if (event.key === "0") {
						event.preventDefault();
						resetView();
					} else if (event.key === "ArrowLeft") {
						event.preventDefault();
						goTo(current - 1);
					} else if (event.key === "ArrowRight") {
						event.preventDefault();
						goTo(current + 1);
					}
				}}
			>
				<DialogTitle className="sr-only">
					{step.title}. Step {current + 1} of {steps.length}.
				</DialogTitle>
				<DialogDescription className="sr-only">
					Scroll or use the controls to zoom. Drag to pan when zoomed in. Arrow
					keys move between steps. Press Escape to close.
				</DialogDescription>

				<div
					className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden"
					onWheel={(event) => {
						event.preventDefault();
						bumpZoom(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
					}}
				>
					<button
						type="button"
						aria-label={
							zoom > 1
								? "Drag to move the screenshot. Double-click to fit."
								: "Double-click to zoom in"
						}
						className={cn(
							"max-h-full max-w-full border-0 bg-transparent p-0",
							// Only claim every touch while zoomed, when a drag pans. At fit
							// size a pinch has to reach the browser — there is no pinch
							// handler here — and `manipulation` keeps double-tap for us.
							zoom > 1
								? "cursor-grab touch-none active:cursor-grabbing"
								: "cursor-zoom-in touch-manipulation",
						)}
						onDoubleClick={() => {
							if (zoom > 1) resetView();
							else bumpZoom(1);
						}}
						onPointerDown={(event) => {
							if (zoom <= 1) return;
							event.currentTarget.setPointerCapture(event.pointerId);
							drag.current = {
								x: event.clientX,
								y: event.clientY,
								panX: pan.x,
								panY: pan.y,
							};
						}}
						onPointerMove={(event) => {
							if (!drag.current) return;
							setPan({
								x: drag.current.panX + (event.clientX - drag.current.x),
								y: drag.current.panY + (event.clientY - drag.current.y),
							});
						}}
						onPointerUp={() => {
							drag.current = null;
						}}
						onPointerCancel={() => {
							drag.current = null;
						}}
					>
						<img
							src={step.image}
							alt=""
							draggable={false}
							decoding="async"
							className="max-h-full max-w-full select-none object-contain"
							style={{
								transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
							}}
						/>
					</button>

					<DialogClose asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							aria-label="Close"
							className="island-shell absolute top-[calc(var(--safe-top)+1rem)] right-[calc(var(--safe-right)+1rem)] z-10 rounded-full sm:top-[calc(var(--safe-top)+1.5rem)] sm:right-[calc(var(--safe-right)+1.5rem)]"
						>
							<X data-icon="inline-start" />
						</Button>
					</DialogClose>

					<div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4 sm:bottom-6">
						<div className="island-shell pointer-events-auto flex items-center gap-1 rounded-full p-1.5">
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label="Zoom out"
								disabled={zoom <= MIN_ZOOM}
								onClick={() => bumpZoom(-ZOOM_STEP)}
							>
								<Minus data-icon="inline-start" />
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="tabular"
								aria-label="Reset zoom"
								disabled={zoom <= MIN_ZOOM}
								onClick={resetView}
							>
								{Math.round(zoom * 100)}%
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label="Zoom in"
								disabled={zoom >= MAX_ZOOM}
								onClick={() => bumpZoom(ZOOM_STEP)}
							>
								<Plus data-icon="inline-start" />
							</Button>
						</div>
					</div>
				</div>

				<aside className="flex max-h-[42%] w-full shrink-0 flex-col gap-4 overflow-hidden bg-card px-5 py-5 sm:max-h-none sm:h-full sm:w-80 sm:border-l lg:w-96">
					<p className="island-kicker">
						Step {current + 1} of {steps.length}
					</p>
					<h2 className="display-title text-2xl">{step.title}</h2>
					<p className="min-h-0 overflow-y-auto text-sm leading-relaxed text-muted-foreground max-sm:max-h-28 sm:flex-1">
						{step.body}
					</p>
					<div className="flex gap-2">
						<Button
							type="button"
							variant="outline"
							className="flex-1"
							disabled={current <= 0}
							onClick={() => goTo(current - 1)}
						>
							<ChevronLeft data-icon="inline-start" />
							Previous
						</Button>
						<Button
							type="button"
							className="flex-1"
							disabled={current >= last}
							onClick={() => goTo(current + 1)}
						>
							Next
							<ChevronRight data-icon="inline-end" />
						</Button>
					</div>
				</aside>
			</DialogContent>
		</Dialog>
	);
}
