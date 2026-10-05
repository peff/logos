/* Signaling only: established games do not depend on this room. */
const lifetime = 15 * 60 * 1000;
const grace = 30000;
const handshake = 60000;
const maxSockets = 17;
const maxMessage = 32768;

export function normalizeRoomName(name) {
	return typeof name == "string" ?
		name.trim().toLowerCase().replace(/\s+/g, "-") : "";
}

export function validRoomName(name) {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && name.length <= 64;
}

export class RendezvousRoom {
	constructor(ctx) {
		this.ctx = ctx;
		this.room = null;
		ctx.blockConcurrencyWhile(async () => {
			this.room = await ctx.storage.get("room") || null;
		});
	}

	sockets() {
		return this.ctx.getWebSockets().filter(ws => ws.readyState === 1);
	}

	send(ws, message) {
		ws.send(JSON.stringify(message));
	}

	host() {
		return this.sockets().find(ws => ws.deserializeAttachment()?.role == "host");
	}

	async save() {
		if (this.room) await this.ctx.storage.put("room", this.room);
		else await this.ctx.storage.delete("room");
		await this.schedule();
	}

	async schedule() {
		const times = this.sockets().map(ws => ws.deserializeAttachment()?.deadline)
			.filter(Boolean);
		if (this.room) {
			times.push(this.room.expired ? this.room.expiresAt + grace : this.room.expiresAt);
			if (this.room.missingUntil) times.push(this.room.missingUntil);
		}
		if (times.length) await this.ctx.storage.setAlarm(Math.min(...times));
		else await this.ctx.storage.deleteAlarm();
	}

	async reset(reason) {
		for (const ws of this.sockets()) {
			this.send(ws, { type: "ended", message: reason });
			ws.close(1000, reason);
		}
		this.room = null;
		await this.save();
	}

	async sweep() {
		const now = Date.now();
		if (this.room && (now >= this.room.expiresAt + grace ||
		    this.room.missingUntil && now >= this.room.missingUntil)) {
			await this.reset("Invitation expired");
			return;
		}
		if (this.room && now >= this.room.expiresAt && !this.room.expired) {
			this.room.expired = true;
			for (const ws of this.sockets())
				this.send(ws, { type: "expired" });
			await this.save();
		}
		for (const ws of this.sockets()) {
			const state = ws.deserializeAttachment();
			if (state.deadline && now >= state.deadline) {
				this.send(ws, { type: "error", message: "Connection attempt timed out" });
				ws.close(1000, "Timed out");
				this.notifyDeparture(state);
			}
		}
		if (this.room?.expired && !this.sockets().some(ws =>
		    ws.deserializeAttachment().role == "guest"))
			await this.reset("Invitation expired");
		await this.schedule();
	}

	async fetch(request) {
		return this.ctx.blockConcurrencyWhile(async () => {
			await this.sweep();
			if (this.sockets().length >= maxSockets)
				return new Response("Room is busy", { status: 429 });
			const [client, server] = Object.values(new WebSocketPair());
			this.ctx.acceptWebSocket(server);
			server.serializeAttachment({ role: "pending", deadline: Date.now() + 10000 });
			await this.schedule();
			return new Response(null, { status: 101, webSocket: client });
		});
	}

	async webSocketMessage(ws, raw) {
		return this.ctx.blockConcurrencyWhile(async () => {
			await this.sweep();
			if (ws.readyState !== 1) return;
			try {
				if (typeof raw != "string" || raw.length > maxMessage)
					throw new Error("Invalid signaling message");
				const message = JSON.parse(raw);
				const state = ws.deserializeAttachment();
				if (state.role == "pending") {
					if (message.type != "join" || typeof message.token != "string" ||
					    !/^[a-f0-9]{64}$/.test(message.token))
						throw new Error("Invalid room credentials");
					if (!this.room) {
						if (message.guestOnly) throw new Error("The host is no longer here");
						this.room = { token: message.token, expiresAt: Date.now() + lifetime };
					} else if (message.token != this.room.token &&
					           (message.hostOnly || message.resume)) {
						throw new Error("That room already belongs to another gathering");
					}
					if (this.room.expired) throw new Error("Invitation expired");
					if (message.token == this.room.token) {
						const previous = this.host();
						if (previous && previous !== ws) previous.close(1000, "Reconnected");
						ws.serializeAttachment({ role: "host" });
						delete this.room.missingUntil;
						/* Retry incomplete offers after a signaling interruption. */
						for (const guest of this.sockets()) {
							const data = guest.deserializeAttachment();
							if (data.role == "guest") {
								guest.close(1012, "Host reconnected; retry");
								this.notifyDeparture(data);
							}
						}
						this.send(ws, { type: "joined", role: "host", expiresAt: this.room.expiresAt });
					} else {
						const host = this.host();
						if (!host) throw new Error("The host is reconnecting; try again shortly");
						const id = crypto.randomUUID();
						ws.serializeAttachment({ role: "guest", id, stage: "offer",
							deadline: Math.min(Date.now() + handshake, this.room.expiresAt + grace) });
						this.send(ws, { type: "joined", role: "guest", expiresAt: this.room.expiresAt });
						this.send(host, { type: "guest", id });
					}
					await this.save();
				} else if (state.role == "host" && message.type == "leave") {
					await this.reset("Invitations closed");
				} else if (state.role == "host" && message.type == "reject") {
					const guest = this.sockets().find(s => s.deserializeAttachment().id == message.id);
					if (guest) {
						this.send(guest, { type: "error", message: "The handshake failed. Try joining again." });
						guest.close(1000, "Handshake failed");
					}
				} else if (state.role == "host" && message.type == "offer") {
					const guest = this.sockets().find(s => s.deserializeAttachment().id == message.id);
					if (!guest) return; // A cancelled attempt may finish gathering ICE.
					const data = guest.deserializeAttachment();
					if (data.stage != "offer" || typeof message.signal != "string")
						throw new Error("Unexpected offer");
					data.stage = "answer";
					guest.serializeAttachment(data);
					this.send(guest, { type: "offer", signal: message.signal });
				} else if (state.role == "guest" && message.type == "answer") {
					if (state.stage != "answer" || typeof message.signal != "string")
						throw new Error("Unexpected answer");
					const host = this.host();
					if (!host) throw new Error("The host is reconnecting");
					state.stage = "connecting";
					ws.serializeAttachment(state);
					this.send(host, { type: "answer", id: state.id, signal: message.signal });
				} else if (state.role == "guest" && message.type == "done") {
					ws.close(1000, "Connected");
					this.notifyDeparture(state);
				} else {
					throw new Error("Unexpected signaling message");
				}
			} catch (error) {
				this.send(ws, { type: "error", message: error instanceof SyntaxError ?
					"Invalid signaling message" : error.message });
				ws.close(1008, "Invalid request");
			}
		});
	}

	notifyDeparture(state) {
		const host = this.host();
		if (state.role == "guest" && host)
			this.send(host, { type: "departed", id: state.id });
	}

	async webSocketClose(ws) {
		return this.ctx.blockConcurrencyWhile(async () => {
			const state = ws.deserializeAttachment();
			if (state.role == "host" && this.room && !this.host())
				this.room.missingUntil ||= Date.now() + grace;
			this.notifyDeparture(state);
			await this.save();
			await this.sweep();
		});
	}

	async webSocketError(ws) {
		ws.close(1011, "Connection lost");
		await this.webSocketClose(ws);
	}

	async alarm() {
		return this.ctx.blockConcurrencyWhile(() => this.sweep());
	}
}
