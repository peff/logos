import { RendezvousRoom, normalizeRoomName, validRoomName } from "./rooms.js";

function assert(value, message = "assertion failed") {
	if (!value) throw new Error(message);
}
function socket() {
	return {
		readyState: 1, messages: [], state: { role: "pending", deadline: Date.now() + 10000 },
		serializeAttachment(state) { this.state = structuredClone(state); },
		deserializeAttachment() { return structuredClone(this.state); },
		send(raw) { this.messages.push(JSON.parse(raw)); },
		close() { this.readyState = 3; },
	};
}
async function fixture() {
	const sockets = [], data = new Map();
	const ctx = {
		getWebSockets: () => sockets,
		blockConcurrencyWhile: fn => fn(),
		storage: {
			get: key => data.get(key),
			put: (key, value) => data.set(key, structuredClone(value)),
			delete: key => data.delete(key),
			setAlarm: time => data.set("alarm", time),
			deleteAlarm: () => data.delete("alarm"),
		},
	};
	let room = new RendezvousRoom(ctx);
	await Promise.resolve();
	return {
		get room() { return room; }, data,
		async wake() { room = new RendezvousRoom(ctx); await Promise.resolve(); },
		async join(token, extra = {}) {
			const ws = socket();
			sockets.push(ws);
			await room.webSocketMessage(ws, JSON.stringify({ type: "join", token, ...extra }));
			return ws;
		},
		send: (ws, message) => room.webSocketMessage(ws, JSON.stringify(message)),
	};
}
const hostToken = "a".repeat(64), guestToken = "b".repeat(64);

Deno.test("room names normalize readable links and reject invalid names", () => {
	assert(normalizeRoomName(" Amber Olive-Symposium ") == "amber-olive-symposium");
	for (const name of ["amber-olive", "a", "123"]) assert(validRoomName(name));
	for (const name of ["", "../x", "a/b", "a--b", "é", "a".repeat(65)])
		assert(!validRoomName(name));
});

Deno.test("first arrival hosts, subsequent arrivals get separate routed handshakes", async () => {
	const f = await fixture();
	const host = await f.join(hostToken);
	const a = await f.join(guestToken), b = await f.join("c".repeat(64));
	assert(host.messages[0].role == "host");
	assert(a.messages[0].role == "guest" && b.messages[0].role == "guest");
	assert(a.state.id != b.state.id);
	await f.send(host, { type: "offer", id: a.state.id, signal: "offer-a" });
	assert(a.messages.at(-1).signal == "offer-a");
	assert(b.messages.length == 1);
	await f.send(a, { type: "answer", signal: "answer-a" });
	assert(host.messages.at(-1).signal == "answer-a");
	assert(host.messages.at(-1).id == a.state.id);
	await f.send(b, { type: "answer", signal: "unsolicited" });
	assert(b.messages.at(-1).type == "error");
});

Deno.test("hibernation retains ownership, expiration, and routing state", async () => {
	const f = await fixture();
	const host = await f.join(hostToken), guest = await f.join(guestToken);
	const expiresAt = f.room.room.expiresAt;
	await f.wake();
	assert(f.room.room.expiresAt == expiresAt);
	await f.send(host, { type: "offer", id: guest.state.id, signal: "offer" });
	await f.wake();
	await f.send(guest, { type: "answer", signal: "answer" });
	assert(host.messages.at(-1).signal == "answer");
});

Deno.test("host reconnect keeps ownership and retries unfinished guests", async () => {
	const f = await fixture();
	const host = await f.join(hostToken), guest = await f.join(guestToken);
	host.close();
	await f.room.webSocketClose(host);
	const stranger = await f.join("c".repeat(64));
	assert(stranger.messages.at(-1).type == "error");
	const resumed = await f.join(hostToken, { resume: true });
	assert(resumed.messages.at(-1).role == "host");
	assert(guest.readyState == 3);
	assert(!f.room.room.missingUntil);
});

Deno.test("a guest cannot impersonate the host or renew into another game", async () => {
	const f = await fixture();
	await f.join(hostToken);
	const renewal = await f.join(guestToken, { hostOnly: true });
	assert(renewal.messages.at(-1).type == "error");
	const guest = await f.join(guestToken);
	await f.send(guest, { type: "leave" });
	assert(f.room.room && guest.messages.at(-1).type == "error");
});

Deno.test("expiration rejects arrivals, allows pending answers, then clears storage", async () => {
	const f = await fixture();
	const host = await f.join(hostToken), guest = await f.join(guestToken);
	await f.send(host, { type: "offer", id: guest.state.id, signal: "offer" });
	f.room.room.expiresAt = Date.now() - 1;
	await f.room.alarm();
	assert(host.messages.at(-1).type == "expired");
	const late = await f.join("c".repeat(64));
	assert(late.messages.at(-1).type == "error");
	await f.send(guest, { type: "answer", signal: "answer" });
	assert(host.messages.at(-1).signal == "answer");
	f.room.room.expiresAt = Date.now() - 31000;
	await f.room.alarm();
	assert(!f.data.has("room"));
	assert(host.readyState == 3 && guest.readyState == 3);
	const next = await f.join(guestToken);
	assert(next.messages.at(-1).role == "host");
});

Deno.test("ending invitations releases the name without granting old credentials control", async () => {
	const f = await fixture();
	const host = await f.join(hostToken);
	await f.send(host, { type: "leave" });
	assert(!f.data.has("room"));
	const next = await f.join(guestToken);
	assert(next.messages.at(-1).role == "host");
	const old = await f.join(hostToken, { resume: true });
	assert(old.messages.at(-1).type == "error");
});

Deno.test("pending sockets and silent guests have bounded lifetimes", async () => {
	const f = await fixture();
	const host = await f.join(hostToken), guest = await f.join(guestToken);
	guest.state.deadline = Date.now() - 1;
	await f.room.alarm();
	assert(guest.readyState == 3);
	assert(host.messages.at(-1).type == "departed");
	host.close();
	await f.room.webSocketClose(host);
	f.room.room.missingUntil = Date.now() - 1;
	await f.room.alarm();
	assert(!f.data.has("room") && !f.data.has("alarm"));
});

Deno.test("binary and oversized signaling messages are rejected", async () => {
	for (const raw of [new ArrayBuffer(1), "x".repeat(32769), "{"]) {
		const f = await fixture();
		const host = await f.join(hostToken);
		await f.room.webSocketMessage(host, raw);
		assert(host.readyState == 3);
		assert(host.messages.at(-1).type == "error");
	}
});
