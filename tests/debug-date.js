const source = await Deno.readTextFile(new URL("../logos.js", import.meta.url));

function assert(value) {
	if (!value) throw new Error("assertion failed");
}

function fixture(hash) {
	let now = new Date(2026, 9, 12, 13, 14, 15).getTime();
	class Clock extends Date {
		constructor(...args) { super(...(args.length ? args : [now])); }
		static now() { return now; }
	}
	const window = { Date: Clock, location: { hash } };
	const api = new Function("window", "document", source +
		"\nreturn { loadURLDate, active: () => debugDateActive };")(
		window, { addEventListener() {} });
	assert(window.Date === Clock);
	api.loadURLDate("https://example.test/" + hash);
	return { date: window.Date, original: Clock, active: api.active(), advance: ms => now += ms };
}

Deno.test("debug date shifts the local day and keeps the clock ticking", () => {
	const clock = fixture("#daily=20261026&today=2026-10-26");
	assert(clock.active);
	const start = new clock.date();
	assert(start.getFullYear() === 2026 && start.getMonth() === 9 && start.getDate() === 26);
	assert(start.getHours() === 13 && start.getMinutes() === 14);
	assert(clock.date.now() === start.getTime());
	clock.advance(1500);
	assert(clock.date.now() - start.getTime() === 1500);
	assert(new clock.date().getTime() === clock.date.now());
	assert(clock.date() === new clock.date().toString());
});

Deno.test("debug date preserves explicit dates and Date utilities", () => {
	const { date } = fixture("#today=2026-10-31");
	assert(new date(0).getTime() === 0);
	assert(new date(2020, 0, 2).getFullYear() === 2020);
	assert(Number.isNaN(new date(undefined).getTime()));
	assert(date.parse("2020-01-01") === Date.parse("2020-01-01"));
	assert(date.UTC(2020, 0, 1) === Date.UTC(2020, 0, 1));
	assert(new date() instanceof date);
});

Deno.test("missing or invalid debug dates leave the clock alone", () => {
	for (const hash of ["", "#daily=20261031", "#today=", "#today=garbage", "#today=2026-02-30", "#today=2026-13-01"]) {
		const clock = fixture(hash);
		assert(clock.date === clock.original);
		assert(!clock.active);
	}
});
