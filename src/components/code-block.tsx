import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { copyToClipboard } from "#/lib/clipboard";

export function CodeBlock({
	code,
	label,
	copyLabel,
}: {
	code: string;
	label?: string;
	copyLabel?: string;
}) {
	const [copied, setCopied] = useState(false);

	const copyButton = (
		<Button
			variant="ghost"
			size={copyLabel ? "xs" : "icon-xs"}
			className="press shrink-0"
			aria-label={copied ? "Copied" : (copyLabel ?? "Copy to clipboard")}
			onClick={async () => {
				if (!(await copyToClipboard(code, "code"))) return;
				setCopied(true);
				setTimeout(() => setCopied(false), 1500);
			}}
		>
			{copied ? <Check /> : <Copy />}
			{copyLabel ? (copied ? "Copied" : copyLabel) : null}
		</Button>
	);

	return (
		<div className="relative overflow-hidden rounded-xl border bg-muted/60">
			{/*
			 * The copy control lives in the label bar, not over the code. A block
			 * of URLs is wider than a phone, so anything floating on top of the
			 * last line covers exactly the part you scrolled across to read.
			 */}
			{label ? (
				<div className="flex items-center justify-between gap-2 border-b py-1 pr-1 pl-4">
					<span className="min-w-0 truncate text-xs font-semibold text-muted-foreground">
						{label}
					</span>
					{copyButton}
				</div>
			) : (
				<div className="absolute top-2 right-2 z-10">{copyButton}</div>
			)}
			<pre
				// Swiping a wide block shouldn't drag the page along with it.
				className="overflow-x-auto overscroll-x-contain p-4 text-xs leading-relaxed"
			>
				<code className="border-0 bg-transparent p-0">{code}</code>
			</pre>
		</div>
	);
}
