import {
	Activity,
	ChevronLeft,
	Plus,
	Receipt,
	Scale,
	Settings,
	Users,
} from "lucide-react";

import { MemberAvatar } from "#/components/member-avatar";
import { formatMinor } from "#/lib/money";
import {
	type Act,
	Collapse,
	Count,
	Phone,
	Stage,
	Window,
} from "#/stageshow/kit";

import "./stage-look.css";
import "./platforms-demo.css";

/*
 * "One account, everywhere" as a device pair: the web app's expense table
 * and the native iPhone app showing the same group. One thing happens: a new
 * expense lands in both lists at once, and Sam's balance updates on both.
 *
 * Figures add up: every amount splits evenly four ways. Sam paid the €40.00
 * internet and owes 10.00 + 28.10 + 5.90 = €44.00 of the first three, so
 * owes €4.00; Priya's €84.60 groceries add a €21.15 share, so €25.15.
 *
 * The phone mirrors apps/mobile's group screen: role kicker, display title,
 * the glass Add expense button, the section tabs and the grouped list.
 */

type S = { added: boolean };
const initial: S = { added: false };
const poster: S = { added: true };

const EUR = (minor: number) => formatMinor(minor, "EUR");

const NEW = {
	id: "groceries",
	what: "Groceries",
	who: "Priya Nair",
	when: "28 Oct",
	minor: 8_460,
};
const OLDER = [
	{
		id: "internet",
		what: "Internet",
		who: "Sam Rivera",
		when: "25 Oct",
		minor: 4_000,
	},
	{
		id: "power",
		what: "Electricity",
		who: "Jonas Weber",
		when: "21 Oct",
		minor: 11_240,
	},
	{
		id: "cleaning",
		what: "Cleaning supplies",
		who: "Lena Park",
		when: "18 Oct",
		minor: 2_360,
	},
];

async function script(a: Act<S>) {
	await a.wait(1200);
	await a.set({ added: true });
	await a.wait(3000);
}

function Owe({ added }: { added: boolean }) {
	return (
		<>
			4 members · you owe{" "}
			<span className="text-negative">
				<Count value={added ? 2_515 : 400} format={EUR} />
			</span>
		</>
	);
}

function WebRow({ row }: { row: typeof NEW }) {
	return (
		<div className="pd-row">
			<span className="font-medium">{row.what}</span>
			<span className="flex items-center gap-2">
				<MemberAvatar
					name={row.who}
					seed={row.who}
					className="size-6 text-[10px]"
				/>
				{row.who}
			</span>
			<span className="text-muted-foreground">{row.when}</span>
			<strong className="tabular text-right">{EUR(row.minor)}</strong>
		</div>
	);
}

function PhoneRow({ row }: { row: typeof NEW }) {
	return (
		<div className="pd-prow">
			<span className="min-w-0 flex-1">
				<span className="pd-prow-title">{row.what}</span>
				<span className="pd-prow-meta">
					{row.who} · {row.when}
				</span>
			</span>
			<strong className="tabular">{EUR(row.minor)}</strong>
		</div>
	);
}

const TABS = [
	{ label: "Expenses", Icon: Receipt },
	{ label: "Balances", Icon: Scale },
	{ label: "Members", Icon: Users },
	{ label: "Activity", Icon: Activity },
];

export function PlatformsDemo() {
	return (
		<div
			role="img"
			aria-label="The same group, Flat 4B, open in Eventual on the web and in the iPhone app. A new 84.60 euro groceries expense appears in both lists at once."
			className="pd ev-stage"
		>
			<div aria-hidden="true">
				<Stage
					width={1080}
					height={470}
					compact={{ below: 640, width: 390, height: 520 }}
					initial={initial}
					poster={poster}
					script={script}
					play="once"
				>
					{(s, _rect, layout) => (
						<>
							{layout === "compact" ? null : (
								<Window
									url="eventual.macintushar.xyz"
									urlShape="pill"
									className="pd-window"
								>
									<div className="pd-page">
										<div className="pd-head">
											<div className="display-title pd-title">Flat 4B</div>
											<div className="pd-sub">
												<Owe added={s.added} />
											</div>
										</div>
										<div className="pd-table">
											<div className="pd-row pd-row--head">
												<span>Description</span>
												<span>Paid by</span>
												<span>Date</span>
												<span className="text-right">Amount</span>
											</div>
											<Collapse open={s.added} reveal="drop">
												<div className="pd-new">
													<WebRow row={NEW} />
												</div>
											</Collapse>
											{OLDER.map((row) => (
												<WebRow key={row.id} row={row} />
											))}
										</div>
									</div>
								</Window>
							)}

							<Phone
								width={layout === "compact" ? 300 : 300}
								className="pd-phone"
							>
								<div className="pd-app">
									<div className="pd-nav">
										<span className="pd-glass">
											<ChevronLeft className="size-6" strokeWidth={2.2} />
										</span>
										<span className="pd-glass">
											<Settings className="size-[22px]" strokeWidth={2} />
										</span>
									</div>
									<div className="pd-kicker">
										<span className="pd-tape" />
										Member
									</div>
									<div className="pd-display">Flat 4B</div>
									<div className="pd-psub">
										<Owe added={s.added} />
									</div>
									<div className="pd-add">
										<Plus className="size-5" strokeWidth={2.4} />
										Add expense
									</div>
									<div className="pd-tabs">
										{TABS.map(({ label, Icon }, index) => (
											<span key={label} data-active={index === 0 || undefined}>
												<Icon className="size-[18px]" strokeWidth={2} />
												{label}
											</span>
										))}
									</div>
									<div className="pd-list">
										<Collapse open={s.added} reveal="drop">
											<PhoneRow row={NEW} />
										</Collapse>
										{OLDER.map((row) => (
											<PhoneRow key={row.id} row={row} />
										))}
									</div>
								</div>
							</Phone>
						</>
					)}
				</Stage>
			</div>
		</div>
	);
}
