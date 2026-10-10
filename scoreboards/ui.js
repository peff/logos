(function() {
	const { ScoreboardClient, localDate, compareScores, validId } = LogosScoreboards;
	const modal = document.querySelector("#online-menu");
	const button = document.querySelector("#online-button");
	const query = selector => modal.querySelector(selector);
	const forum = document.querySelector("#forum-menu");
	const view = selector => forum.querySelector(selector);
	let active = modal, trail = [], groupList = [];
	const endpoint = document.querySelector('meta[name="logos-scoreboards-endpoint"]').content;
	const store = new ScoreboardStore("logos-scoreboards:" + endpoint);
	const client = new ScoreboardClient(store, endpoint,
		() => accessRunHistory(null, true));
	let selected, highlightedGroup, date = localDate(), dailyReturn, rendering = 0;
	const difficulties = new Map();
	const groupLabel = group => group.label || "Unnamed group";
	const status = (text, panel = active) => {
		const message = panel.querySelector(".online-status");
		message.textContent = text;
		message.hidden = panel === forum && !text;
	};
	const attempt = fn => async (...args) => {
		try { await fn(...args); } catch (error) { status(error.message); }
	};
	async function render(direction = 0, groupDirection = 0) {
		const generation = ++rendering;
		const groups = (await store.groups()).sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
		if (generation !== rendering) return;
		if (!groups.some(g => g.id === selected)) selected = groups[0]?.id;
		const name = await store.getName();
		if (generation !== rendering) return;
		if (document.activeElement !== query("#online-name")) query("#online-name").value = name;
		const rows = query(".scoreboards-groups");
		// A sync finishing in the background must not replace an active editor.
		if (!rows.contains(document.activeElement) || !document.activeElement.matches("input")) {
			rows.replaceChildren();
			for (const group of groups) {
				const row = document.createElement("li");
				row.dataset.group = group.id;
				if (group.id === highlightedGroup) {
					row.classList.add("scoreboards-group-highlight");
					row.setAttribute("aria-current", "true");
				}
				let saving = Promise.resolve();
				const input = document.createElement("input");
				input.value = group.label;
				input.maxLength = 80;
				input.placeholder = "Unnamed group";
				input.setAttribute("aria-label", "Group label: " + groupLabel(group));
				input.onchange = () => {
					const value = input.value.trim();
					if (/[\u0000-\u001f\u007f]/.test(value)) {
						input.value = group.label;
						status("Use a label without control characters.");
						return;
					}
					input.value = group.label = value;
					row.querySelector("a").href = invitationURL(group);
					saving = saving.then(() => store.rename(group.id, value)).then(() => status(""))
						.catch(error => status(error.message));
				};
				input.onkeydown = event => {
					if (event.key === "Enter") { event.preventDefault(); input.blur(); }
				};
				row.append(input);
				const controls = document.createElement("div");
				controls.className = "scoreboards-row-actions";
				for (const [label, title, action, href] of [
					["Forum", "Visit the Forum", () => { selected = group.id; show(forum); }],
					["Invite", "Copy invitation URL to the clipboard", () => copyInvitation(group), invitationURL(group)],
					["Leave", "Leave this group", () => leave(group)],
				]) {
					const control = document.createElement(href ? "a" : "button");
					if (href) control.href = href;
					else control.type = "button";
					control.textContent = label;
					control.title = title;
					control.setAttribute("aria-label", label + ": " + groupLabel(group));
					const activate = attempt(async () => { await saving; await action(); });
					control.onclick = href ? event => handleLinkClick(event, activate) : activate;
					if (controls.children.length) {
						const separator = document.createElement("span");
						separator.className = "scoreboards-action-separator";
						separator.textContent = "·";
						separator.setAttribute("aria-hidden", "true");
						controls.append(separator);
					}
					controls.append(control);
				}
				row.append(controls);
				rows.append(row);
			}
		}
		groupList = groups;
		const index = groups.findIndex(g => g.id === selected);
		const navigation = view(".forum-groups");
		const hadFocus = navigation.contains(document.activeElement);
		const circular = groups.length > 3;
		navigation.classList.toggle("forum-groups-circular", circular);
		navigation.replaceChildren();
		const visible = circular ? [-1, 0, 1].map(step => ({
			group: groups[(index + step + groups.length) % groups.length], step,
		})) : groups.map((group, position) => ({ group, step: position - index }));
		for (const { group, step } of visible) {
			const control = document.createElement("button");
			control.type = "button";
			control.dataset.step = step;
			control.textContent = (circular && step < 0 ? "‹ " : "") + groupLabel(group) + (circular && step > 0 ? " ›" : "");
			control.disabled = groups.length === 1;
			control.title = groupLabel(group);
			control.setAttribute("aria-current", String(group.id === selected));
			control.setAttribute("aria-label", (group.id === selected ? "Current group: " : "View ") + groupLabel(group));
			control.onclick = attempt(() => moveGroup(step));
			navigation.append(control);
		}
		if (hadFocus) {
			const current = navigation.querySelector('[aria-current="true"]');
			(current && !current.disabled ? current : navigation).focus({ preventScroll: true });
		}
		if (circular && groupDirection && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
			const distance = navigation.clientWidth / 3;
			for (const control of navigation.children) control.animate([
				{ transform: `translateX(${groupDirection * distance}px)`, opacity: 0 },
				{ transform: "translateX(0)", opacity: 1 },
			], { duration: 220, easing: "ease-out" });
		}
		view(".forum-no-groups").hidden = !!selected;
		view("table").hidden = !selected;
		view(".scoreboards-date").hidden = !selected;
		view(".forum-difficulty").hidden = !selected;
		if (!selected) {
			view(".scoreboards-empty").hidden = true;
			return;
		}
		renderDailyTitle(view(".scoreboards-date"), date, (value, movement) => { date = value; render(movement).catch(e => status(e.message)); }, direction);
		const attemptLink = view(".forum-attempt");
		if (!forum.hidden) {
			const result = await puzzle.getDailyResult(date);
			if (generation !== rendering) return;
			attemptLink.disabled = true;
			if (result === null) {
				attemptLink.textContent = "Chronicle unavailable";
			} else if (!result) {
				attemptLink.textContent = "Your attempt awaits.";
				attemptLink.disabled = false;
			} else {
				if (!result.difficulty && !difficulties.has(date)) {
					if (difficulties.size >= 128) difficulties.delete(difficulties.keys().next().value);
					difficulties.set(date, puzzleDifficulty(puzzleFromSeed(parseSeed(date))).level);
				}
				const level = result.difficulty || difficulties.get(date);
				attemptLink.textContent = level[0].toUpperCase() + level.slice(1) + " difficulty";
			}
		}
		const records = await store.records(selected);
		const uploads = await store.uploads(selected);
		if (generation !== rendering) return;
		const ids = new Set(records.map(record => record.id));
		const entries = records.concat(uploads.filter(item => !ids.has(item.record.id)).map(item => ({ ...item.record, pending: !item.sent })));
		const body = view("tbody"); body.replaceChildren();
		for (const record of entries.filter(r => r.date === date).sort(compareScores)) {
			const row = document.createElement("tr");
			for (const text of [record.name, record.outcome === "won" ? "Win" : "Loss",
				record.elapsed === null ? "" : formatTime(record.elapsed), ""]) {
				const cell = document.createElement("td"); cell.textContent = text; row.append(cell);
			}
			const pending = document.createElement("span");
			pending.textContent = "Awaiting sync";
			pending.style.visibility = record.pending ? "visible" : "hidden";
			row.lastElementChild.append(pending);
			if (record.elapsed === null) {
				row.children[2].title = "Untimed completion";
				row.children[2].innerHTML = '<svg class="history-infinity" viewBox="0 0 40 20" ' +
					'role="img" aria-label="Untimed completion" focusable="false">' +
					'<use href="#infinity-shape"/></svg>';
			}
			body.append(row);
		}
		view(".scoreboards-empty").hidden = !!body.children.length;
		if (groupDirection && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
			view(".forum-results").animate([
				{ transform: `translateX(${groupDirection * 1.5}rem)`, opacity: 0 },
				{ transform: "translateX(0)", opacity: 1 },
			], { duration: 220, easing: "ease-out" });
		}
	}
	async function moveGroup(step) {
		const index = groupList.findIndex(group => group.id === selected);
		const next = groupList[(index + step + groupList.length) % groupList.length];
		if (!next || next.id === selected || !step) return;
		selected = next.id;

		await render(0, step);
	}
	function show(destination) {
		if (active === destination) return;
		active.hidden = true;
		if (trail.at(-1) === destination) trail.pop();
		else trail.push(active);
		active = destination;
		if (active === modal) status("", modal);
		active.hidden = false;
		if (active === forum) refreshForum().catch(error => status(error.message, forum));
		active.querySelector(".modal-close").focus();
	}
	async function refreshForum() {
		await render();
		await sync();
	}
	async function sync() {
		try {
			await client.sync(); status("", forum);
		} catch (error) {
			status(error.message, forum);
		}
		await render();
	}
	async function open(fromDaily = false) {
		const destination = fromDaily && (await store.groups()).length ? forum : modal;
		highlightedGroup = null;
		date = fromDaily ? puzzle.displayedDailyResult.date : localDate();
		if (fromDaily) {
			dailyReturn = { result: puzzle.displayedDailyResult, identity: puzzle.gameIdentity };
			puzzle.closeDailyResult(true);
		} else {
			dailyReturn = null;
			if (!puzzle.options.hidden) puzzle.toggleOptions();
		}
		trail = [];
		active = destination;
		if (active === modal) status("", modal);
		if (active.hidden) puzzle.toggleModal(active, button, "Close");
		await render();
		active.querySelector(".modal-close").focus();
		if (active === forum) await sync();
	}
	function close() {
		if (trail.length) { show(trail.at(-1)); return; }
		if (!active.hidden) puzzle.toggleModal(active, button, "Close");
		if (dailyReturn && dailyReturn.identity === puzzle.gameIdentity) puzzle.showDailyResult(dailyReturn.result);
		dailyReturn = null;
	}
	view(".forum-attempt").onclick = attempt(async () => {
		const identity = puzzle.gameIdentity;
		view(".forum-attempt").disabled = true;
		puzzle.toggleModal(forum, button, "Close");
		if (await puzzle.openDaily(date)) {
			trail = [];
			dailyReturn = null;
		} else if (puzzle.gameIdentity === identity) {
			puzzle.toggleModal(forum, button, "Close");
			status("The daily puzzle could not be opened.");
			await render();
		}
	});
	new MutationObserver(() => {
		document.querySelector("#friends-roster-button").setAttribute("aria-expanded", String(!modal.hidden));
	}).observe(modal, { attributes: true, attributeFilter: ["hidden"] });
	puzzle.toggleOnline = attempt(async () => {
		if (!modal.hidden) close();
		else if (!forum.hidden) show(modal);
		else await open();
	});
	button.onclick = attempt(() => open());
	document.querySelector(".daily-scoreboards").onclick = attempt(() => open(true));
	for (const panel of [modal, forum]) {
		panel.querySelector(".modal-close").onclick = close;
		panel.addEventListener("click", event => { if (event.target === panel) close(); });
	}
	view(".forum-manage").onclick = () => show(modal);
	let touch;
	view(".forum-results").addEventListener("pointerdown", event => {
		if (event.pointerType === "touch") touch = { x: event.clientX, y: event.clientY };
	});
	view(".forum-results").addEventListener("pointercancel", () => { touch = null; });
	view(".forum-results").addEventListener("pointerup", event => {
		if (!touch) return;
		const dx = event.clientX - touch.x, dy = event.clientY - touch.y; touch = null;
		if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
			const arrow = view(dx < 0 ? ".daily-next" : ".daily-previous");
			if (arrow && !arrow.disabled) arrow.click();
		}
	});
	query("#online-name").onchange = attempt(async event => {
		const input = event.target, name = input.value.trim();
		if (name.length > 32 || /[\u0000-\u001f\u007f]/.test(name)) {
			input.value = await store.getName();
			throw new Error("Use a name of up to 32 characters without control characters.");
		}
		input.value = name;
		await store.setName(name);
		status("");
		input.dispatchEvent(new Event("online-name-change"));
	});
	query("#online-name").onkeydown = event => {
		if (event.key === "Enter") { event.preventDefault(); event.target.blur(); }
	};
	query(".scoreboards-create").onclick = attempt(async () => {
		const group = await client.join(crypto.randomUUID(), "");
		await render();
		query(`.scoreboards-groups li[data-group="${group.id}"] input`).focus();
	});
	query(".scoreboards-editor").onsubmit = attempt(async event => {
		event.preventDefault();
		let id = query("#scoreboard-invite").value.trim(), label = "";
		if (!validId(id)) {
			try {
				const params = new URLSearchParams(new URL(id).hash.slice(1));
				id = params.get("scoreboard");
				label = (params.get("label") || "").slice(0, 80);
			} catch (_) { /* Validation below. */ }
		}
		if (!validId(id)) throw new Error("Enter a valid group key or invitation link.");
		await join(id, label);
	});
	async function join(id, label) {
		const existing = await store.group(id);
		if (!existing) await client.join(id, label);
		selected = id;
		highlightedGroup = id;
		query("#scoreboard-invite").value = "";
		status(existing ? "You already belong to this group." : "");
		await render();
		query(`.scoreboards-groups li[data-group="${id}"]`).scrollIntoView({ block: "nearest" });
	}
	async function leave(group) {
		const [records, uploads] = await Promise.all([store.records(group.id), store.uploads(group.id)]);
		if ((records.length || uploads.length) && !confirm(`Leave ${groupLabel(group)}? Published scores remain, but this browser will stop sharing new results.`)) return;
		await store.leave(group.id);
		await render(); status("Group left.");
	}
	function invitationURL(group) {
		const url = new URL(location.href);
		url.hash = new URLSearchParams({ scoreboard: group.id, label: group.label }).toString();
		return url.href;
	}
	async function copyInvitation(group) {
		const url = invitationURL(group);
		try { await navigator.clipboard.writeText(url); status("Invitation copied to clipboard."); }
		catch (_) { window.prompt("Copy this group invitation:", url); }
	}
	for (const panel of [modal, forum]) panel.addEventListener("keydown", event => {
		if (event.key === "Tab") {
			const controls = [...panel.querySelectorAll("button, a[href], input, select, [tabindex]")].filter(c => !c.disabled && c.tabIndex !== -1 && c.getClientRects().length && getComputedStyle(c).visibility !== "hidden");
			const index = controls.indexOf(document.activeElement);
			if (controls.length) { event.preventDefault(); controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus(); }
		}
		if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) &&
		    !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
		    !event.target.isContentEditable && !event.target.matches("input, select, textarea")) {
			if (panel !== forum) return;
			event.preventDefault();
			event.stopPropagation();
			view(".forum-results").focus({ preventScroll: true });
			if (event.key === "ArrowUp" || event.key === "ArrowDown") {
				attempt(() => moveGroup(event.key === "ArrowUp" ? -1 : 1))();
			} else {
				const arrow = view(event.key === "ArrowLeft" ? ".daily-previous" : ".daily-next");
				if (arrow && !arrow.disabled) arrow.click();
			}
		}
	});
	// Reconcile from the Chronicle to recover a completion interrupted before queueing.
	puzzle.dailyScoreSaved = () => { sync().catch(e => status(e.message, forum)); };
	const poll = () => {
		if (!forum.hidden && !document.hidden && navigator.onLine)
			sync().catch(e => status(e.message, forum));
	};
	window.addEventListener("online", poll);
	setInterval(poll, 5 * 60 * 1000);
	async function invitation() {
		const params = new URLSearchParams(location.hash.slice(1));
		const id = params.get("scoreboard");
		if (!id) return;
		if (validId(id) && await store.group(id)) return;
		await open();
		if (!validId(id)) { status("Invalid group invitation."); return; }
		await join(id, (params.get("label") || "").slice(0, 80));
	}
	window.addEventListener("hashchange", () => invitation().catch(e => status(e.message)));
	puzzle.onlineReady = store.getName().then(name => { query("#online-name").value = name; })
		.catch(e => status(e.message, modal));
	puzzle.onlineReady.then(invitation).catch(e => status(e.message));
})();
