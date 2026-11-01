import { Wrench } from "lucide-react";

import { BrandLogo } from "#/components/brand-logo";
import { formatMinor } from "#/lib/money";
import {
	LockScreen,
	Notification,
	Phone,
	Stage,
	WALLPAPER,
	Window,
} from "#/stageshow/kit";

import "./stage-look.css";
import "./integrations-demo.css";

/*
 * The Integrations hero, a still: two places an expense gets logged without
 * opening the app. The hero is an AI assistant's chat logging a bill over
 * MCP (one question, one tool call, one answer); the phone straddling its
 * edge shows the Shortcut's own notification, worded as the server words it
 * (src/server/services/shortcut.ts).
 */

const EUR = (minor: number) => formatMinor(minor, "EUR");

function Chat() {
	return (
		<div className="id-chat">
			<div className="id-ask">
				Mac paid {EUR(36_000)} for dinner in Lisbon weekend, split it evenly
			</div>
			<div className="id-tool">
				<Wrench className="size-3.5" aria-hidden="true" />
				<span>
					Eventual · <span className="font-mono">createExpense</span>
				</span>
			</div>
			<div className="id-answer">
				<span className="id-answer-mark">
					<BrandLogo brand="claude" className="size-4" />
				</span>
				<p>
					Done. Dinner is in Lisbon weekend: {EUR(36_000)} paid by Mac Okafor,
					split evenly between three, so {EUR(12_000)} each.
				</p>
			</div>
		</div>
	);
}

export function IntegrationsDemo() {
	return (
		<div
			role="img"
			aria-label="Two ways to log an expense without opening Eventual: an AI assistant adds Mac's 360 euro dinner over MCP, and an iPhone lock screen shows the Shortcut's notification, 42.50 euros logged and split evenly between four."
			className="id ev-stage"
		>
			<div aria-hidden="true">
				<Stage
					width={1080}
					height={360}
					compact={{ below: 640, width: 390, height: 360 }}
				>
					{(_s, _rect, layout) => (
						<>
							{layout === "compact" ? null : (
								<Window className="id-window" title="Assistant">
									<Chat />
								</Window>
							)}
							<Phone
								width={layout === "compact" ? 320 : 290}
								dark
								wallpaper={WALLPAPER}
								className="id-phone"
							>
								<LockScreen size="satellite" stack="top">
									<Notification
										icon={
											<img
												src="/apple-touch-icon.png"
												alt=""
												className="id-app-icon"
											/>
										}
										title="Eventual"
										body={`${EUR(4_250)} logged. You paid, split evenly between 4.`}
										time="now"
									/>
								</LockScreen>
							</Phone>
						</>
					)}
				</Stage>
			</div>
		</div>
	);
}
