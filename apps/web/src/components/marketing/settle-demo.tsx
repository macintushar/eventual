import { ArrowRight } from "lucide-react";

import { MemberAvatar } from "#/components/member-avatar";
import { formatMinor } from "#/lib/money";
import { cn } from "#/lib/utils";
import {
	type Act,
	Collapse,
	Count,
	Popover,
	Stage,
	Window,
} from "#/stageshow/kit";

import "./stage-look.css";
import "./settle-demo.css";

/*
 * The landing hero: a group's Balances tab, built from the app's own avatar,
 * balance bar and amount styles. One thing happens: Arjun's suggested payment
 * is recorded, and the balances, bars and headline settle around it.
 *
 * Figures add up: €1,176 split three ways is €392 each. Sam paid €636, so
 * the group owes Sam €244; Arjun (paid €180) owes €212 and Mac (paid €360)
 * owes €32. Once Arjun pays, only Mac's €32 is left.
 *
 * Real strings: the group, the three people, their amounts, the two
 * suggestions and the dialog. Plays once when it comes into view and holds
 * the result; reduced motion shows the opening frame.
 */

type S = { dialog: boolean; paid: boolean };
const initial: S = { dialog: false, paid: false };

const EUR = (minor: number) => formatMinor(minor, "EUR");
/** The bars keep the opening scale, so a settled row shrinks instead of the
 * others jumping to a new maximum mid-story. */
const SCALE = 24_400;

const people = [
	{ id: "arjun", name: "Arjun Mehta", before: -21_200, after: 0 },
	{ id: "mac", name: "Mac Okafor", before: -3_200, after: -3_200 },
	{ id: "sam", name: "Sam Rivera", you: true, before: 24_400, after: 3_200 },
];

async function script(a: Act<S>) {
	await a.wait(900);
	await a.move("record-arjun");
	await a.wait(250);
	await a.click();
	await a.set({ dialog: true });
	await a.wait(1100);
	await a.move("confirm");
	await a.wait(200);
	await a.click();
	await a.set({ dialog: false });
	await a.wait(250);
	await a.set({ paid: true });
	await a.move("rest");
	await a.wait(2400);
}

/**
 * The app's BalanceBar, drawn so a settled side shrinks to the centre line
 * instead of unmounting: same geometry, colours and rounded outer ends.
 */
function Bar({ minor }: { minor: number }) {
	const width = `${(Math.min(Math.abs(minor) / SCALE, 1) * 100).toFixed(2)}%`;
	return (
		<div className="flex h-1.5 w-full items-stretch">
			<div className="flex flex-1 justify-end pr-px">
				<span
					className="sd-bar block rounded-l-[4px] bg-negative"
					style={{ width: minor < 0 ? width : "0%" }}
				/>
			</div>
			<span className="w-px shrink-0 bg-border" />
			<div className="flex flex-1 justify-start pl-px">
				<span
					className="sd-bar block rounded-r-[4px] bg-positive"
					style={{ width: minor > 0 ? width : "0%" }}
				/>
			</div>
		</div>
	);
}

function Status({ minor }: { minor: number }) {
	return (
		<span className="block text-[11px] text-muted-foreground">
			{minor === 0 ? "settled" : minor > 0 ? "is owed" : "owes"}
		</span>
	);
}

function NetBalances({ paid }: { paid: boolean }) {
	return (
		<section className="sd-card island-shell">
			<div className="sd-card-title">Net balances</div>
			<div className="flex flex-col gap-4">
				{people.map((person) => {
					const minor = paid ? person.after : person.before;
					return (
						<div key={person.id} className="flex flex-col gap-2">
							<div className="flex items-center gap-3">
								<MemberAvatar
									name={person.name}
									seed={person.id}
									className="size-8"
								/>
								<span className="min-w-0 flex-1 truncate font-medium">
									{person.name}
									{person.you ? (
										<span className="text-muted-foreground"> (you)</span>
									) : null}
								</span>
								<span className="text-right">
									<span
										className={cn(
											"sd-amount block font-bold",
											minor > 0
												? "text-positive"
												: minor < 0
													? "text-negative"
													: "text-muted-foreground",
										)}
									>
										<Count value={minor} format={EUR} />
									</span>
									<Status minor={minor} />
								</span>
							</div>
							<Bar minor={minor} />
						</div>
					);
				})}
			</div>
		</section>
	);
}

function Debts({ paid, compact }: { paid: boolean; compact: boolean }) {
	const rows = [
		{ id: "arjun", from: "Arjun Mehta", minor: 21_200, open: !paid },
		{ id: "mac", from: "Mac Okafor", minor: 3_200, open: true },
	];
	return (
		<section className="sd-card island-shell">
			<div className="sd-card-title">Simplified debts</div>
			<div className="flex flex-col">
				{rows.map((row) => (
					<Collapse key={row.id} open={row.open}>
						<div className={cn("sd-debt", compact && "sd-debt--stacked")}>
							<span className="sd-debt-who">
								{row.from}
								<ArrowRight
									className="size-3.5 text-muted-foreground"
									aria-hidden="true"
								/>
								Sam Rivera
							</span>
							<span className="sd-debt-end">
								<strong className="tabular">{EUR(row.minor)}</strong>
								<span className="sd-button" data-target={`record-${row.id}`}>
									Record payment
								</span>
							</span>
						</div>
					</Collapse>
				))}
			</div>
		</section>
	);
}

/** Where the recorded payment lands: the reason the debt row went away. */
function History({ paid }: { paid: boolean }) {
	return (
		<section className="sd-card island-shell">
			<div className="sd-card-title">Payment history</div>
			<div className="sd-history">
				<span className="sd-history-empty" data-hide={paid || undefined}>
					No payments recorded yet.
				</span>
				<Collapse open={paid} reveal="drop">
					<div className="sd-paid">
						<MemberAvatar name="Arjun Mehta" seed="arjun" className="size-7" />
						<span className="min-w-0 flex-1">
							<span className="block font-medium">
								Arjun Mehta paid Sam Rivera
							</span>
							<span className="block text-[12px] text-muted-foreground">
								Just now
							</span>
						</span>
						<strong className="tabular">{EUR(21_200)}</strong>
					</div>
				</Collapse>
			</div>
		</section>
	);
}

export function SettleDemo() {
	return (
		<div
			role="img"
			aria-label="Eventual's Balances tab for a group called Lisbon weekend. Arjun records the 212 euros he owes Sam, and the balances update: only Mac's 32 euros is left to pay."
			className="sd ev-stage"
		>
			<div aria-hidden="true">
				<Stage
					width={1080}
					height={560}
					compact={{ below: 640, width: 390, height: 470 }}
					initial={initial}
					script={script}
					play="once"
					cursor={{
						at: { wide: { x: 620, y: 230 }, compact: { x: 300, y: 150 } },
					}}
				>
					{(s, _rect, layout) => {
						const compact = layout === "compact";
						return (
							<>
								<span className="sd-rest" data-target="rest" />
								<Window
									url={compact ? undefined : "eventual.macintushar.xyz"}
									urlShape="pill"
									className="sd-window"
								>
									<div className="sd-page">
										<div className="sd-head">
											<div className="display-title sd-title">
												Lisbon weekend
											</div>
											<div className="sd-sub">
												3 members · you are owed{" "}
												<Count value={s.paid ? 3_200 : 24_400} format={EUR} />
											</div>
										</div>
										{compact ? null : (
											<div className="sd-tabs">
												{["Expenses", "Balances", "Members", "Activity"].map(
													(tab) => (
														<span
															key={tab}
															data-active={tab === "Balances" || undefined}
														>
															{tab}
														</span>
													),
												)}
											</div>
										)}
										<div className="sd-grid">
											{compact ? (
												<>
													<Debts paid={s.paid} compact />
													<NetBalances paid={s.paid} />
												</>
											) : (
												<>
													<NetBalances paid={s.paid} />
													<div className="flex flex-col gap-5">
														<Debts paid={s.paid} compact={false} />
														<History paid={s.paid} />
													</div>
												</>
											)}
										</div>
									</div>
									<div className="sd-scrim" data-show={s.dialog || undefined} />
								</Window>
								<Popover show={s.dialog} origin="center" className="sd-dialog">
									<div className="sd-dialog-title">Record a payment</div>
									<div className="sd-dialog-who">
										<MemberAvatar
											name="Arjun Mehta"
											seed="arjun"
											className="size-7"
										/>
										<span>Arjun Mehta</span>
										<ArrowRight className="size-3.5 text-muted-foreground" />
										<MemberAvatar
											name="Sam Rivera"
											seed="sam"
											className="size-7"
										/>
										<span>Sam Rivera</span>
									</div>
									<div className="sd-field">
										<span className="text-muted-foreground">€</span>
										<span className="tabular">212.00</span>
									</div>
									<span
										className="sd-button sd-button--wide"
										data-target="confirm"
									>
										Record payment
									</span>
								</Popover>
							</>
						);
					}}
				</Stage>
			</div>
		</div>
	);
}
