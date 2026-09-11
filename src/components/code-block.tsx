import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "#/components/ui/button";

export function CodeBlock({ code, label }: { code: string; label?: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="relative overflow-hidden rounded-xl border bg-muted/60">
			{label ? (
				<div className="border-b px-4 py-2 text-xs font-semibold text-muted-foreground">
					{label}
				</div>
			) : null}
			<pre className="overflow-x-auto p-4 pr-12 text-xs leading-relaxed">
				<code className="border-0 bg-transparent p-0">{code}</code>
			</pre>
			<Button
				variant="ghost"
				size="icon-xs"
				className="absolute right-2 bottom-2"
				aria-label={copied ? "Copied" : "Copy to clipboard"}
				onClick={async () => {
					await navigator.clipboard.writeText(code);
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				}}
			>
				{copied ? <Check /> : <Copy />}
			</Button>
		</div>
	);
}
