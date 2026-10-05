import "../friends/logos-multiplayer.js";
import "../friends/logos-webrtc.js";
import "../friends/logos-rooms.js";

const { RoomSignaling, encodeSignal } = globalThis.LogosFriends;
function assert(value, message = "assertion failed") {
	if (!value) throw new Error(message);
}
function fixture(role = "host") {
	const states = [], sent = [];
	const transport = {
		pending: new Map(),
		drop(record) { record.closed = true; this.pending.delete(record.connectionId); },
		async acceptAnswer(signal) { this.answer = signal; },
	};
	const room = new RoomSignaling({
		name: "amber-olive", endpoint: "https://example.test/api/rooms",
		onState: state => states.push(state),
		onRole: () => transport,
	});
	room.role = role;
	room.transport = transport;
	room.socket = { close() { this.closed = true; } };
	room.send = message => sent.push(message);
	return { room, transport, states, sent };
}
async function signal(type, connectionId) {
	return await encodeSignal({
		protocol: "logos-webrtc-1", type, connectionId, playerId: "guest",
		playerName: "Guest", description: { type, sdp: "test" },
	});
}

Deno.test("room expiration closes signaling without closing the game transport", async () => {
	const { room, transport, states } = fixture();
	const pending = { connectionId: "pending" };
	transport.pending.set("pending", pending);
	room.pending.set("guest", { connectionId: "pending", answered: false });
	await room.receive({ type: "expired" }, room.socket);
	assert(!room.stopped, "pending handshakes lost their grace period");
	await room.receive({ type: "ended", message: "Invitation expired" }, room.socket);
	assert(room.stopped && room.socket.closed && pending.closed);
	assert(states.at(-1).state == "expired");
});

Deno.test("guest connection releases its signaling socket", () => {
	const { room, states, sent } = fixture("guest");
	room.connected();
	assert(sent.length == 1 && sent[0].type == "done");
	assert(room.stopped && states.at(-1).state == "connected");
	room.connected();
	assert(sent.length == 1);
});

Deno.test("guest departure during ICE gathering cancels the resulting offer", async () => {
	const { room, transport, sent } = fixture();
	const record = { connectionId: "offer-1" };
	transport.pending.set("offer-1", record);
	let finish;
	transport.createInvitation = () => new Promise(resolve => finish = resolve);
	const task = room.receive({ type: "guest", id: "a" }, room.socket);
	await room.receive({ type: "departed", id: "a" }, room.socket);
	finish(await signal("offer", "offer-1"));
	await task;
	assert(record.closed && sent.length == 0);
	assert(room.cancelled.size == 0);
	/* Duplicate close notifications do not accumulate cancellation entries. */
	await room.receive({ type: "departed", id: "a" }, room.socket);
	assert(room.cancelled.size == 0);
});

Deno.test("answers must match the server-assigned guest's offer", async () => {
	const { room, transport } = fixture();
	room.pending.set("a", { connectionId: "offer-a", answered: false });
	const answer = await signal("answer", "offer-b");
	let rejected = false;
	try { await room.receive({ type: "answer", id: "a", signal: answer }, room.socket); }
	catch (_) { rejected = true; }
	assert(rejected && !transport.answer);
});

Deno.test("leaving signaling preserves handshakes whose answers already arrived", () => {
	const { room, transport } = fixture();
	const record = { connectionId: "a" };
	transport.pending.set("a", record);
	room.pending.set("guest", { connectionId: "a", answered: true });
	room.finish("expired", "Invitation expired");
	assert(!record.closed);
});

Deno.test("an expired incomplete guest join reports failure instead of waiting forever", async () => {
	const { room, states } = fixture("guest");
	await room.receive({ type: "ended", message: "Invitation expired" }, room.socket);
	assert(room.stopped && states.at(-1).state == "error");
});

Deno.test("reconnecting a host preserves its transport; guests retry their handshake", async () => {
	for (const role of ["host", "guest"]) {
		const { room, transport } = fixture(role);
		let calls = 0;
		room.onRole = () => { calls++; return transport; };
		await room.receive({ type: "joined", role, expiresAt: Date.now() + 10000 }, room.socket);
		assert(calls == (role == "host" ? 0 : 1));
		assert(room.transport === transport);
	}
});

Deno.test("random creation retries occupied names before starting a game session", async () => {
	const { room, states } = fixture();
	room.role = null;
	room.randomName = () => "fresh-olive-grove";
	let connects = 0, sessions = 0;
	room.connect = () => connects++;
	room.onRole = () => sessions++;
	const socket = room.socket;
	await room.receive({ type: "error", code: "ROOM_TAKEN", message: "Taken" }, socket);
	assert(socket.closed && room.name == "fresh-olive-grove");
	assert(connects == 1 && sessions == 0 && !room.stopped && states.length == 0);
});

Deno.test("ordinary joins and server failures do not trigger random-name retries", async () => {
	for (const random of [true, false]) {
		const { room, states } = fixture();
		room.role = null;
		room.randomName = random ? () => { throw new Error("unexpected retry"); } : null;
		await room.receive({ type: "error", code: random ? "OTHER_ERROR" : "ROOM_TAKEN",
			message: "Failed" }, room.socket);
		assert(room.stopped && states.at(-1).state == "error");
	}
});

Deno.test("random room creation stops after sixteen occupied names", async () => {
	const { room, states } = fixture();
	room.role = null;
	room.randomName = () => "occupied";
	let connects = 0;
	room.connect = () => {
		connects++;
		room.socket = { close() {} };
	};
	for (let attempt = 0; attempt < 16; attempt++)
		await room.receive({ type: "error", code: "ROOM_TAKEN" }, room.socket);
	assert(connects == 15 && room.stopped);
	assert(states.at(-1).state == "error");
});
