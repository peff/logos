/* Increment when changes to puzzle generation alter the meaning of a seed. */
var puzzleGeneratorVersion = 1;

/* Increment when the difficulty formula, route policy/count, or cutoffs change. */
var puzzleDifficultyVersion = 1;
var extremeDifficultyVersion = 1;

const difficultyLevels = ["easy", "medium", "hard"];
const pantheonLevels = ["all", ...difficultyLevels];

/* Handle ordinary link activation in-page, leaving browser gestures alone. */
function handleLinkClick(event, action) {
	if (event.defaultPrevented || event.button !== 0 || event.ctrlKey ||
	    event.metaKey || event.shiftKey || event.altKey)
		return;
	event.preventDefault();
	action();
}

var defaultSymbols = [
	["1", "2", "3", "4", "5", "6"],
	["A", "B", "C", "D", "E", "F"],
	["I", "II", "III", "IV", "V", "VI"],
	["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"],
	["△", "▽", "□", "◇", "⬠", "○"],
	["+", "‒", "÷", "x", "=", "√"],
];

/* Symbols are presentation only; puzzle state uses row and value indices. */
function halloweenSymbol(name, label) {
	return { label: label, src: "images/tiles/halloween/" + name + ".svg" };
}

var tileSets = {
	classic: defaultSymbols,
	halloween: defaultSymbols.map(function(row, family) {
		if (family != 3)
			return row;
		return [
			["ghost", "Ghost"],
			["bat", "Bat"],
			["witch", "Witch"],
			["candy", "Candy corn"],
			["skull", "Skull"],
			["pumpkin", "Jack-o’-lantern"],
		].map(function(picture) {
			return halloweenSymbol(picture[0], picture[1]);
		});
	}),
};

function symbolsForDate(date = new Date()) {
	if (date.getMonth() != 9 || date.getDate() < 26)
		return defaultSymbols;
	var revealed = date.getDate() - 25;
	return defaultSymbols.map(function(row, family) {
		return family == 3 ? row.map(function(symbol, value) {
			return value < revealed ? tileSets.halloween[family][value] : symbol;
		}) : row;
	});
}

function tileSymbolLabel(symbol) {
	return typeof symbol == "string" ? symbol : symbol.label;
}

function renderTileSymbol(elem, symbol) {
	if (typeof symbol == "string") {
		elem.textContent = symbol;
		return;
	}
	var image = document.createElement("img");
	image.className = "tile-image";
	image.src = symbol.src;
	image.alt = symbol.label;
	image.draggable = false;
	elem.replaceChildren(image);
}

var clueArrow = '<span aria-hidden="true">↔</span>';

var extremeStartMessage = "The clues grow scarce. Steel your mind.";

var startMessages = [
	"The ancient puzzle awaits. Let reason be your guide.",
	"The signs are set. The search for truth begins.",
	"The pattern lies hidden. Reveal that which is concealed.",
	"The oracle is silent. Only reason may uncover the truth.",
	"The pieces are before you. Their true order remains veiled.",
	"The mystery is set. Uncover the hidden order.",
	"The veil is drawn. Let the work of deduction begin.",
	"The pattern is broken. Restore the order that lies beneath.",
	"Truth is hidden among the signs. Seek it well.",
];

var falsePlacementMessages = [
	"You have mistaken falsehood for truth. The wisdom of the ancients eludes you.",
	"You have crowned a false answer as truth. The ancients turn away.",
	"You have embraced an illusion as truth. The oracle falls silent.",
	"Your judgment has fixed upon the false. The ancients are unconvinced.",
	"You have chosen the path of error. Wisdom recedes from your grasp.",
	"You have drawn certainty from deceiving signs. The lesson is lost.",
	"Your conclusion does not follow. The philosophers dismiss your proof.",
];

var falseEliminationMessages = [
	"You have cast aside a truth not yet understood. The wisdom of the ancients eludes you.",
	"You have banished a truth from consideration. The ancients turn away.",
	"You have rejected a truth before its hour. The oracle falls silent.",
	"Your judgment has condemned the possible. The ancients are unconvinced.",
	"You have closed a path that led to truth. Wisdom recedes from your grasp.",
	"You have severed a thread that belonged in the pattern. The Fates turn away.",
	"You have excluded what reason still permits. The philosophers dismiss your proof.",
];

function practiceMistakeMessage(discard, clues) {
	if (clues && clues.length)
		return discard ?
			"Removing that possibility contradicts a clue." :
			"That placement contradicts a clue.";
	return discard ?
		"That possibility cannot be discarded." :
		"That placement leads to a contradiction.";
}

var winMessages = [
	"The pattern is revealed. The wisdom of the ancients is yours.",
	"Every sign has found its place. The secrets of the ancients stand revealed.",
	"You have restored the hidden order. The ancients acknowledge your wisdom.",
	"The veil is lifted. What was concealed is now understood.",
	"The final truth falls into place. The oracle speaks your name.",
	"You have mastered the logic of the ancients. The mystery is no more.",
	"The design is complete. Knowledge emerges from the shadows.",
	"All false paths are closed. The one true order remains.",
];

var milestoneMessages = [
	[
		"The first signs align. A hidden order begins to emerge.",
		"The scattered signs begin to speak.",
		"The first seal is broken. The mystery stirs.",
		"The seeds of wisdom take root in hard and stony soil.",
		"The ancients begin to whisper of your deeds.",
		"You have left the shadows, but the light lies still far ahead.",
	],
	[
		"The pattern takes shape. The wisdom of the ancients draws near.",
		"Half of the ancient design stands revealed.",
		"Order rises from uncertainty. The path grows clearer.",
		"The tree of wisdom grows greater.",
		"The whispers of the ancients swell as your journey continues.",
		"Your journey is half done; alea iacta est.",
	],
	[
		"The veil grows thin. Only the final secrets remain.",
		"The final veil trembles. Truth lies close at hand.",
		"Nearly every sign has found its place. The answer awaits.",
		"The branches of the great tree whisper softly in the wind.",
		"The whispers reach a crescendo as you begin the final ascent.",
		"Your journey draws towards its close. Make haste.",
	],
];

var milestoneThresholds = [9, 18, 27];

var puzzleRandom = Math.random;

function randomSeed() {
	if (typeof crypto != "undefined" && crypto.getRandomValues) {
		var value = new Uint32Array(1);
		crypto.getRandomValues(value);
		return value[0];
	}
	return Math.floor(Math.random() * 0x100000000);
}

function seedRandom(seed) {
	var state = seed >>> 0;
	return function() {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

function formatSeed(seed) {
	return seed.toString(16).padStart(8, "0");
}

function dailyDate(date = new Date()) {
	return String(date.getFullYear()).padStart(4, "0") +
		String(date.getMonth() + 1).padStart(2, "0") +
		String(date.getDate()).padStart(2, "0");
}

function validDailyDate(date) {
	if (typeof date != "string" || !/^[0-9]{8}$/.test(date))
		return false;
	var parsed = new Date(Number(date.slice(0, 4)),
		Number(date.slice(4, 6)) - 1, Number(date.slice(6)));
	return dailyDate(parsed) === date;
}

function dailyDateLabel(date) {
	return date.slice(0, 4) + "-" + date.slice(4, 6) + "-" + date.slice(6);
}

function renderDailyTitle(heading, date, selectDate, direction = 0) {
	var day = Number(date.slice(6));
	var suffix = day >= 11 && day <= 13 ? "th" :
		({ 1: "st", 2: "nd", 3: "rd" }[day % 10] || "th");
	var month = new Date(Number(date.slice(0, 4)),
		Number(date.slice(4, 6)) - 1, day).toLocaleString("en-US", { month: "long" });
	var label = document.createElement("span");
	label.className = "daily-date";
	var text = document.createElement("button");
	text.type = "button";
	text.className = "daily-date-link";
	text.title = "Choose another day's puzzle";
	text.textContent = month + " " + day + suffix + ", " + date.slice(0, 4);
	label.appendChild(text);
	var input = document.createElement("input");
	input.type = "date";
	input.value = dailyDateLabel(date);
	input.min = "0100-01-01";
	input.max = dailyDateLabel(dailyDate());
	input.setAttribute("aria-label", "Choose a daily puzzle date");
	input.title = "Choose another day's puzzle";
	input.onchange = function() {
		if (input.validity.valid && input.value)
			return selectDate(input.value.replaceAll("-", ""));
	};
	if (typeof input.showPicker == "function") {
		input.tabIndex = -1;
		input.setAttribute("aria-hidden", "true");
		text.onclick = () => input.showPicker();
	} else {
		label.classList.add("daily-date-fallback");
	}
	label.appendChild(input);
	for (var step of [-1, 1]) {
		var adjacent = dailyDate(new Date(Number(date.slice(0, 4)),
			Number(date.slice(4, 6)) - 1, day + step, 12));
		var arrow = document.createElement("button");
		arrow.type = "button";
		arrow.className = "daily-date-arrow " + (step < 0 ? "daily-previous" : "daily-next");
		arrow.setAttribute("aria-label", step < 0 ? "Previous day's puzzle" : "Next day's puzzle");
		arrow.title = step < 0 ? "Previous day" : "Next day";
		arrow.disabled = !validDailyDate(adjacent) || step > 0 && adjacent > dailyDate();
		arrow.innerHTML = '<svg viewBox="0 0 12 20" aria-hidden="true" focusable="false">' +
			'<path d="M9 3L3 10l6 7"/></svg>';
		arrow.onclick = ((value, movement) => () => selectDate(value, movement))(adjacent, step);
		if (step < 0)
			label.insertBefore(arrow, text);
		else
			label.appendChild(arrow);
	}
	heading.textContent = "";
	heading.appendChild(label);
	if (direction && typeof text.animate == "function" &&
	    !(typeof matchMedia == "function" && matchMedia("(prefers-reduced-motion: reduce)").matches))
		text.animate([
			{ transform: "translateX(" + direction * 0.7 + "em)", opacity: 0 },
			{ transform: "translateX(0)", opacity: 1 },
		], { duration: 240, easing: "ease-out" });
}

/* Undocumented debugging override: #today=YYYY-MM-DD. */
var debugDateActive = false;
function loadURLDate(url) {
	const today = new URLSearchParams(new URL(url).hash.slice(1)).get("today");
	if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today))
		return;
	const NativeDate = window.Date;
	const start = new NativeDate();
	const shifted = new NativeDate(start.getTime());
	const [year, month, day] = today.split("-").map(Number);
	shifted.setFullYear(year, month - 1, day);
	if (shifted.getFullYear() !== year || shifted.getMonth() !== month - 1 ||
	    shifted.getDate() !== day)
		return;
	const offset = shifted.getTime() - start.getTime();
	/* Keep elapsed time ticking, and leave explicitly supplied dates alone. */
	function DebugDate(...args) {
		if (!new.target)
			return new NativeDate(DebugDate.now()).toString();
		return Reflect.construct(NativeDate,
			args.length ? args : [DebugDate.now()], new.target);
	}
	Object.setPrototypeOf(DebugDate, NativeDate);
	DebugDate.prototype = NativeDate.prototype;
	DebugDate.now = () => NativeDate.now() + offset;
	window.Date = DebugDate;
	debugDateActive = true;
}

function parseSeed(seed) {
	if (typeof seed == "number")
		return Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff ?
			seed : null;
	if (typeof seed != "string" || !/^[0-9a-f]{1,8}$/i.test(seed))
		return null;
	return parseInt(seed, 16);
}

function withPuzzleRandom(seed, callback) {
	var oldRandom = puzzleRandom;
	puzzleRandom = seedRandom(seed);
	try {
		return callback();
	} finally {
		puzzleRandom = oldRandom;
	}
}

document.addEventListener('contextmenu', function(ev) {
	if (ev.target && ev.target.closest &&
	    ev.target.closest(".modal, input, textarea, [contenteditable=true]"))
		return;
	ev.preventDefault();
});

/* Track programmatic scrolling without selecting pages passed on the way.
 * Rendering and page selection remain the responsibility of each view.
 */
function NativeScroll(viewport) {
	this.target = null;
	this.cancel = function() {
		this.target = null;
	};
	this.canAnimate = function() {
		return !!viewport.scrollTo && !matchMedia("(prefers-reduced-motion: reduce)").matches;
	};
	this.to = function(left) {
		if (this.canAnimate()) {
			this.target = Math.abs(viewport.scrollLeft - left) > 2 ? left : null;
			viewport.scrollTo({ left: left, behavior: "smooth" });
		} else {
			this.cancel();
			viewport.scrollLeft = left;
		}
	};
	this.settled = function() {
		/* clientWidth rounds fractional page widths to whole pixels. */
		if (this.target != null && Math.abs(viewport.scrollLeft - this.target) > 2)
			return false;
		this.cancel();
		return true;
	};
	/* Direct manipulation takes over from a pending button-driven scroll. */
	for (var event of ["pointerdown", "wheel"])
		viewport.addEventListener(event, () => this.cancel(), { passive: true });
}

function initializeHistoryTable(table) {
	var columns = document.createElement("colgroup");
	var heading = document.createElement("thead");
	heading.className = "history-column-labels";
	var row = document.createElement("tr");
	for (var label of ["Date", "Result", "Time", "Seed", "Difficulty"]) {
		columns.appendChild(document.createElement("col"));
		var cell = document.createElement("th");
		cell.setAttribute("scope", "col");
		cell.textContent = label;
		row.appendChild(cell);
	}
	heading.appendChild(row);
	table.appendChild(columns);
	table.appendChild(heading);
	table.appendChild(document.createElement("tbody"));
}

/* Read a boolean or numeric preference, using the fallback's type. */
function readOption(name, fallback) {
	try {
		var stored = localStorage.getItem(name);
		if (stored !== null)
			return typeof fallback == "boolean" ?
				stored == "true" : Number(stored);
	} catch (e) {
		/* Storage may be unavailable for local files. */
	}
	return fallback;
}

function setDialogOpen(dialog, open) {
	dialog.hidden = !open;
	if (open && !dialog.open)
		dialog.showModal();
	else if (!open)
		dialog.close();
}

function initializeDialog(dialog, close) {
	dialog.addEventListener("cancel", function(event) {
		/* Keep timer and navigation cleanup on the application's close path. */
		event.preventDefault();
		close();
	});
	dialog.addEventListener("click", function(event) {
		if (event.target != dialog)
			return;
		var rect = dialog.getBoundingClientRect();
		if (event.clientX < rect.left || event.clientX >= rect.right ||
		    event.clientY < rect.top || event.clientY >= rect.bottom)
			close();
	});
}

/* Fit portrait clues into the space left by the board and controls. */
function initializePortraitClueLayout() {
	if (typeof ResizeObserver == "undefined")
		return;
	var body = document.body;
	var footer = document.querySelector("#application-footer");
	var portrait = window.matchMedia("(orientation: portrait)");
	function fit() {
		if (!portrait.matches || !body.matches(".game-started:is(" +
		    ".multiplayer, .proof-active, .suppose-active, " +
		    ":has(#proof-controls.hint-explanation))")) {
			body.style.removeProperty("--portrait-clue-scale");
			return;
		}
		var style = getComputedStyle(body);
		var scale = parseFloat(style.getPropertyValue("--portrait-clue-scale"));
		var tracks = style.gridTemplateRows.split(" ").map(parseFloat);
		var clueHeight = (tracks[3] + tracks[4]) / scale;
		var bottom = Math.min(body.getBoundingClientRect().bottom,
			document.documentElement.clientHeight) - parseFloat(style.paddingBottom);
		var spare = bottom - footer.getBoundingClientRect().bottom;
		/* Recover the unscaled height without briefly expanding the clues.
		 * Leave a pixel for grid-track rounding when space is tight. */
		var next = Math.max(0.01, Math.min(1, scale + (spare - 1) / clueHeight));
		if (Math.abs(next - scale) > 0.00001)
			body.style.setProperty("--portrait-clue-scale", next);
	}
	/* Observe only sizes that do not depend on the clue scale, so fitting
	 * the clue tracks does not feed back into the observer. */
	var resize = new ResizeObserver(fit);
	for (var element of document.querySelectorAll(
		"body, #message, #board-container, #board-actions, " +
		"#suppose-controls, #proof-controls, #friends-roster, #application-footer"))
		resize.observe(element);
	new MutationObserver(fit).observe(body, { attributes: true, attributeFilter: ["class"] });
	window.addEventListener("resize", fit);
	fit();
}

/* The tentative board has no DOM or timers. Both solo play and the
 * multiplayer host use this model; the host can maintain branches it is
 * not itself viewing. */
class SupposeModel {
	constructor(puzzle, state = null) {
		this.rows = puzzle.rows;
		this.clues = puzzle.clues;
		this.autoDismissClues = puzzle.autoDismissClues;
		this.suppose = state;
		this.sound = null;
	}

	serialize() {
		return JSON.parse(JSON.stringify(this.suppose, (key, value) =>
			["displayed", "pending"].includes(key) ? undefined : value));
	}

	positionInfo() {
		const state = this.suppose;
		const preceding = state.position ? state.history[state.position - 1] : state.parent;
		return {
			label: state.history[state.position].label,
			previousConflicts: preceding?.sharedConflictMessages || {},
			nested: !!state.parent,
		};
	}

	snapshot() {
		const state = this.suppose;
		const fields = ["base", "domains", "assumption", "sharedConflicts",
			"sharedConflictMessages", "conflictDomains", "conflictTiles", "dismissed",
			"message", "prefix", "position"];
		return JSON.parse(JSON.stringify({
			...Object.fromEntries(fields.map(key => [key, state[key]])),
			...this.positionInfo(),
		}));
	}

	enter() {
		var parent = this.suppose;
		var base = parent ? parent.base : domainsFromSlots(this);
		this.suppose = { base, parent,
			prefix: parent ? parent.history[parent.position].label + "." : "",
			domains: copyDomains(parent ? parent.domains : base), assumption: null,
			sharedConflicts: parent ? parent.sharedConflicts.slice() : [],
			sharedConflictMessages: { ...parent?.sharedConflictMessages },
			conflictDomains: [],
			conflictTiles: parent ? copyDomains(parent.conflictTiles) : base.map(row => row.map(() => 0)),
			displayed: parent?.displayed,
			dismissed: parent ? parent.dismissed.slice() : [],
			history: [], position: -1, message: null };
		this.saveSupposeStep();
	}

	applySupposeAction(slot, symbol, action) {
		var row = this.rows.indexOf(slot.row), column = slot.row.slots.indexOf(slot);
		var domains = this.suppose.domains, bit = 1 << column;
		if (!(domains[row][symbol] & bit) || domains[row][symbol] === bit)
			return;
		var discard = action == "remove" || action == "pencil-remove";
		var first = !this.suppose.assumption;
		if (first)
			this.suppose.assumption = { row, column, symbol, discard };
		this.suppose.message = this.supposeMoveMessage({ row, column, symbol, discard }, first);
		var before = domains[row].slice();
		applyPencilMark(domains[row], { slot, value: symbol, discard });
		propagatePencilRow(domains[row]);
		var placed = domains[row].some((bits, v) => bits && !(bits & (bits - 1)) &&
			bits != before[v]);
		this.sound = placed ? "place" : "discard";
		this.dismissSupposeClues();
		this.saveSupposeStep({ row, column, symbol, discard });
	}

	toggleSupposeClue(clue) {
		var index = this.clues.indexOf(clue), dismissed = this.suppose.dismissed;
		if (dismissed.includes(index))
			this.suppose.dismissed = dismissed.filter(i => i !== index);
		else {
			dismissed.push(index);
			this.sound = "clue";
		}
		/* Clue bookkeeping belongs to this position, not a new proof step. */
		this.suppose.history[this.suppose.position].dismissed = this.suppose.dismissed.slice();
	}

	moveSuppose(offset) {
		var state = this.suppose;
		var position = Math.max(0, Math.min(state.history.length - 1, state.position + offset));
		if (position == state.position)
			return;
		var step = state.history[position];
		Object.assign(state, { position, domains: copyDomains(step.domains),
			sharedConflicts: step.sharedConflicts.slice(),
			sharedConflictMessages: { ...step.sharedConflictMessages },
			conflictDomains: step.conflictDomains.map(row => row?.slice()),
			conflictTiles: copyDomains(step.conflictTiles),
			assumption: step.assumption, dismissed: step.dismissed.slice(), message: step.message });
	}

	keep() {
		var state = this.suppose;
		var steps = state.history.slice(1, state.position + 1);
		var parent = state.parent;
		parent.history.length = parent.position + 1;
		for (var step of steps)
			parent.history.push({ ...step, assumption: parent.assumption,
				label: parent.prefix + parent.history.length,
				message: this.supposeMoveMessage(step.move) });
		parent.position = parent.history.length - 1;
		parent.domains = copyDomains(state.domains);
		parent.sharedConflicts = state.sharedConflicts.slice();
		parent.sharedConflictMessages = { ...state.sharedConflictMessages };
		parent.conflictDomains = state.conflictDomains.map(row => row?.slice());
		parent.conflictTiles = copyDomains(state.conflictTiles);
		parent.dismissed = state.dismissed.slice();
		parent.message = parent.history[parent.position].message;
		parent.history[parent.position].dismissed = parent.dismissed.slice();
		this.suppose = parent;
		this.sound = "clue";
	}

	rewindStep() {
		var target = this.supposeRewindTarget();
		if (!target) return false;
		while (this.suppose !== target.state && !this.suppose.position)
			this.suppose = this.suppose.parent;
		if (this.suppose !== target.state || this.suppose.position > target.position)
			this.moveSuppose(-1);
		this.suppose.history.length = this.suppose.position + 1;
		return this.suppose !== target.state || this.suppose.position > target.position;
	}

	reconcile() {
		var base = domainsFromSlots(this);
		var merge = position => {
			position.domains = position.domains.map((row, r) => {
				var merged = row.map((bits, v) => bits & base[r][v]);
				var conflict = propagatePencilRow(merged);
				if (!position.conflictDomains[r]) {
					if (!conflict || propagatePencilRow(row.slice()))
						return merged;
					/* Keep the tentative row as evidence. The displayed
					 * domains continue following the shared board, but
					 * must not erase guesses contradicted by later moves. */
					position.conflictDomains[r] = row.slice();
					position.sharedConflicts[r] = true;
				}
				var tentativeRow = position.conflictDomains[r];
				var combined = tentativeRow.map((bits, v) => bits & base[r][v]);
				propagatePencilRow(combined);
				var mark = (v, bits, action, explanation, placementMessage = null) => {
					position.conflictTiles[r][v] |= bits;
					for (var c = 0; c < row.length; c++) {
						if (!(bits & (1 << c)))
							continue;
						var key = r + ":" + v + ":" + c;
						if (placementMessage)
							position.sharedConflictMessages[key] = placementMessage;
						else
							position.sharedConflictMessages[key] ||=
								"Another player " + action + " " + proofSymbolReference(this, r, v) +
								(action == "placed" ? " in" : " from") + " column " + (c + 1) +
								"; " + explanation;
					}
				};
				for (var v = 0; v < row.length; v++) {
					var tentative = tentativeRow[v], shared = base[r][v];
					if (tentative && !(tentative & (tentative - 1)) &&
					    shared && !(shared & (shared - 1)) && tentative != shared) {
						var message = "You placed " + proofSymbolReference(this, r, v) +
							" in column " + (Math.log2(tentative) + 1) +
							"; another player placed it in column " + (Math.log2(shared) + 1) + ".";
						mark(v, tentative | shared, null, null, message);
						continue;
					}
					if (tentative && !(tentative & (tentative - 1)) && !(tentative & shared))
						mark(v, tentative, "discarded", "you had placed it there.");
					if (shared && !(shared & (shared - 1)) && !(tentative & shared))
						mark(v, shared, "placed", "you had discarded it there.");
				}
				/* Exhausting a domain does not mean each former candidate
				 * was a supposed placement. Only outline the definite
				 * placement/discard contradictions above. */
				if (!position.conflictTiles[r].some(Boolean)) {
					var symbol = combined.findIndex(bits => !bits);
					position.sharedConflictMessages[r + ":row"] ||= symbol >= 0 ?
						"Another player's moves leave no place for " +
						proofSymbolReference(this, r, symbol) + " in your supposition." :
						"Another player's moves conflict with this row's supposed possibilities.";
				}
				return merged;
			});
		};
		for (var state = this.suppose; state; state = state.parent) {
			state.base = base;
			merge(state);
			for (var step of state.history)
				merge(step);
			/* Shared actions may have repainted hypothetical tiles. */
			state.displayed = null;
		}
	}

	saveSupposeStep(move = null) {
		var state = this.suppose;
		state.history.length = state.position + 1;
		var label = state.prefix + (state.position + 1);
		state.history.push({ label, domains: copyDomains(state.domains),
			sharedConflicts: state.sharedConflicts.slice(),
			sharedConflictMessages: { ...state.sharedConflictMessages },
			conflictDomains: state.conflictDomains.map(row => row?.slice()),
			conflictTiles: copyDomains(state.conflictTiles),
			assumption: state.assumption, dismissed: state.dismissed.slice(),
			message: state.message, move });
		state.position++;
	}

	supposeMoveMessage({ row, column, symbol, discard }, first = false) {
		return (first ? "Suppose " : discard ? "Discard " : "Place ") +
			proofSymbolReference(this, row, symbol) +
			(first ? (discard ? " is not in column " : " is in column ") :
			 discard ? " from column " : " in column ") + (column + 1) + ".";
	}

	supposeClueSatisfied(clue) {
		var domains = this.suppose.domains;
		var variables = clueSlots(clue).map(slot => ({
			row: this.rows.indexOf(slot.row), symbol: slot.value,
		}));
		if (!variables.length || !variables.every(({ row, symbol }) => {
			var bits = domains[row][symbol];
			return bits && !(bits & (bits - 1));
		}))
			return null;
		var trial = copyDomains(domains);
		clue.constrain(trial, (1 << trial[0].length) - 1);
		return variables.every(({ row, symbol }) => trial[row][symbol] != 0);
	}

	dismissSupposeClues() {
		if (!this.autoDismissClues)
			return;
		var state = this.suppose;
		for (var [index, clue] of this.clues.entries()) {
			if (!clue.display || !clue.active || state.dismissed.includes(index))
				continue;
			if (this.supposeClueSatisfied(clue) === true)
				state.dismissed.push(index);
		}
	}

	supposeRewindTarget() {
		if (!this.suppose?.sharedConflicts.some(Boolean))
			return null;
		for (var state = this.suppose; state; state = state.parent)
			for (var position = state.position; position >= 0; position--)
				if (!state.history[position].domains.some(row => propagatePencilRow(row.slice())))
					return { state, position };
		return null;
	}
}

function Puzzle(board, hClues, vClues, messages, timer, symbols,
		options, optionsButton, help, helpButton, scores, scoresButton,
		about, logoButton) {
	var symbolSource = typeof symbols == "function" ? symbols : null;
	symbols = symbolSource ? symbolSource() : symbols || defaultSymbols;
	this.symbols = symbols;

	this.messages = messages;
	this.timer = timer;
	this.timerText = timer.firstElementChild || timer;
	this.hClues = hClues;
	this.vClues = vClues;
	this.options = options;
	this.optionsButton = optionsButton;
	this.newGameButton = document.querySelector("#new-game-button");
	this.invitation = document.querySelector("#invitation-menu");
	this.help = help;
	this.helpButton = helpButton;
	this.scores = scores;
	this.scoresButton = scoresButton;
	this.about = about;
	this.logoButton = logoButton;
	this.slotTray = document.querySelector("#slot-tray");
	this.slotTrayOptions = document.querySelector("#slot-tray-options");
	this.slotTrayAction = document.querySelector("#slot-tray-action");
	this.slotTrayActionSample = this.slotTrayAction.querySelector(
		".slot-tray-action-sample");
	this.slotTrayOptions.replaceChildren();
	this.slotTrayTiles = [];
	for (var i = 0; i < symbols[0].length; i++) {
		var tile = document.createElement("button");
		tile.type = "button";
		bindTileActions(this, tile, null, i);
		this.slotTrayTiles.push(tile);
		var recess = document.createElement("div");
		recess.className = "tile-recess";
		recess.appendChild(tile);
		this.slotTrayOptions.appendChild(recess);
	}
	this.boardActions = document.querySelector("#board-actions");
	this.eraseChalkBoard = document.querySelector("#erase-chalk-board");
	this.eraseChalkTap = document.querySelector("#erase-chalk-tap");
	this.eraseChalkFooter = document.querySelector("#erase-chalk-footer");
	this.expandedSlot = null;
	this.coarsePointer = typeof matchMedia != "undefined" &&
		matchMedia("(pointer: coarse)").matches;
	this.expandTileChoices = this.coarsePointer &&
		typeof innerWidth != "undefined" &&
		Math.min(innerWidth * 0.0208, innerHeight * 0.0345) < 20;
	this.showActionSelector = this.coarsePointer;
	this.controlHeld = false;
	this.shiftHeld = false;
	this.altHeld = false;
	this.timerTimeout = null;
	this.timerStarted = null;
	this.timerElapsed = 0;
	this.messageTimeout = null;
	this.soundSamples = {
		place: new Audio("sound/place.opus"),
		discard: new Audio("sound/discard.opus"),
		clue: new Audio("sound/clue.opus"),
		mistake: new Audio("sound/mistake.opus"),
		toggle: new Audio("sound/toggle.opus"),
	};
	this.soundVolumes = {
		place: 1,
		discard: 0.55,
		clue: 1,
		mistake: 1,
		toggle: 0.5,
	};
	this.soundVariations = {
		place: 0.045,
		discard: 0.1,
		clue: 0.055,
		mistake: 0,
		toggle: 0.035,
	};
	/* Normalized offsets, scaled by each sound's variation above. */
	this.soundSequence = [0, 0.833, -0.5, 0.333, -1, -0.167, 0.667,
		-0.667, 0.167, 1, -0.333, 0.5, -0.833];
	this.soundSequencePositions = {};
	this.soundBuffers = {};
	this.soundBufferPromises = {};
	for (var name in this.soundSamples) {
		this.soundSamples[name].preload = "auto";
		this.soundSamples[name].preservesPitch = false;
	}
	this.gameOver = true;
	this.practiceModePreference = false;
	this.practiceMode = this.practiceModePreference;
	this.continueAfterLoss = true;
	this.scoreEligible = true;
	this.revealedClues = [];
	this.originalClues = [];
	this.practiceMistake = null;
	this.paused = false;
	this.manualPaused = false;
	this.resumeAfterModal = false;
	this.pageHidden = false;
	this.resumeAfterPageHidden = false;
	this.pausedBeforePageHidden = false;
	this.nextMilestone = 0;
	this.pantheonViewport = this.scores.querySelector(".pantheon-tablets");
	this.pantheonScroll = new NativeScroll(this.pantheonViewport);
	this.pantheonModeTablets = [{}, {}];
	for (var [mode, tablets] of this.pantheonModeTablets.entries()) {
		for (var level of pantheonLevels) {
			var tablet = document.createElement("div");
			tablet.className = "pantheon-tablet";
			tablet.style.gridColumn = pantheonLevels.indexOf(level) + 1;
			tablet.style.visibility = mode ? "hidden" : "";
			tablet.setAttribute("aria-label", level == "all" ? "All victories" : level + " victories");
			var status = document.createElement("p");
			status.className = "scores-status";
			status.setAttribute("role", "status");
			status.textContent = "Loading victories…";
			tablet.appendChild(status);
			var empty = document.createElement("p");
			empty.className = "scores-empty";
			empty.hidden = true;
			tablet.appendChild(empty);
			tablet.appendChild(document.createElement("ol"));
			tablets[level] = tablet;
			this.pantheonViewport.appendChild(tablet);
		}
	}
	this.pantheonTablets = this.pantheonModeTablets[0];
	this.historyViewport = this.scores.querySelector(".history-pages");
	this.historyScroll = new NativeScroll(this.historyViewport);
	/* Recycling leaves requires knowing that the native gesture has ended.
	 * Older browsers can still use the page buttons and arrow keys.
	 */
	if (!("onscrollend" in this.historyViewport))
		this.historyViewport.style.overflowX = "hidden";
	this.historyTable = this.scores.querySelector(".history-current");
	initializeHistoryTable(this.historyTable);
	this.historyBody = this.historyTable.querySelector("tbody");
	this.helpPage = 0;
	this.helpViewport = this.help.querySelector(".help-pages");
	this.helpScroll = new NativeScroll(this.helpViewport);
	this.helpPages = Array.from(this.help.querySelectorAll(".help-page"));
	this.helpFolios = this.helpPages.map((page, index) => {
		var folio = document.createElement("nav");
		folio.className = "help-folio";
		folio.setAttribute("aria-label", "Help pages");
		var turn = direction => {
			var neighbor = this.helpPages[index + direction];
			var button = document.createElement("button");
			button.type = "button";
			button.className = "help-page-turn " +
				(direction < 0 ? "help-page-previous" : "help-page-next");
			if (neighbor) {
				var title = neighbor.querySelector("h3").textContent;
				button.textContent = direction < 0 ? "‹ " + title : title + " ›";
				button.onclick = () => this.turnHelpPage(direction);
			} else {
				button.textContent = direction < 0 ? "Incipit" : "Explicit";
				button.lang = "la";
				button.title = direction < 0 ? "Beginning" : "End";
				button.setAttribute("aria-label", button.title);
				button.disabled = true;
			}
			return button;
		};
		var number = document.createElement("span");
		number.className = "help-page-number";
		number.textContent = "Leaf " + romanNumeral(index + 1) +
			" of " + romanNumeral(this.helpPages.length);
		folio.appendChild(turn(-1));
		folio.appendChild(number);
		folio.appendChild(turn(1));
		this.help.querySelector(".help-navigation").appendChild(folio);
		folio.hidden = index != this.helpPage;
		return folio;
	});
	this.showMilestones = true;
	this.pencilMarks = [];
	this.actionController = null;
	this.effectsSuppressed = false;
	this.proof = null;
	this.suppose = null;
	this.supposeReplay = null;
	this.supposeRewindTimer = null;
	this.supposeButton = document.querySelector("#suppose-button");
	this.supposeTap = document.querySelector("#suppose-tap");
	this.supposeFooter = document.querySelector("#suppose-footer");
	this.supposeControls = document.querySelector("#suppose-controls");
	var watcherPeek = this.supposeControls.querySelector(".suppose-watchers button");
	var hideWatchers = () => watcherPeek.setAttribute("aria-expanded", "false");
	watcherPeek.addEventListener("pointerenter", function(ev) {
		this.setAttribute("data-hover", String(ev.pointerType == "mouse"));
	});
	watcherPeek.addEventListener("pointerleave", function() {
		this.setAttribute("data-hover", "false");
	});
	watcherPeek.addEventListener("pointerdown", function(ev) {
		if (ev.button != 0 || !ev.isPrimary) return;
		this.setPointerCapture(ev.pointerId);
		this.setAttribute("aria-expanded", "true");
	});
	for (var event of ["pointerup", "pointercancel", "lostpointercapture", "blur"])
		watcherPeek.addEventListener(event, hideWatchers);
	watcherPeek.addEventListener("keydown", function(ev) {
		if (ev.key == "Escape") hideWatchers();
		if (ev.key != " " && ev.key != "Enter") return;
		ev.preventDefault();
		this.setAttribute("aria-expanded", "true");
	});
	watcherPeek.addEventListener("keyup", function(ev) {
		if (ev.key != " " && ev.key != "Enter") return;
		ev.preventDefault();
		hideWatchers();
	});
	watcherPeek.addEventListener("contextmenu", ev => ev.preventDefault());
	this.pendingProof = null;
	this.explainButton = document.querySelector("#explain-button");
	this.explainButton.disabled = true;
	this.proofControls = document.querySelector("#proof-controls");
	this.analysis = document.querySelector("#analysis-menu");
	setDialogOpen(this.analysis, false);
	this.analysisClicks = 0;
	this.analysisUnlocked = false;
	try {
		this.analysisUnlocked = localStorage.getItem("analysisUnlocked") == "true";
	} catch (e) {
		/* Unlocking can still last for this page without storage. */
	}
	/* Multiplayer uses this to restore the loss-colored timer when joining. */
	this.continuedFromLoss = false;
	this.hintNotice = document.querySelector("#hint-notice");
	this.hintNotice.hidden = true;
	this.hintAcknowledged = false;
	try {
		this.hintAcknowledged = localStorage.getItem("hintAcknowledged") == "true";
	} catch (e) {
		/* The notice can still be acknowledged for this page. */
	}
	this.rows = [];
	this.clues = [];
	this.hClueSlots = [];
	this.vClueSlots = [];
	for (var i = 0; i < symbols.length; i++)
		this.rows[i] = new Row(this, symbols[i], board.insertRow(), i);
	for (var i = 0; i < 6; i++) {
		var row = hClues.insertRow();
		for (var j = 0; j < 3; j++) {
			var cell = row.insertCell();
			cell.className = "clue";
			this.hClueSlots.push(cell);
		}
	}
	{
		var row = vClues.insertRow();
		for (var i = 0; i < 8; i++) {
			var cell = row.insertCell();
			cell.className = "clue";
			this.vClueSlots.push(cell);
		}
	}

	/* Changing artwork must preserve slots, bindings, and row/value identities. */
	this.setSymbols = function(next) {
		if (next.every((row, family) => row.every((symbol, value) =>
		    symbol === this.symbols[family][value])))
			return;
		this.symbols = next;
		for (var [family, row] of this.rows.entries()) {
			for (var slot of row.slots) {
				slot.symbols = next[family];
				for (var value = 0; value < slot.symbols.length; value++)
					renderTileSymbol(slot.possibilityElems[value].querySelector(
						".possibility-symbol"), slot.symbols[value]);
				if (slot.value !== undefined)
					renderTileSymbol(slot.singleElem, slot.symbol());
			}
		}
		for (var clue of this.clues) {
			clue.rendered = false;
			if (clue.display)
				checkClueDisplay(clue);
		}
	}

	this.refreshSymbols = function() {
		if (symbolSource)
			this.setSymbols(symbolSource());
	}

	this.clear = function() {
		this.cancelSupposeReplay();
		this.leaveSuppose(true);
		this.extreme = false;
		this.originalClues = [];
		this.revealedClues = [];
		this.dailyReturn = null;
		this.invitationDeclined = false;
		this.daily = null;
		this.setInvitationResult(false);
		this.continuedFromLoss = false;
		this.clearHint();
		this.clearInvitationTransition();
		this.manualPaused = false;
		this.gameOver = true;
		this.proof = null;
		this.pendingProof = null;
		this.practiceMistake = null;
		this.explainButton.disabled = true;
		this.explainButton.classList.remove("active", "proof-available");
		this.explainButton.setAttribute("aria-pressed", "false");
		this.proofControls.hidden = true;
		document.body.classList.remove("proof-active");
		this.nextMilestone = 0;
		this.closeSlotTray();
		this.clearPencilMarks();
		this.hClues.classList.remove("solution");
		this.vClues.classList.remove("solution");
		this.stopTimer();
		this.timerElapsed = 0;
		this.clearOutcome();
		this.updateTimer(0);
		for (var i = 0; i < this.rows.length; i++)
			this.rows[i].clear();
		this.say("");
		this.updateActionControls();
	}

	this.showMultiplayerLobby = function() {
		this.gameIdentity = {};
		this.seed = this.pendingSeed = undefined;
		this.paused = this.resumeAfterModal = false;
		this.clear();
		this.scoreEligible = false;
		this.clues = [];
		for (var slot of [...this.hClueSlots, ...this.vClueSlots])
			clearClueSlot(slot);
		this.options.querySelector("#game-seed").value = "";
		this.updateSeedControls();
		this.updateSeedDifficulty();
		this.say("Gather kindred minds. Anyone may begin.");
	}

	/* One suspended solo game belongs to the whole daily browsing visit,
	 * not to any particular date. Transient explanations are dismissed.
	 */
	this.saveDailyReturn = function() {
		this.leaveSuppose(true);
		if (this.dailyReturn || this.actionController || this.gameOver ||
		    this.pendingSeed !== undefined || this.seed === undefined)
			return;
		this.closeProof();
		this.clearPracticeMistake();
		this.clearHint();
		this.stopTimer();
		this.dailyReturn = {
			extreme: this.extreme,
			revealedClues: this.revealedClues.slice(),
			seed: this.seed,
			symbols: this.symbols,
			session: {
				daily: this.daily,
				practiceMode: this.practiceMode,
				continuedFromLoss: this.continuedFromLoss,
				scoreEligible: this.scoreEligible,
				manualPaused: this.manualPaused,
				timerElapsed: this.timerElapsed,
				nextMilestone: this.nextMilestone,
				pencilMarks: this.pencilMarks.map(mark => ({ ...mark })),
			},
			rows: this.rows.map(row => row.slots.map(slot => ({
				single: slot.single, possible: slot.possible.slice(),
			}))),
			clues: this.clues.map(clue => clue.active),
			chalkClues: this.clues.flatMap((clue, index) => clue.chalkMark ?
				[{ index, ...clue.chalkMark }] : []),
		};
	}

	this.restoreDailyReturn = function() {
		var saved = this.dailyReturn;
		if (!saved)
			return false;
		/* Regenerate clues, but never replay moves or reuse the old async
		 * identity. Slot objects themselves remain stable across games.
		 */
		this.newGame(saved.seed, true, false, saved.extreme);
		for (var index of saved.revealedClues || [])
			this.revealExtremeClue(index, false);
		this.setSymbols(saved.symbols);
		Object.assign(this, saved.session);
		for (var [row, slots] of saved.rows.entries())
			for (var [column, state] of slots.entries()) {
				var slot = this.rows[row].slots[column];
				slot.possible = state.possible;
				slot.single = state.single;
			}
		for (var [index, active] of saved.clues.entries()) {
			this.clues[index].active = active;
			if (this.clues[index].display)
				checkClueDisplay(this.clues[index]);
		}
		for (var mark of saved.chalkClues || [])
			this.setChalkClue(this.clues[mark.index], true, mark.actor, mark.color);
		this.restorePlayDisplay();
		this.startMoveRecording();
		this.pendingSeed = undefined;
		this.paused = this.manualPaused || this.pageHidden;
		this.resumeAfterPageHidden = this.pageHidden && !this.manualPaused && !this.practiceMode;
		this.pausedBeforePageHidden = this.manualPaused;
		if (this.continuedFromLoss)
			this.timer.classList.add("lost");
		this.updateTimer(this.timerElapsed);
		this.updateActionControls();
		if (!this.paused && !this.practiceMode)
			this.startTimer();
		return true;
	}

	this.closeInvitation = function() {
		if (this.dailyResultOpen)
			return this.closeDailyResult();
		if (this.invitationAnimation)
			return;
		this.fadeInvitation(() => {
			if (this.restoreDailyReturn())
				return;
			this.invitationDeclined = true;
			this.updateActionControls();
			this.say("Let this mystery remain.");
			this.newGameButton.focus();
		}, 350);
	}

	this.startGame = function() {
		if (this.pendingSeed === undefined)
			return false;
		if (this.daily)
			return this.startDailyGame();
		return this.startInvitedGame();
	}

	this.startDailyGame = async function() {
		/* Another tab may have finished this date since the invitation opened. */
		var gameIdentity = this.gameIdentity;
		var declined = this.invitationDeclined;
		var result = await this.getDailyResult(this.daily);
		if (this.gameIdentity !== gameIdentity || this.pendingSeed === undefined ||
		    this.invitationDeclined !== declined)
			return false;
		if (result === null) {
			this.say("The Chronicle could not be loaded.");
			return false;
		}
		if (result) {
			this.pendingSeed = undefined;
			this.gameOver = true;
			this.updateActionControls();
			this.showDailyResult(result);
			return false;
		}
		return this.startInvitedGame();
	}

	this.startInvitedGame = function() {
		if (this.invitationAnimation)
			return false;
		this.refreshSymbols();
		var finish = () => {
			this.dailyReturn = null;
			this.pendingSeed = undefined;
			setDialogOpen(this.invitation, false);
			var modalOpen = document.querySelectorAll(".modal:not([hidden])").length > 0;
			this.paused = this.pageHidden || modalOpen;
			this.pausedBeforePageHidden = modalOpen;
			this.resumeAfterPageHidden = this.pageHidden && !this.practiceMode;
			this.invitation.classList.remove("revealing");
			this.updateSeedControls();
			this.updateSeedDifficulty();
			this.updateActionControls();
			if (!this.paused && !this.practiceMode)
				this.startTimer();
			this.say(this.extreme ? extremeStartMessage : randomChoice(startMessages));
		};
		return this.fadeInvitation(finish, 800, true);
	}

	this.fadeInvitation = function(finish, duration, reveal = false) {
		if (this.invitation.hidden || typeof this.invitation.animate != "function" ||
		    typeof matchMedia != "undefined" &&
		    matchMedia("(prefers-reduced-motion: reduce)").matches) {
			finish();
			return true;
		}
		if (reveal)
			this.invitation.classList.add("revealing");
		this.invitation.classList.add("invitation-exiting");
		var timing = { duration: duration, easing: "ease-in-out", fill: "forwards" };
		this.invitationBackdropAnimation = this.invitation.animate(
			[{ backgroundColor: "rgb(20 25 25 / 45%)" },
			 { backgroundColor: "rgb(20 25 25 / 0%)" }],
			{ ...timing, pseudoElement: "::backdrop" });
		var animation = this.invitationAnimation = this.invitation.animate(
			[{ opacity: 1 }, { opacity: 0 }], timing);
		animation.finished.then(() => {
			if (this.invitationAnimation !== animation)
				return;
			this.invitationAnimation = null;
			finish();
			this.clearInvitationTransition();
			animation.cancel();
		}, function() {});
		return true;
	}

	this.clearInvitationTransition = function() {
		this.invitation.classList.remove("invitation-exiting");
		this.invitationBackdropAnimation?.cancel();
		this.invitationBackdropAnimation = null;
		if (this.invitationAnimation) {
			this.invitationAnimation.cancel();
			this.invitationAnimation = null;
		}
		this.invitation.classList.remove("revealing");
	}

	this.randomPuzzleSeed = function(extreme = this.extremeMode) {
		if (extreme) {
			for (var attempt = 0; attempt < 100; attempt++) {
				var seed = randomSeed();
				if (extremeClueIndices(puzzleFromSeed(seed)))
					return seed;
			}
			var message = "No extreme puzzle found in 100 attempts. Try again.";
			this.showSeedStatus("No Extreme puzzle found. Try again.", message);
			this.say(message);
			return null;
		}
		if (!this.randomDifficulties.length) {
			this.gameIdentity = {};
			this.seed = this.pendingSeed = undefined;
			this.paused = this.resumeAfterModal = false;
			this.clear();
			this.clues = [];
			for (var slot of [...this.hClueSlots, ...this.vClueSlots])
				slot.replaceChildren();
			this.options.querySelector("#game-seed").value = "";
			this.updateSeedControls();
			this.updateSeedDifficulty();
			this.timer.classList.add("contemplating");
			this.timer.title = "Contemplation has no time limit";
			this.timer.setAttribute("aria-label", this.timer.title);
			this.messages.classList.add("won");
			this.say("You have chosen the path of contemplation.");
			return null;
		}
		for (;;) {
			var seed = randomSeed();
			if (this.randomDifficulties.length == 3)
				return seed;
			var difficulty = puzzleDifficulty(puzzleFromSeed(seed));
			if (this.randomDifficulties.includes(difficulty.level)) {
				this.seedDifficultyCache = { seed: seed, difficulty: difficulty };
				return seed;
			}
		}
	}

	this.newGame = function(seed, awaitStart = false, dailyPreview = false, extreme = false) {
		if (typeof extreme !== "boolean")
			return false;
		if (!arguments.length)
			extreme = this.extremeMode;
		seed = arguments.length ? parseSeed(seed) : this.randomPuzzleSeed(extreme);
		/* Reject seeds which do not produce an extreme puzzle before touching
		 * the current game. Peers reconstruct this same deterministic pruning. */
		var indices = extreme && seed !== null ? extremeClueIndices(puzzleFromSeed(seed)) : null;
		if (extreme && !indices)
			return false;
		this.cancelSupposeReplay();
		this.leaveSuppose(true);
		this.clearHint();
		if (seed !== null || !arguments.length)
			this.beforeNewGame?.();
		if (seed === null)
			return false;
		if (!dailyPreview)
			this.dailyReturn = null;
		this.daily = null;
		this.setInvitationResult(false);
		this.invitation.querySelector("#invitation-title").textContent = "A puzzle awaits";
		this.invitation.classList.remove("daily-panel");
		this.invitation.querySelector(".invitation-heading").textContent = "Logos";
		this.clearInvitationTransition();
		this.invitationDeclined = false;
		this.pendingSeed = awaitStart ? seed : undefined;
		this.gameIdentity = {};
		this.continuedFromLoss = false;
		this.seed = seed;
		this.extreme = extreme;
		this.options.querySelector("#game-seed").value = formatSeed(seed);
		this.updateSeedControls();
		this.gameOver = true;
		this.practiceMode = this.practiceModePreference;
		this.proof = null;
		this.pendingProof = null;
		this.practiceMistake = null;
		this.scoreEligible = !this.practiceMode;
		this.explainButton.disabled = true;
		this.explainButton.classList.remove("active", "proof-available");
		this.explainButton.setAttribute("aria-pressed", "false");
		this.proofControls.hidden = true;
		document.body.classList.remove("proof-active");
		/* A seed may be started from the paused Options modal. */
		this.manualPaused = false;
		this.paused = false;
		this.resumeAfterModal = false;
		this.nextMilestone = 0;
		this.closeSlotTray();
		this.clearPencilMarks();
		this.stopTimer();
		this.timerElapsed = 0;
		this.clearOutcome();
		this.updateTimer(0);
		var puzzle = this;
		this.refreshSymbols();
		withPuzzleRandom(seed, function() {
			for (var i = 0; i < puzzle.rows.length; i++)
				puzzle.rows[i].newGame();
			puzzle.gameOver = false;
			puzzle.generateClues(indices);
		});
		this.explainButton.disabled = false;
		this.paused = awaitStart;
		if (!this.practiceMode && !awaitStart)
			this.startTimer();
		this.say(awaitStart ? "" : this.extreme ? extremeStartMessage : randomChoice(startMessages));
		this.updateSeedDifficulty();
		this.updateActionControls();
		this.startMoveRecording();
		return true;
	}

	this.loadURLSeed = function(url) {
		var params = new URLSearchParams(new URL(url).hash.slice(1));
		if (params.has("daily") && !params.has("room"))
			return this.openDaily(params.get("daily") || dailyDate());
		var seed = parseSeed(params.get("seed"));
		if (seed === null)
			return false;
		this.invitation.querySelector(".invitation-seed").textContent =
			formatSeed(seed);
		return this.newGame(seed, true, false, params.has("extreme"));
	}

	this.dailyResultFromRun = function(run, scores = [], level = "all") {
		var result = { date: run.daily, outcome: run.outcome,
			elapsed: run.elapsed, assisted: run.elapsed === undefined, runId: run.id };
		if (hasRunDifficulty(run))
			result.difficulty = run.difficulty.level;
		var place = scores.findIndex(score => run.id !== undefined && score.id === run.id);
		if (place >= 0) {
			result.pantheonPlace = place + 1;
			result.pantheonLevel = level;
		}
		return result;
	}

	this.getDailyResult = async function(date) {
		var history = await accessRunHistory(null, true);
		if (!history)
			return null;
		/* The store cursor returns records in insertion order. A later Zen
		 * completion must not replace the original timed loss.
		 */
		var run = history.runs.find(run => run.daily === date && !run.multiplayer);
		if (!run)
			return undefined;
		var completion = run.outcome === "lost" ? history.runs.slice(history.runs.indexOf(run) + 1)
			.find(later => later.daily === date && !later.multiplayer &&
				later.outcome === "won" && later.elapsed === undefined) : undefined;
		var level = run.difficulty?.level || "all";
		if (level != "all")
			history = await accessRunHistory(null, false, level);
		var result = this.dailyResultFromRun(run, history?.highScores, level);
		if (completion)
			result.completionRunId = completion.id;
		return result;
	}

	this.updateDailyButton = function() {
		var button = this.options.querySelector("#daily-button");
		button.setAttribute("aria-disabled", String(!!this.actionController));
		button.tabIndex = this.actionController ? -1 : 0;
		button.title = this.actionController ? "Daily attempts are played solo." : "";
	}

	this.openDaily = async function(date = dailyDate(), direction = 0) {
		if (!validDailyDate(date) || this.actionController)
			return false;
		if (!this.options.hidden)
			this.toggleOptions();
		var gameIdentity = this.gameIdentity;
		var request = this.dailyRequest = {};
		var result = await this.getDailyResult(date);
		if (this.gameIdentity !== gameIdentity || this.dailyRequest !== request || this.actionController)
			return false;
		if (result === null) {
			this.say("The Chronicle could not be loaded.");
			return false;
		}
		if (result) {
			/* Completed dates get the same unsolved preview as fresh ones. */
			if (this.daily !== date || this.pendingSeed === undefined) {
				this.saveDailyReturn();
				this.newGame(date, true, true);
				this.daily = date;
			}
			this.gameOver = true;
			this.updateActionControls();
			this.showDailyResult(result, direction);
			return true;
		}
		this.clearDailyCopyFeedback();
		this.setInvitationResult(false);
		/* Reopening Options must not restart an ongoing daily attempt. */
		if (this.daily === date) {
			this.invitationDeclined = false;
			this.updateActionControls();
		} else {
			this.saveDailyReturn();
			this.newGame(date, true, true);
			this.daily = date;
		}
		this.invitation.classList.add("daily-panel");
		this.invitation.querySelector(".invitation-heading").textContent = "LOGOS Daily";
		renderDailyTitle(this.invitation.querySelector("#invitation-title"), date,
			(value, movement) => this.openDaily(value, movement), direction);
		this.invitation.querySelector(".invitation-seed").textContent = date;
		this.focusDailyAccept();
		return true;
	}

	this.focusDailyAccept = function() {
		var accept = this.invitation.querySelector(".invitation-accept");
		accept.classList.add("invitation-initial-focus");
		accept.focus({ preventScroll: true });
	}

	this.dailyResultText = function(result) {
		return "Logos daily · " + dailyDateLabel(result.date) + "\n" +
			(result.outcome == "won" ? "Solved" : "Lost") +
			(result.assisted ? " · Assisted / Zen (untimed)" :
				" · " + formatTime(result.elapsed)) +
			(result.completionRunId !== undefined ? "\nLater solved ∞" : "");
	}

	this.setInvitationResult = function(show) {
		this.dailyResultOpen = show;
		var prompt = this.invitation.querySelector(".invitation-prompt");
		var result = document.querySelector("#daily-menu");
		prompt.hidden = prompt.inert = show;
		result.hidden = result.inert = !show;
	}

	this.showDailyResult = function(result, direction = 0) {
		this.clearDailyCopyFeedback();
		this.displayedDailyResult = result;
		var modal = document.querySelector("#daily-menu");
		modal.querySelector(".daily-copy").href = "#daily=" + result.date;
		this.setInvitationResult(true);
		this.invitationDeclined = true;
		this.invitation.classList.add("daily-panel");
		this.invitation.querySelector(".invitation-heading").textContent = "LOGOS Daily";
		this.invitation.querySelector(".invitation-seed").textContent = result.date;
		renderDailyTitle(this.invitation.querySelector("#invitation-title"), result.date,
			(value, movement) => this.openDaily(value, movement), direction);
		var link = modal.querySelector(".daily-result-link");
		link.textContent = this.dailyResultText(result).split("\n")[1];
		link.disabled = result.runId === undefined;
		link.title = link.disabled ? "" : "View this attempt in the Chronicle";
		modal.querySelector(".daily-difficulty").textContent =
			difficultyLevels.includes(result.difficulty) ?
				result.difficulty[0].toUpperCase() + result.difficulty.slice(1) + " difficulty" : "";
		var pantheon = modal.querySelector(".daily-pantheon-link");
		pantheon.hidden = !(Number.isInteger(result.pantheonPlace) &&
			result.pantheonPlace >= 1 && result.pantheonPlace <= 10 &&
			pantheonLevels.includes(result.pantheonLevel));
		var completion = modal.querySelector(".daily-completion");
		completion.hidden = result.completionRunId === undefined;
		modal.querySelector(".daily-recognition").hidden = pantheon.hidden && completion.hidden;
		modal.querySelector(".daily-history-error").hidden = !result.historyUnsaved;
		if (this.invitation.hidden)
			this.toggleModal(this.invitation, this.options.querySelector("#daily-button"), "Close");
		var close = modal.querySelector(".modal-close");
		close.classList.add("invitation-initial-focus");
		close.focus();
	}

	this.openDailyChronicle = async function() {
		var result = this.displayedDailyResult;
		if (!result || result.runId === undefined || document.querySelector("#daily-menu").hidden)
			return;
		this.closeDailyResult(true);
		this.scoresDailyReturn = { result, gameIdentity: this.gameIdentity };
		if (this.scores.hidden)
			this.toggleModal(this.scores, this.scoresButton, "Rejoin the mortal realm");
		await this.showRunHistory(result.runId);
	}

	this.openDailyPantheon = async function() {
		var result = this.displayedDailyResult;
		var modal = document.querySelector("#daily-menu");
		if (!result || modal.hidden ||
		    !pantheonLevels.includes(result.pantheonLevel))
			return;
		var gameIdentity = this.gameIdentity;
		var loading = this.loadHistory(undefined, result.pantheonLevel, false);
		var request = this.pantheonRequest;
		await loading;
		if (this.gameIdentity !== gameIdentity || this.pantheonRequest !== request ||
		    this.displayedDailyResult !== result || modal.hidden)
			return;
		this.highlightedScore = this.highScores.find(score => result.runId !== undefined ?
			score.id === result.runId : score.daily === result.date) || null;
		this.closeDailyResult(true);
		this.scoresDailyReturn = { result, gameIdentity };
		if (this.scores.hidden)
			this.toggleModal(this.scores, this.scoresButton, "Rejoin the mortal realm");
		this.showPantheon();
		this.renderHighScores();
	}

	this.closeDailyResult = function(detour = false) {
		this.clearDailyCopyFeedback();
		if (!this.dailyResultOpen)
			return;
		this.setInvitationResult(false);
		this.invitationDeclined = true;
		if (!this.invitation.hidden)
			this.toggleModal(this.invitation, this.options.querySelector("#daily-button"), "Close");
		if (!detour)
			this.restoreDailyReturn();
	}

	this.clearDailyCopyFeedback = function() {
		clearTimeout(this.dailyCopyTimeout);
		this.dailyCopyRequest = null;
		document.querySelector("#invitation-menu .daily-copy-status").textContent = "";
	}

	this.copyDailyResult = async function() {
		this.clearDailyCopyFeedback();
		var request = this.dailyCopyRequest = {};
		var result = this.displayedDailyResult;
		var url = new URL(window.location.href);
		url.hash = "daily=" + result.date;
		var text = this.dailyResultText(result) + "\n" + url.href;
		try {
			await navigator.clipboard.writeText(text);
			if (this.dailyCopyRequest === request) {
				document.querySelector("#invitation-menu .daily-copy-status").textContent = "Copied to clipboard";
				this.dailyCopyTimeout = setTimeout(() => this.clearDailyCopyFeedback(), 3000);
			}
		} catch (e) {
			window.prompt("Copy this result and puzzle link:", text);
		}
	}

	this.updateSeedControls = function() {
		var value = this.options.querySelector("#game-seed").value.trim();
		var seed = parseSeed(value);
		this.options.querySelector("#start-game-button").value =
			!value ? "Random" :
			seed === this.seed && !!this.extreme === this.extremeMode &&
			this.pendingSeed === undefined ? "Restart" : "Start";
		var copy = this.options.querySelector("#copy-seed-link");
		copy.disabled = seed === null;
		copy.value = "Copy link";
	}

	this.extremeDifficulty = function() {
		if (!this.extremeDifficultyCache || this.extremeDifficultyCache.seed !== this.seed) {
			var puzzle = puzzleFromSeed(this.seed);
			puzzle.clues = extremeClueIndices(puzzle).map(index => puzzle.clues[index]);
			this.extremeDifficultyCache = {
				seed: this.seed,
				rating: measureExtremeDifficulty(puzzle),
			};
		}
		return this.extremeDifficultyCache.rating;
	}

	this.showSeedStatus = function(message, explanation) {
		var display = this.options.querySelector("#seed-difficulty");
		display.textContent = message;
		display.title = explanation;
		display.disabled = true;
	}

	this.updateSeedDifficulty = function() {
		var display = this.options.querySelector("#seed-difficulty");
		display.textContent = "";
		display.title = "";
		display.disabled = true;
		var value = this.options.querySelector("#game-seed").value.trim();
		var seed = parseSeed(value);
		if (this.options.hidden || seed === null || seed !== this.seed ||
		    this.pendingSeed !== undefined)
			return;
		if (this.extreme) {
			var rating = this.extremeDifficulty();
			display.innerHTML = "Extreme " + extremeSkulls(rating);
			display.disabled = false;
			display.title = rating.stalled ? "Beyond single-choice deductions" :
				rating.complete ? "Extreme score: " + rating.score.toFixed(0) :
				"Extreme rating unavailable";
			return;
		}
		if (!this.seedDifficultyCache || this.seedDifficultyCache.seed !== seed)
			this.seedDifficultyCache = { seed: seed, difficulty: puzzleDifficulty(puzzleFromSeed(seed)) };
		var level = this.seedDifficultyCache.difficulty.level;
		display.textContent = "Difficulty: " + level[0].toUpperCase() + level.slice(1);
		display.disabled = false;
	}

	this.positionSnapshot = function() {
		return {
			seed: formatSeed(this.seed),
			extreme: !!this.extreme,
			revealedClues: this.revealedClues.slice(),
			generatorVersion: puzzleGeneratorVersion,
			...(this.clues.some(clue => clue.chalkMark) ? {
				chalkClues: this.clues.flatMap((clue, index) => clue.chalkMark ? [index] : []),
			} : {}),
			// Indexed by row, then symbol; bits identify possible columns.
			domains: domainsFromSlots(this),
			placements: proofPlacementsFromSlots(this),
			pencilMarks: this.pencilMarks.map(mark => ({
				row: this.rows.indexOf(mark.slot.row),
				column: mark.slot.row.slots.indexOf(mark.slot),
				symbol: mark.value,
				discard: mark.discard,
			})),
		};
	}

	/* A local diagnostic transcript, separate from scores and saved positions.
	 * Keep snapshots so automatic consequences need not be reconstructed. */
	this.startMoveRecording = function() {
		this.moveRecording = { version: 1, initial: this.positionSnapshot(), events: [] };
		this.moveRecordingStarted = Date.now();
	}

	this.recordMoveEvent = function(type, details = {}) {
		if (!this.moveRecording)
			return;
		var depth = 0;
		for (var state = this.suppose; state; state = state.parent)
			depth++;
		this.moveRecording.events.push({ type, ...details,
			elapsed: Date.now() - this.moveRecordingStarted, depth,
			...(this.suppose ? { position: this.suppose.position,
				domains: copyDomains(this.suppose.domains) } : {
				domains: domainsFromSlots(this), placements: proofPlacementsFromSlots(this),
			}),
		});
	}

	this.moveHistorySnapshot = function() {
		return JSON.parse(JSON.stringify({ ...this.moveRecording,
			final: this.positionSnapshot() }));
	}

	this.copyMoveHistory = async function() {
		var text = JSON.stringify(this.moveHistorySnapshot());
		try {
			await navigator.clipboard.writeText(text);
			this.analysis.querySelector(".analysis-copy-moves").textContent = "Copied";
		} catch (e) {
			window.prompt("Copy this move history:", text);
		}
	}

	this.openAnalysis = function() {
		this.leaveSuppose(true);
		var input = this.options.querySelector("#game-seed");
		if (this.options.hidden || this.seed === undefined ||
		    parseSeed(input.value.trim()) !== this.seed || this.pendingSeed !== undefined)
			return;
		if (!this.analysisUnlocked) {
			if (++this.analysisClicks < 3)
				return;
			this.analysisUnlocked = true;
			try {
				localStorage.setItem("analysisUnlocked", "true");
			} catch (e) {
				/* The unlock still applies for this page. */
			}
		}
		var snapshot = this.positionSnapshot();
		var metrics = this.extreme ? null : measureDifficulty(this);
		var rating = metrics ? difficultyRating(metrics) : null;
		var available = difficultyOpportunities(this, snapshot.domains);
		var extremeRating = this.extreme ? this.extremeDifficulty() : null;
		this.analysisSnapshot = JSON.stringify(snapshot);
		this.analysis.querySelector(".analysis-summary").textContent =
			"Seed: " + snapshot.seed + "\n" +
			(this.extreme ? "Extreme (experimental)\n" +
			(extremeRating.stalled ? "Skulls: ∞" :
			 extremeRating.complete ? "Skulls: " + extremeRating.skulls + "\nScore: " + extremeRating.score.toFixed(2) +
				"\nMean bottlenecks: " + extremeRating.bottlenecks.toFixed(1) :
				"Extreme rating unavailable") + "\n\n" :
			"Difficulty: " + rating.level + "\n" +
			"Score: " + rating.score.toFixed(2) + " = excess discards + 5 × scarcity\n" +
			"Cutoffs: Easy < 47; Medium < 70; otherwise Hard\n\n" +
			"Ten-route averages (placement-first):\n" +
			"Total scarcity: " + metrics.scarcity.toFixed(2) + "\n" +
			"Excess discards (3 free per stretch): " + metrics.excessDiscards.toFixed(2) + "\n\n") +
			"Available clue observations: " + available.length;
		var list = this.analysis.querySelector(".analysis-deductions");
		list.replaceChildren();
		var count = 0;
		for (var clue of this.clues) {
			var step = clueProofStep(this, clue, snapshot.domains);
			if (!step)
				continue;
			var before = snapshot.domains[step.row][step.symbol];
			var after = before & ~step.removed;
			var item = document.createElement("li");
			renderProofMessage(this, item,
				proofDeductionMessage(this, step, before, after, snapshot.domains), false);
			list.appendChild(item);
			if (++count == 3)
				break;
		}
		this.analysis.querySelector(".analysis-empty").hidden = count != 0;
		this.analysis.querySelector(".analysis-copy").textContent = "Copy position";
		this.analysis.querySelector(".analysis-copy-moves").textContent = "Copy move history";
		setDialogOpen(this.options, false);
		setDialogOpen(this.analysis, true);
		this.analysis.querySelector(".modal-close").focus();
	}

	this.closeAnalysis = function() {
		if (this.analysis.hidden)
			return;
		this.toggleModal(this.analysis, this.optionsButton, "Close");
		this.optionsButton.focus();
	}

	this.copyAnalysisPosition = async function() {
		var snapshot = this.analysisSnapshot;
		try {
			await navigator.clipboard.writeText(snapshot);
			if (!this.analysis.hidden && snapshot === this.analysisSnapshot)
				this.analysis.querySelector(".analysis-copy").textContent = "Copied";
		} catch (e) {
			window.prompt("Copy this position:", snapshot);
		}
	}

	this.copySeedLink = async function() {
		var input = this.options.querySelector("#game-seed");
		var seed = parseSeed(input.value.trim());
		if (seed === null)
			return;
		var extreme = seed === this.seed ? this.extreme : this.extremeMode;
		var url = new URL(window.location.href);
		url.hash = "seed=" + formatSeed(seed) +
			(extreme ? "&extreme" : "");
		try {
			await navigator.clipboard.writeText(url.href);
			if (parseSeed(input.value.trim()) === seed)
				this.options.querySelector("#copy-seed-link").value = "Copied";
		} catch (e) {
			window.prompt("Copy this puzzle link:", url.href);
		}
	}

	this.playSeed = function() {
		this.updateSeedDifficulty();
		var input = this.options.querySelector("#game-seed");
		var value = input.value.trim();
		var seed = value ? parseSeed(value) : undefined;
		if (value && seed === null) {
			input.setCustomValidity("Enter up to eight hexadecimal digits.");
			input.reportValidity();
			return;
		}
		if (value && this.extremeMode && !extremeClueIndices(puzzleFromSeed(seed))) {
			this.showSeedStatus("No Extreme variant for this seed.",
				"This seed can’t be made Extreme. Turn off Extreme to play it.");
			return;
		}
		if (this.actionController) {
			input.setCustomValidity("");
			if (this.actionController.requestNewGame(seed, this.extremeMode))
				this.toggleOptions();
			return;
		}
		if (this.pendingSeed !== undefined && seed === this.pendingSeed &&
		    !!this.extreme === this.extremeMode) {
			this.startGame();
			input.setCustomValidity("");
			this.toggleOptions();
			return;
		}
		var started = value ? this.newGame(value, false, false,
			this.extremeMode) : this.newGame();
		if (!started) {
			if (!value) {
				if (this.extremeMode)
					return;
				input.setCustomValidity("");
				this.toggleOptions();
				return;
			}
			input.setCustomValidity("Enter up to eight hexadecimal digits.");
			input.reportValidity();
			return;
		}
		input.setCustomValidity("");
		this.toggleOptions();
	}

	this.checkWin = function() {
		if (this.gameOver)
			return;
		this.checkMilestones();
		for (var i = 0; i < this.rows.length; i++)
			if (!this.rows[i].isComplete())
				return;
		this.gameOver = true;
		this.explainButton.disabled = true;
		this.updateActionControls();
		this.playSound("win");
		this.stopTimer();
		this.timer.classList.add("won");
		this.messages.classList.add("won");
		this.say(randomChoice(winMessages));
		return this.finishRun("won");
	}

	this.checkMilestones = function() {
		var complete = 0;
		for (var i = 0; i < this.rows.length; i++)
			for (var j = 0; j < this.rows[i].slots.length; j++)
				if (this.rows[i].slots[j].single)
					complete++;

		while (this.nextMilestone < milestoneThresholds.length &&
		       complete >= milestoneThresholds[this.nextMilestone]) {
			if (this.showMilestones)
				this.say(randomChoice(
					milestoneMessages[this.nextMilestone]));
			this.nextMilestone++;
		}
	}

	this.lose = function(msg, clues, failedSlot, failedValue) {
		if (this.gameOver)
			return;
		if (this.practiceMode) {
			this.playSound("practice-mistake");
		} else {
			if (this.continueAfterLoss) {
				this.continuedFromLoss = true;
			} else {
				this.gameOver = true;
				this.explainButton.disabled = true;
				this.updateActionControls();
				this.revealSolution();
			}
			this.playSound("mistake");
			this.stopTimer();
			this.finishRun("lost");
			this.timer.classList.add("lost");
			if (this.continueAfterLoss) {
				/* These must come after finishRun() so that we score the game
				 * correctly in its original mode. */
				this.scoreEligible = false;
				this.practiceMode = true;
				this.updatePauseControl();
			}
		}
		/* This includes Zen games, but also continue-after-loss from above. */
		if (this.practiceMode) {
			this.clearPracticeMistake();
			this.practiceMistake = {
				clueStates: (clues || []).map(clue => ({ clue, active: clue.active })),
				failedSlot: failedSlot,
				failedValue: failedValue,
			};
		}
		this.messages.classList.add("lost");
		this.closeSlotTray();
		if (clues && clues.length) {
			this.hClues.classList.add("solution");
			this.vClues.classList.add("solution");
			for (var i = 0; i < clues.length; i++) {
				clues[i].active = true;
				clues[i].display.classList.remove("clue-hidden");
				clues[i].display.classList.add("contradiction");
			}
		}
		if (failedSlot) {
			this.pendingProof = {
				continueGame: this.practiceMode,
				emphasizeButton: !clues || !clues.length,
				failedSlot: failedSlot,
				failedValue: failedValue,
			};
			this.explainButton.disabled = false;
			if (!clues || !clues.length)
				this.explainButton.classList.add("proof-available");
			failedSlot.possibilityElems[failedValue].classList.add(
				"failed-action");
		}
		this.say(msg);
	}

	this.renderProofDomains = function(domains, placements, change) {
		for (var row = 0; row < this.rows.length; row++) {
			this.rows[row].elem.classList.remove("pencil-conflict");
			for (var col = 0; col < this.rows[row].slots.length; col++) {
				var slot = this.rows[row].slots[col];
				if (slot.single)
					continue;
				slot.displayProof(domains[row], col, placements[row],
					change && change.row == row ? change : null);
			}
		}
	}

	this.renderChalkProof = function(step) {
		this.renderProofDomains(step.chalkBase, step.chalkBasePlacements);
		for (var row = 0; row < this.rows.length; row++) {
			var domains = step.domains[row];
			var conflict = domains.some(bits => !bits) ||
				this.rows[row].slots.some((slot, col) =>
					!domains.some(bits => bits & (1 << col)));
			if (conflict && step.lemmaStage == "contradiction")
				this.rows[row].elem.classList.add("pencil-conflict");
			for (var col = 0; col < this.rows[row].slots.length; col++) {
				var slot = this.rows[row].slots[col];
				if (slot.possibleElem.hidden)
					continue;
				for (var symbol = 0; symbol < domains.length; symbol++) {
					if (!(step.chalkBase[row][symbol] & (1 << col)))
						continue;
					var elem = slot.possibilityElems[symbol];
					elem.style.setProperty("--chalk-author", "");
					var selected = step.chalkSelections.find(mark =>
						mark.row == row && mark.symbol == symbol && mark.column == col);
					var removed = !(domains[symbol] & (1 << col));
					if (selected) {
						elem.className += " pencil-selected " +
							(selected.explicit ? "pencil-explicit" : "pencil-derived");
						if (removed)
							elem.className += " pencil-contradiction";
					} else if (removed) {
						elem.className += " pencil-removed pencil-derived";
					}
					if (step.row == row && step.symbol == symbol &&
					    (step.placement ? step.column == col || step.domain == (1 << col) :
					     step.removed & (1 << col)))
						elem.className += " proof-change";
				}
			}
		}
	}

	/* Reveal assistance in stages without applying moves to the board. */
	this.hint = function(stage = 3, committed = false) {
		this.recordMoveEvent("hint", { stage });
		if (this.suppose || this.supposeReplay || this.actionController?.replay)
			return;
		if (this.gameOver || this.pendingSeed !== undefined || this.paused) {
			console.log("Start or resume a game before requesting a hint.");
			return;
		}
		if (!this.practiceMode && !this.hintAcknowledged) {
			this.pendingHint = { stage, gameIdentity: this.gameIdentity };
			this.closeSlotTray();
			this.toggleModal(this.hintNotice, this.explainButton, "Keep solving");
			this.hintNotice.querySelector(".modal-close").focus();
			return;
		}
		if (this.restoredClueHighlight)
			this.clearHint();
		if (this.actionController && !committed)
			return this.actionController.requestAction({ type: "hint", stage });
		if (this.hintRequest) {
			if (this.hintRequest.stalled && stage < 3 && this.hintRequest.exploration) {
				var exploration = this.hintRequest.exploration;
				this.hintRequest.stage = 2;
				this.setHintHighlights([this.rows[exploration.row].slots[exploration.column]
					.possibilityElems[exploration.symbol]]);
				this.showHintExplanation("Try placing " +
					proofSymbolReference(this, exploration.row, exploration.symbol) +
					" in column " + (exploration.column + 1) + " with chalk.");
			} else {
				this.showHint(this.hintRequest.stalled ? 3 : stage);
			}
			return;
		}
		var base = domainsFromSlots(this);
		var basePlacements = proofPlacementsFromSlots(this);

		var step = nextHintStep(this, base, basePlacements);
		if (!step) {
			if (this.extreme) {
				this.prepareHint();
				var lemma = bestChalkLemma(this, base, basePlacements);
				var exploration = lemma.find(step => step.lemmaStage == "assumption");
				this.hintRequest = { stalled: true, stage: 1, exploration, lemma,
					base, basePlacements, step: null };
				var message = "No deduction available. Press Hint again for a walkthrough.";
				if (exploration) {
					var { row, symbol, column } = exploration;
					var positions = countBits(base[row][symbol]);
					var symbols = base[row].filter(bits => bits & (1 << column)).length;
					if (symbols < positions) {
						var slot = this.rows[row].slots[column];
						this.setHintHighlights([slot.elem]);
						var choices = base[row].flatMap((bits, candidate) =>
							bits & (1 << column) ? [proofSymbolReference(this, row, candidate)] : []);
						message = "Explore the choice of " +
							new Intl.ListFormat("en", { type: "disjunction" }).format(choices) + ".";
					} else {
						this.setHintHighlights(this.rows[row].slots.flatMap((slot, c) =>
							base[row][symbol] & (1 << c) ? [slot.possibilityElems[symbol]] : []));
						message = "Explore the possible positions of " +
							proofSymbolReference(this, row, symbol) + " with chalk.";
					}
				}
				this.showHintExplanation(message);
				this.fadeMessage();
			} else {
				console.log("No further deduction is available.");
			}
			return;
		}
		this.prepareHint();
		this.hintRequest = { base, basePlacements, step, stage: 0 };
		this.say("A little enlightenment. Consider the highlighted clue.");
		this.showHint(stage);
	}

	this.prepareHint = function() {
		if (this.proof)
			this.closeProof();
		this.clearPracticeMistake();
		this.closeSlotTray();
		this.practiceMode = true;
		this.scoreEligible = false;
		this.stopTimer();
		this.updatePauseControl();
	}

	this.showHintExplanation = function(message) {
		this.updateRevealClueControl(true);
		this.proofControls.classList.add("hint-explanation");
		this.proofControls.hidden = false;
		this.proofControls.querySelector(".proof-previous").disabled = true;
		this.proofControls.querySelector(".proof-next").disabled = true;
		this.proofControls.querySelector(".proof-position").textContent = "Hint";
		renderProofMessage(this,
			this.proofControls.querySelector(".proof-deduction"), message, false);
	}

	this.updateRevealClueControl = function(available) {
		this.proofControls.querySelector(".proof-reveal").hidden =
			!available || !this.extreme || !this.hintRequest?.stalled ||
			!this.originalClues.some(clue => !this.clues.includes(clue));
	}

	this.requestExtremeClue = function() {
		if (!this.extreme || this.gameOver || this.paused ||
		    !this.hintRequest?.stalled)
			return;
		var domains = domainsFromSlots(this);
		var placements = proofPlacementsFromSlots(this);
		var removed = this.originalClues.filter(clue => !this.clues.includes(clue));
		var step = nextHintStep(this, domains, placements, removed);
		var clue = step?.clues?.[0] || removed.find(clue =>
			clue.constrain(copyDomains(domains), (1 << this.rows[0].slots.length) - 1)) || removed[0];
		if (!clue)
			return;
		var index = this.originalClues.indexOf(clue);
		if (this.actionController)
			return this.actionController.requestAction({ type: "reveal-clue", clue: index });
		this.revealExtremeClue(index);
	}

	this.revealExtremeClue = function(index, assist = true) {
		var clue = this.originalClues?.[index];
		if (!this.extreme || !clue || this.clues.includes(clue))
			return false;
		this.recordMoveEvent("reveal-clue", { index });
		this.clearHint();
		this.clues.push(clue);
		this.revealedClues.push(index);
		if (clue.displayType) {
			clue.display = clue.displayType == "horizontal" ?
				this.getHClueSlot() : this.getVClueSlot();
			clue.active = true;
			checkClueDisplay(clue);
		}
		if (assist) {
			if (this.proof)
				this.closeProof();
			this.clearPracticeMistake();
			this.closeSlotTray();
			this.practiceMode = true;
			this.scoreEligible = false;
			this.stopTimer();
			this.updatePauseControl();
			if (clue.applyInitialState)
				clue.applyInitialState();
			if (clue.display) {
				clue.display.classList.add("hint-current");
				this.restoredClueHighlight = clue;
			}
			this.say(clue.display ? "A removed clue has been revealed and highlighted." :
				"A removed starting tile has been revealed.");
		}
		return true;
	}

	this.finishHintNotice = function(accept) {
		var request = this.pendingHint;
		if (!request)
			return;
		this.pendingHint = null;
		this.toggleModal(this.hintNotice, this.explainButton, "Keep solving");
		this.explainButton.focus();
		if (!accept || request.gameIdentity !== this.gameIdentity || this.gameOver)
			return;
		this.hintAcknowledged = true;
		try {
			localStorage.setItem("hintAcknowledged", "true");
		} catch (e) {
			/* Keep the acknowledgement for this page if storage is unavailable. */
		}
		this.hint(request.stage);
	}

	this.setHintHighlights = function(elements) {
		for (var elem of this.hintRequest.highlights || [])
			elem.classList.remove("hint-current");
		this.hintRequest.highlights = elements;
		for (var elem of elements)
			elem.classList.add("hint-current");
	}

	this.clearHint = function() {
		if (this.restoredClueHighlight) {
			this.restoredClueHighlight.display?.classList.remove("hint-current");
			this.restoredClueHighlight = null;
		}
		if (this.pendingHint)
			this.finishHintNotice(false);
		if (!this.hintRequest)
			return;
		this.setHintHighlights([]);
		this.hintRequest = null;
		this.proofControls.hidden = true;
		this.proofControls.classList.remove("hint-explanation");
		for (var clue of this.clues)
			if (clue.display)
				clue.display.classList.remove("hint-current");
		this.fadeMessage();
	}

	this.showHint = function(stage) {
		var request = this.hintRequest;
		request.stage = stage;
		var step = request.step;
		if (stage < 3) {
			for (var clue of step.clues)
				clue.display.classList.add("hint-current");
			if (stage == 2)
				this.showHintExplanation(step.message);
			return;
		}
		var steps = buildHintSteps(this, step, request.base, request.basePlacements, request.lemma);
		if (!steps.length)
			return;
		steps[steps.length - 1].conclusion = true;
		this.clearHint();
		this.proof = {
			hint: true,
			steps: steps,
			base: request.base,
			basePlacements: request.basePlacements,
			position: 1,
			continueGame: true,
		};
		this.openProofDisplay();
	}

	this.startProof = function(failedSlot, failedValue, continueGame,
			   emphasizeButton) {
		var base = domainsFromSlots(this);
		var basePlacements = proofPlacementsFromSlots(this);
		var steps = buildProofSteps(this, base, basePlacements,
			failedSlot, failedValue);
		if (!steps.length)
			return;
		this.proof = {
			steps: steps,
			base: base,
			basePlacements: basePlacements,
			position: 1,
			failedSlot: failedSlot,
			failedValue: failedValue,
			continueGame: !!continueGame,
			emphasizeButton: !!emphasizeButton,
		};
		this.openProofDisplay();
	}

	this.openProofDisplay = function() {
		this.leaveSuppose(true);
		this.updateSupposeControls();
		this.updateRevealClueControl(false);
		this.updateChalkControls();
		this.proofControls.hidden = false;
		document.body.classList.add("proof-active");
		this.explainButton.disabled = false;
		this.explainButton.classList.add("active");
		this.explainButton.classList.remove("proof-available");
		this.explainButton.setAttribute("aria-pressed", "true");
		this.showProofPosition();
	}

	this.explainLoss = function() {
		if (this.proof) {
			this.closeProof();
			return;
		}
		if (!this.pendingProof) {
			this.hint(this.hintRequest ? this.hintRequest.stage + 1 : 1);
			return;
		}
		var request = this.pendingProof;
		this.pendingProof = null;
		this.startProof(request.failedSlot, request.failedValue,
			request.continueGame, request.emphasizeButton);
	}

	this.closeProof = function() {
		if (!this.proof)
			return;
		var proof = this.proof;
		for (var i = 0; i < this.clues.length; i++)
			if (this.clues[i].display)
				this.clues[i].display.classList.remove("proof-current");
		this.pendingProof = proof.hint ? null : {
			continueGame: proof.continueGame,
			emphasizeButton: proof.emphasizeButton,
			failedSlot: proof.failedSlot,
			failedValue: proof.failedValue,
		};
		this.proof = null;
		this.updateSupposeControls();
		this.updateChalkControls();
		this.proofControls.hidden = true;
		document.body.classList.remove("proof-active");
		this.explainButton.classList.remove("active", "proof-available");
		this.explainButton.setAttribute("aria-pressed", "false");
		if (proof.continueGame)
			this.restorePlayDisplay();
		else
			this.revealSolution();
		if (proof.hint)
			this.explainButton.disabled = false;
		else
			proof.failedSlot.possibilityElems[proof.failedValue].classList.add(
				"failed-action");
	}

	this.restorePlayDisplay = function() {
		for (var i = 0; i < this.rows.length; i++) {
			for (var j = 0; j < this.rows[i].slots.length; j++) {
				var slot = this.rows[i].slots[j];
				if (slot.single)
					slot.displaySingle();
				else
					slot.displayPossible();
			}
			this.renderPencilMarks(this.rows[i]);
		}
		if (this.suppose)
			this.renderSuppose();
	}

	this.clearPracticeMistake = function() {
		if (!this.practiceMistake)
			return;
		for (var i = 0; i < this.practiceMistake.clueStates.length; i++) {
			var state = this.practiceMistake.clueStates[i];
			state.clue.active = state.active;
			state.clue.display.classList.remove("contradiction",
				"proof-current");
			checkClueDisplay(state.clue);
		}
		this.hClues.classList.remove("solution");
		this.vClues.classList.remove("solution");
		for (var row = 0; row < this.rows.length; row++)
			for (var col = 0; col < this.rows[row].slots.length; col++) {
				var slot = this.rows[row].slots[col];
				slot.singleElem.classList.remove("failed-action");
				for (var value = 0; value < slot.possibilityElems.length;
				     value++)
					slot.possibilityElems[value].classList.remove(
						"failed-action");
			}
		this.pendingProof = null;
		this.practiceMistake = null;
		this.explainButton.disabled = this.gameOver;
		this.explainButton.classList.remove("proof-available");
		this.messages.classList.remove("lost");
		this.say("");
	}

	this.showProofPosition = function() {
		if (!this.proof)
			return;
		for (var i = 0; i < this.clues.length; i++)
			if (this.clues[i].display)
				this.clues[i].display.classList.remove("proof-current");

		var position = this.proof.position;
		var positionElem = this.proofControls.querySelector(
			".proof-position");
		var deductionElem = this.proofControls.querySelector(
			".proof-deduction");
		if (position == 0) {
			this.renderProofDomains(this.proof.base,
				this.proof.basePlacements);
			positionElem.textContent = "Before the proof";
			deductionElem.textContent = this.proof.hint ?
				"The board as it stood." :
				"The board as it stood before the mistake.";
		} else {
			var step = this.proof.steps[position - 1];
			if (step.chalkBase)
				this.renderChalkProof(step);
			else
				this.renderProofDomains(step.domains, step.placements, step);
			if (step.conclusion) {
				positionElem.textContent = "Conclusion";
			} else if (step.walkthroughNumber) {
				positionElem.textContent = "Step " + step.walkthroughNumber +
					(step.lemmaStage == "start" ? " — Lemma" :
					 step.lemmaStage == "end" ? " — Lemma proved" : "");
			} else {
				positionElem.textContent = "Step " + position + " of " +
					this.proof.steps.length;
			}
			renderProofMessage(this, deductionElem, step.message,
				step.conclusion && !step.stalled, step.contradicts);
			for (var i = 0; i < step.clues.length; i++)
				step.clues[i].display.classList.add("proof-current");
		}
		this.proofControls.querySelector(".proof-previous").disabled =
			position == 0;
		this.proofControls.querySelector(".proof-next").disabled =
			position == this.proof.steps.length;
	}

	this.moveProof = function(direction) {
		if (!this.proof)
			return;
		var position = this.proof.position + direction;
		if (position < 0 || position > this.proof.steps.length)
			return;
		this.proof.position = position;
		this.playSound("clue");
		this.showProofPosition();
	}

	this.supposeModel = function(state = this.suppose) {
		return new SupposeModel(this, state);
	}

	/* Nested explorations. All hypothetical moves stay in
	 * domains; Slot.value and the committed board are never modified. */
	this.hasSupposeConflict = function() {
		return !!this.suppose?.sharedConflicts.some(Boolean);
	}

	/* Metadata for the displayed step, shared by rendering and snapshots. */
	this.supposePositionInfo = function() {
		return this.supposeModel().positionInfo();
	}

	this.supposeSnapshot = function() {
		return this.supposeModel().snapshot();
	}

	this.enterSuppose = function(button) {
		if (this.actionController?.joinRequest) return;
		if (this.supposeReplay || this.gameOver || this.paused ||
		    this.proof || this.pendingSeed !== undefined)
			return;
		if (this.suppose && (!this.suppose.assumption || this.suppose.pending || this.hasSupposeConflict()))
			return;
		if (this.suppose && this.actionController)
			return this.actionController.requestBranchAction({ type: "nest" });
		var parent = this.suppose;
		this.recordMoveEvent("suppose-enter");
		this.supposeLauncher = button || this.supposeButton;
		this.clearHint();
		this.clearPracticeMistake();
		this.closeSlotTray();
		var model = this.supposeModel();
		model.enter();
		this.suppose = model.suppose;
		document.body.classList.add("suppose-active");
		this.actionController?.requestHover(null);
		if (!parent)
			this.actionController?.supposeChanged(true);
		this.updateSupposeControls();
		this.updateChalkControls();
		this.updateActionCursor();
		this.renderSuppose();
	}

	this.updateSupposeControls = function() {
		if (this.paused)
			this.cancelSupposeRewind();
		this.supposeButton.hidden = this.showActionSelector;
		this.supposeTap.hidden = !this.showActionSelector;
		this.supposeFooter.hidden = this.supposeButton.hidden;
		for (var button of [this.supposeButton, this.supposeTap, this.supposeFooter]) {
			button.disabled = !!(this.actionController?.joinRequest ||
				this.gameOver || this.paused || this.proof || this.supposeReplay ||
				this.pendingSeed !== undefined ||
				this.suppose && (!this.suppose.assumption || this.suppose.pending || this.hasSupposeConflict()));
			button.setAttribute("aria-expanded", String(!!this.suppose));
		}
		this.supposeControls.hidden = !this.suppose;
		if (this.suppose)
			this.explainButton.disabled = true;
	}

	this.saveSupposeStep = function(move = null) {
		return this.supposeModel().saveSupposeStep(move);
	}

	this.supposeMoveMessage = function({ row, column, symbol, discard }, first = false) {
		return this.supposeModel().supposeMoveMessage({ row, column, symbol, discard }, first);
	}

	this.applySupposeAction = function(slot, symbol, action) {
		if (this.actionController?.joinRequest) return;
		if (!this.suppose || this.suppose.pending || this.hasSupposeConflict() || this.paused || this.gameOver || slot.single)
			return;
		if (this.actionController)
			return this.actionController.requestBranchAction({ type: action == "remove" || action == "pencil-remove" ? "remove" : "place",
				row: this.rows.indexOf(slot.row), column: slot.row.slots.indexOf(slot), value: symbol });
		var row = this.rows.indexOf(slot.row), column = slot.row.slots.indexOf(slot);
		var discard = action == "remove" || action == "pencil-remove";
		var model = this.supposeModel();
		model.applySupposeAction(slot, symbol, action);
		if (!model.sound) return;
		this.playSound(model.sound);
		this.recordMoveEvent("suppose-move", { row, column, symbol, discard });
		this.renderSuppose();
	}

	this.toggleSupposeClue = function(clue) {
		if (this.actionController?.joinRequest) return;
		if (this.paused || !this.suppose || this.suppose.pending || this.hasSupposeConflict() || !clue.active)
			return;
		if (this.actionController) {
			var index = this.clues.indexOf(clue);
			return this.actionController.requestBranchAction({ type: "clue", clue: index,
				dismissed: !this.suppose.dismissed.includes(index) });
		}
		var model = this.supposeModel();
		model.toggleSupposeClue(clue);
		if (model.sound) this.playSound(model.sound);
		this.renderSuppose();
	}

	/* Only judge a clue once all of its symbols have been placed. */
	this.supposeClueSatisfied = function(clue) {
		return this.supposeModel().supposeClueSatisfied(clue);
	}

	this.dismissSupposeClues = function() {
		return this.supposeModel().dismissSupposeClues();
	}

	this.moveSuppose = function(offset) {
		if (this.actionController?.joinRequest) return;
		this.cancelSupposeRewind();
		if (!this.suppose || this.suppose.pending || this.paused)
			return;
		if (this.actionController) {
			var position = Math.max(0, Math.min(this.suppose.history.length - 1, this.suppose.position + offset));
			if (position === this.suppose.position) return;
			return this.actionController.requestBranchAction({ type: "navigate", position });
		}
		var state = this.suppose;
		var position = Math.max(0, Math.min(state.history.length - 1, state.position + offset));
		if (position == state.position)
			return;
		this.closeSlotTray();
		this.supposeModel().moveSuppose(offset);
		this.recordMoveEvent("suppose-rewind");
		this.renderSuppose();
	}

	this.supposeRewindTarget = function() {
		return this.supposeModel().supposeRewindTarget();
	}

	this.cancelSupposeRewind = function() {
		clearTimeout(this.supposeRewindTimer);
		this.supposeRewindTimer = null;
	}

	this.rewindSupposeConflict = function() {
		if (this.actionController?.joinRequest) return;
		this.cancelSupposeRewind();
		if (!this.suppose || this.suppose.pending || this.paused)
			return;
		if (this.actionController)
			return this.actionController.requestBranchAction({ type: "rewind" });
		var target = this.supposeRewindTarget();
		if (!target)
			return;
		/* A branch's initial position is its parent's current position.
		 * Cross that boundary without spending another beat on the same board. */
		while (this.suppose !== target.state && !this.suppose.position)
			this.leaveSuppose();
		if (this.suppose !== target.state || this.suppose.position > target.position)
			this.moveSuppose(-1);
		this.suppose.history.length = this.suppose.position + 1;
		this.renderSuppose();
		/* Recompute the destination each time: shared moves may have exposed
		 * an earlier conflict while we were stepping backwards. */
		if (this.suppose !== target.state || this.suppose.position > target.position)
			this.supposeRewindTimer = setTimeout(() => this.rewindSupposeConflict(), 300);
		else
			this.supposeControls.querySelector(".suppose-leave").focus();
	}

	this.restoreSuppose = function(state) {
		this.suppose = state;
		document.body.classList.add("suppose-active");
		this.updateChalkControls();
		this.updateActionCursor();
		this.reconcileSuppose();
	}

	/* Intersect every saved position so rewinding cannot resurrect a
	 * possibility removed from the shared board. Keep empty domains: they
	 * explain where the private exploration now contradicts real moves. */
	this.reconcileSuppose = function() {
		if (!this.suppose)
			return;
		var oldConflicts = Object.keys(this.suppose.sharedConflictMessages).length;
		this.supposeModel().reconcile();
		if (Object.keys(this.suppose.sharedConflictMessages).length > oldConflicts)
			this.playSound("practice-mistake");
		this.renderSuppose();
	}

	this.markSupposeConflict = function(tile, conflict, message = "", discarded = false) {
		if (conflict) {
			tile.classList.add("suppose-conflict");
			tile.classList[discarded ? "add" : "remove"]("suppose-conflict-discarded");
			tile.title = message;
		} else if (tile.classList.contains("suppose-conflict")) {
			tile.classList.remove("suppose-conflict", "suppose-conflict-discarded");
			tile.title = "";
		}
	}

	this.renderSuppose = function() {
		var state = this.suppose;
		var previous = state.displayed;
		state.displayed = copyDomains(state.domains);
		var conflict = false;
		for (var r = 0; r < this.rows.length; r++) {
			var row = this.rows[r];
			row.elem.classList.remove("pencil-conflict");
			var rowConflict = propagatePencilRow(state.domains[r].slice());
			if (rowConflict) {
				row.elem.classList.add("pencil-conflict");
				conflict = true;
			}
			for (var c = 0; c < row.slots.length; c++) {
				var slot = row.slots[c];
				for (var tile of [slot.singleElem, ...slot.possibilityElems])
					this.markSupposeConflict(tile, false);
				if (slot.single) {
					slot.elem.classList.remove("suppose-placed");
					renderTileSymbol(slot.singleElem, slot.symbols[slot.value]);
					continue;
				}
				var placed = state.domains[r].findIndex(bits => bits == (1 << c));
				slot.elem.classList.remove("suppose-placed");
				if (placed >= 0) {
					slot.elem.classList.add("suppose-placed");
					if (!previous || previous[r][placed] != (1 << c)) {
						renderTileSymbol(slot.singleElem, slot.symbols[placed]);
						slot.displaySingle(previous ? slot.possibilityElems[placed] : null, true);
					}
				} else {
					slot.singleElem.hidden = true;
					slot.possibleElem.hidden = false;
				}
				slot.possibleElem.className = "";
				for (var v = 0; v < slot.possibilityElems.length; v++) {
					var tile = slot.possibilityElems[v];
					tile.className = "possibility";
					tile.classList.remove("suppose-removed");
					if (!(state.base[r][v] & (1 << c)))
						tile.className += " dead-possibility";
					else if (!(state.domains[r][v] & (1 << c)))
						tile.classList.add("suppose-removed");
				}
			}
		}
		for (var [r, row] of this.rows.entries())
			for (var [c, slot] of row.slots.entries())
				for (var v = 0; v < slot.possibilityElems.length; v++) {
					if (!(state.conflictTiles[r][v] & (1 << c)))
						continue;
					/* Once shared play places a symbol, show its conflict
					 * there, not at superseded tentative placements. */
					var shared = state.base[r][v];
					if (shared && !(shared & (shared - 1)) && shared != (1 << c))
						continue;
					var message = shared & (1 << c) ?
						"Another player placed this tile; you had discarded it." :
						"Another player discarded this tile; your supposition needed it.";
					this.markSupposeConflict(slot.possibilityElems[v], true, message,
						!(state.base[r][v] & (1 << c)));
					if (slot.single && slot.value == v)
						this.markSupposeConflict(slot.singleElem, true, message);
				}
		for (var [index, clue] of this.clues.entries()) {
			if (!clue.display)
				continue;
			clue.display.classList.remove("suppose-dismissed");
			if (state.dismissed.includes(index))
				clue.display.classList.add("suppose-dismissed");
		}
		var branch = this.actionController?.branchForPlayer();
		var shared = branch?.participants.length > 1;
		var message = state.pending ? "Waiting for the host to apply these moves." : state.message ||
			"Choose or discard a tile to begin your supposition.";
		var sharedConflict = this.hasSupposeConflict();
		/* Later deductions inherit the conflict, but retain their own
		 * descriptions. Explain it at the step which introduced it. */
		var info = this.supposePositionInfo();
		var stepConflict = Object.entries(state.sharedConflictMessages).find(([tile]) =>
			!info.previousConflicts[tile]);
		if (!state.pending && stepConflict)
			message = stepConflict[1];
		else if (conflict && !sharedConflict)
			message += " These possibilities conflict within a row.";
		renderProofMessage(this, this.supposeControls.querySelector(".suppose-assumption"), message, false);
		var position = this.supposeControls.querySelector(".proof-position");
		position.textContent = (state.position ? "· Step " + info.label :
			info.nested ? "· Nested" : "") + (sharedConflict ? " · Conflict" : "");
		position.hidden = !position.textContent;
		position.title = position.textContent;
		var reminder = this.supposeControls.querySelector(".suppose-reminder");
		reminder.hidden = !state.assumption;
		if (state.assumption) {
			var { row, symbol, discard } = state.assumption;
			var tile = document.createElement("span");
			tile.className = "proof-tile " + this.rows[row].familyClass;
			tile.setAttribute("data-discard", String(discard));
			renderTileSymbol(tile, this.rows[row].slots[0].symbols[symbol]);
			reminder.replaceChildren(tile);
			var assumptionText = proofMessageText(this, this.supposeMoveMessage(state.assumption, true));
			reminder.title = assumptionText;
			reminder.setAttribute("aria-label", assumptionText);
		}
		var watchers = branch?.participants.filter(id => id != this.actionController.playerId) || [];
		var names = watchers.map(id => this.actionController.players.find(player => player.id == id)?.name || "Player");
		var presence = this.supposeControls.querySelector(".suppose-watchers");
		presence.hidden = !watchers.length;
		var exit = this.supposeControls.querySelector(".suppose-exit");
		exit.hidden = !shared;
		exit.disabled = !!state.pending;
		var eye = presence.querySelector("button");
		if (!watchers.length) eye.setAttribute("aria-expanded", "false");
		eye.setAttribute("aria-label", "Participating: " + names.join(", "));
		var roster = presence.querySelector(".suppose-watcher-names");
		roster.replaceChildren(...watchers.map((id, index) => {
			var entry = document.createElement("span");
			entry.className = "suppose-participant";
			var color = document.createElement("span");
			color.className = "suppose-participant-color";
			color.setAttribute("aria-hidden", "true");
			color.style.setProperty("background-color", this.actionController.colorForPlayer(id));
			var name = document.createElement("span");
			name.className = "suppose-participant-name";
			name.textContent = names[index];
			entry.append(color, name);
			return entry;
		}));
		this.updateSupposeControls();
		this.supposeControls.querySelector(".proof-previous").disabled = !!state.pending || !state.position;
		this.supposeControls.querySelector(".proof-next").disabled = !!state.pending || state.position == state.history.length - 1;
		var target = this.supposeRewindTarget();
		var rewind = this.supposeControls.querySelector(".suppose-rewind");
		rewind.hidden = !target;
		rewind.disabled = !!state.pending;
		if (target)
			rewind.title = "Discard conflicting steps and return to " + (target.position ?
				"step " + target.state.history[target.position].label :
				"the start of the supposition");
		var accept = this.supposeControls.querySelector(".suppose-accept");
		accept.hidden = this.hasSupposeConflict();
		accept.textContent = state.parent ? "Keep moves" : "Apply moves";
		accept.title = state.parent ? "Keep these moves in the enclosing supposition" :
			"Apply the moves through this step to the real board";
		accept.disabled = !!state.pending || !state.parent && !!this.actionController?.replay || !state.position && !state.dismissed.length;
		this.supposeControls.querySelector(".suppose-reject").hidden = this.hasSupposeConflict();
		this.supposeControls.querySelector(".suppose-reject").disabled = !!state.pending || !state.parent && !!this.actionController?.replay || !state.assumption;
		this.supposeControls.querySelector(".suppose-leave").disabled = !!state.pending;
		this.supposeControls.querySelector(".suppose-leave").textContent = "Back out";
		if (this.expandedSlot)
			this.renderSlotTray();
	}

	/* Once an exploration becomes real, use the usual move checking and
	 * propagation. Stop at the first mistake, including in practice mode. */
	this.cancelSupposeReplay = function() {
		var replay = this.supposeReplay;
		if (!replay)
			return;
		this.supposeReplay = null;
		clearTimeout(replay.timer);
		replay.wake?.();
		this.updatePauseControl();
		this.updateSupposeControls();
		this.explainButton.disabled = this.gameOver && !this.pendingProof;
	}

	this.acceptSuppose = async function() {
		if (this.actionController?.joinRequest) return;
		if (!this.suppose || this.suppose.pending || this.hasSupposeConflict() || this.paused ||
		    !this.suppose.parent && this.actionController?.replay)
			return;
		if (this.actionController)
			return this.actionController.requestBranchAction({ type: "apply" });
		var state = this.suppose;
		this.recordMoveEvent("suppose-keep");
		var steps = state.history.slice(1, state.position + 1);
		if (state.parent) {
			this.supposeModel().keep();
			this.leaveSuppose();
			this.playSound("clue");
			return;
		}
		this.leaveSuppose(true);
		var replay = this.supposeReplay = {};
		this.updatePauseControl();
		this.updateSupposeControls();
		this.explainButton.disabled = true;
		var wait = () => new Promise(resolve => {
			replay.wake = resolve;
			replay.timer = setTimeout(resolve, 300);
		});
		try {
			for (var i = 0; i < steps.length; i++) {
				if (i)
					await wait();
				while (this.supposeReplay === replay && this.paused)
					await wait();
				if (this.supposeReplay !== replay || this.gameOver)
					return;
				var move = steps[i].move;
				var slot = this.rows[move.row].slots[move.column];
				if (slot.single || !slot.possible[move.symbol])
					continue;
				this.applyTileAction(slot, move.symbol, move.discard ? "remove" : "place");
				/* Practice mode reports mistakes without ending the game. */
				if ((slot.value == move.symbol) == move.discard || this.gameOver)
					return;
			}
			this.withEffectsSuppressed(() => {
				for (var index of state.dismissed)
					this.applyClueAction(this.clues[index], false);
			});
		} finally {
			if (this.supposeReplay === replay)
				this.cancelSupposeReplay();
		}
	}

	this.rejectSuppose = function() {
		if (this.actionController?.joinRequest) return;
		if (!this.suppose?.assumption || this.suppose.pending || this.hasSupposeConflict() || this.paused ||
		    !this.suppose.parent && this.actionController?.replay)
			return;
		if (this.actionController)
			return this.actionController.requestBranchAction({ type: "reject" });
		var assumption = this.suppose.assumption;
		this.recordMoveEvent("suppose-reject", { ...assumption });
		this.leaveSuppose();
		this.requestTileAction(this.rows[assumption.row].slots[assumption.column],
			assumption.symbol, assumption.discard ? "place" : "remove");
	}

	this.leaveSuppose = function(all = false) {
		if (this.actionController?.ready && !this.actionController.updatingBranches && this.suppose)
			return this.actionController.requestBranchAction({ type: !all && this.suppose.parent ? "back-out" : "leave" });
		this.cancelSupposeRewind();
		if (!this.suppose || this.suppose.pending && !all)
			return;
		this.recordMoveEvent("suppose-leave", { all });
		this.closeSlotTray();
		if (!all && this.suppose.parent) {
			var displayed = this.suppose.displayed;
			this.suppose = this.suppose.parent;
			this.suppose.displayed = displayed;
			this.renderSuppose();
			return;
		}
		this.suppose = null;
		this.supposeControls.querySelector(".suppose-watchers button").setAttribute("aria-expanded", "false");
		this.actionController?.supposeChanged(false);
		document.body.classList.remove("suppose-active");
		for (var row of this.rows)
			for (var slot of row.slots) {
				slot.elem.classList.remove("suppose-placed");
				for (var tile of [slot.singleElem, ...slot.possibilityElems])
					this.markSupposeConflict(tile, false);
				renderTileSymbol(slot.singleElem, slot.symbols[slot.value]);
				for (var tile of slot.possibilityElems)
					tile.classList.remove("suppose-removed");
			}
		for (var clue of this.clues)
			clue.display?.classList.remove("suppose-dismissed");
		this.restorePlayDisplay();
		this.explainButton.disabled = this.gameOver && !this.pendingProof;
		this.updateSupposeControls();
		this.updateChalkControls();
		this.updateActionCursor();
		(this.supposeLauncher || this.supposeButton).focus();
	}

	this.updateChalkControls = function() {
		var show = (this.pencilMarks.length > 0 || this.clues.some(clue => clue.chalkMark)) && !this.gameOver;
		this.eraseChalkBoard.hidden = !show || this.showActionSelector;
		this.eraseChalkTap.hidden = !show || !this.showActionSelector;
		this.eraseChalkFooter.hidden = this.eraseChalkBoard.hidden;
		for (var button of [this.eraseChalkBoard, this.eraseChalkTap,
				   this.eraseChalkFooter])
			button.disabled = !!(this.manualPaused || this.proof || this.suppose);
	}

	this.eraseChalkMarks = function() {
		if (this.suppose)
			return;
		if (this.gameOver || this.paused || this.proof ||
		    (!this.pencilMarks.length && !this.clues.some(clue => clue.chalkMark)))
			return;
		if (this.actionController)
			return this.actionController.requestAction({ type: "chalk-clear" });
		this.clearPencilMarks();
		if (this.expandedSlot)
			this.renderSlotTray();
	}

	this.clearPencilMarks = function() {
		this.pencilMarks = [];
		for (var clue of this.clues) {
			if (clue.chalkMark) {
				delete clue.chalkMark;
				checkClueDisplay(clue);
			}
		}
		for (var i = 0; i < this.rows.length; i++)
			this.rows[i].clearPencilDisplay();
		this.updateChalkControls();
	}

	this.openSlotTray = function(slot) {
		if (this.gameOver || this.paused || this.proof || slot.single)
			return;
		this.closeSlotTray();
		this.expandedSlot = slot;
		this.animateSlotTray = true;
		slot.elem.classList.add("expanded");
		setDialogOpen(this.slotTray, true);
		this.renderSlotTray();
		this.slotTrayTiles.find(tile => !tile.disabled)?.focus({ preventScroll: true });
	}

	this.closeSlotTray = function() {
		if (this.expandedSlot)
			this.expandedSlot.elem.classList.remove("expanded");
		this.expandedSlot = null;
		setDialogOpen(this.slotTray, false);
		this.slotTray.classList.remove(
			"opening");
	}

	this.positionSlotTray = function() {
		var animate = this.animateSlotTray;
		this.animateSlotTray = false;
		if (!this.expandedSlot || typeof innerWidth == "undefined")
			return;
		var target = this.expandedSlot.elem;
		var panel = this.slotTray;
		if (!target.getBoundingClientRect || !panel.getBoundingClientRect)
			return;
		var targetRect = target.getBoundingClientRect();
		var panelRect = panel.getBoundingClientRect();
		var margin = 8;
		var left = targetRect.left + targetRect.width / 2 -
			panelRect.width / 2;
		var top = targetRect.top + targetRect.height / 2 -
			panelRect.height / 2;
		left = Math.max(margin,
			Math.min(left, innerWidth - panelRect.width - margin));
		top = Math.max(margin,
			Math.min(top, innerHeight - panelRect.height - margin));
		panel.style.left = left + "px";
		panel.style.top = top + "px";
		if (animate && panel.style.setProperty) {
			panel.style.setProperty("--tray-start-x",
				(targetRect.left - left) + "px");
			panel.style.setProperty("--tray-start-y",
				(targetRect.top - top) + "px");
			panel.style.setProperty("--tray-start-scale-x",
				targetRect.width / panelRect.width);
			panel.style.setProperty("--tray-start-scale-y",
				targetRect.height / panelRect.height);
			panel.classList.add("opening");
		}
	}

	this.setActionController = function(controller) {
		this.cancelSupposeReplay();
		this.leaveSuppose(true);
		if (controller) {
			this.dailyReturn = null;
			this.daily = null;
			this.setInvitationResult(false);
		}
		this.actionController = controller;
	}

	/*
	 * Keep requests made by a player separate from actions which have
	 * already been accepted. A multiplayer controller can send the former
	 * to its host and call applyTileAction() when the host commits them.
	 */
	this.requestTileAction = function(slot, value, action) {
		if (this.supposeReplay)
			return;
		if (this.suppose)
			return this.applySupposeAction(slot, value, action);
		if (this.actionController)
			return this.actionController.requestTileAction(
				slot, value, action);
		return this.applyTileAction(slot, value, action);
	}

	this.requestClueAction = function(clue, active) {
		if (this.supposeReplay)
			return;
		if (this.suppose)
			return this.toggleSupposeClue(clue);
		if (this.proof)
			return false;
		if (this.actionController)
			return this.actionController.requestClueAction(clue, active);
		return this.applyClueAction(clue, active);
	}

	this.requestChalkClue = function(clue) {
		if (this.supposeReplay)
			return;
		if (this.suppose)
			return this.toggleSupposeClue(clue);
		if (this.gameOver || this.paused || this.proof || !clue.display || !clue.active)
			return false;
		var marked = !clue.chalkMark;
		if (this.actionController)
			return this.actionController.requestAction({ type: "chalk-clue",
				clue: this.clues.indexOf(clue), marked });
		this.setChalkClue(clue, marked);
	}

	this.setChalkClue = function(clue, marked, actor, color) {
		if (marked && !clue.chalkMark)
			clue.chalkMark = { actor, color };
		else if (!marked)
			delete clue.chalkMark;
		checkClueDisplay(clue);
		this.updateChalkControls();
	}

	this.applyClueAction = function(clue, active) {
		delete clue.chalkMark;
		if (clue.active && !active)
			this.playSound("clue");
		/* A temporary contradiction reveal must not undo this choice. */
		if (this.practiceMistake)
			for (var state of this.practiceMistake.clueStates)
				if (state.clue == clue)
					state.active = active;
		clue.active = active;
		checkClueDisplay(clue, true);
		this.updateChalkControls();
	}

	this.withEffectsSuppressed = function(callback) {
		var old = this.effectsSuppressed;
		this.effectsSuppressed = true;
		try {
			return callback();
		} finally {
			this.effectsSuppressed = old;
		}
	}

	this.applyTileAction = function(slot, value, action, options) {
		options = options || {};
		var playerAction = options.playerAction !== false;
		if (action == "place")
			slot.choose(value, playerAction);
		else if (action == "remove")
			slot.discard(value, playerAction);
		else
			slot.pencil(value, action == "pencil-remove");
		if ((action == "place" || action == "remove") &&
		    !options.deferClueDismissal)
			this.dismissExhaustedClues();
		this.recordMoveEvent("move", { row: this.rows.indexOf(slot.row),
			column: slot.row.slots.indexOf(slot), symbol: value, action,
			replay: !!this.supposeReplay, playerAction });
	}

	this.applySlotTrayAction = function(value, ev, contextMenu) {
		var slot = this.expandedSlot;
		if (!slot || !slot.possible[value])
			return;
		var action = this.tileActionForPointer(ev || {}, contextMenu, this.getTileAction());
		this.closeSlotTray();
		this.requestTileAction(slot, value, action);
	}

	this.tileActionForPointer = function(ev, contextMenu, action) {
		if (action === undefined)
			action = this.showActionSelector ? this.getTileAction() : "place";
		var discard = contextMenu || ev.ctrlKey || action == "remove" ||
			action == "pencil-remove";
		var chalk = !this.suppose && (ev.altKey || ev.shiftKey || action.indexOf("pencil-") == 0);
		if (chalk)
			return discard ? "pencil-remove" : "pencil-select";
		return discard ? "remove" : "place";
	}

	this.pressTile = function(cell, ev, slot, value) {
		if (ev.pointerType == "touch" || this.coarsePointer ||
		    (this.expandTileChoices && ev.button == 0) ||
		    (ev.button != 0 && ev.button != 2))
			return;
		this.suppressTileClick = null;
		this.suppressTileContextMenu = null;
		var contextMenu = ev.button == 2 ||
			(ev.button == 0 && ev.ctrlKey);
		this.requestTileAction(slot, value, this.tileActionForPointer(ev, contextMenu));
		if (ev.button == 0)
			this.suppressTileClick = cell;
		if (contextMenu)
			this.suppressTileContextMenu = cell;
	}

	this.getTileAction = function() {
		var operation = this.boardActions.querySelector(
			"input[name=tile-operation]:checked").value;
		var mark = this.boardActions.querySelector(
			"input[name=tile-mark]:checked").value;
		if (this.suppose || mark == "inscribe")
			return operation;
		return operation == "place" ? "pencil-select" : "pencil-remove";
	}

	this.updateActionCursor = function() {
		var action = this.tileActionForPointer({
			shiftKey: this.shiftHeld,
			altKey: this.altHeld,
		}, this.controlHeld);
		if (action == "remove" || action == "pencil-remove")
			document.body.dataset.discardCursor = "true";
		else
			delete document.body.dataset.discardCursor;
		if (action.indexOf("pencil-") == 0)
			document.body.dataset.chalkCursor = "true";
		else
			delete document.body.dataset.chalkCursor;
	}

	this.toggleTileAction = function(ev) {
		ev.preventDefault();
		var inputs = ev.currentTarget.children;
		var radios = [];
		var checked = 0;
		for (var i = 0; i < inputs.length; i++)
			if (inputs[i].type == "radio") {
				if (inputs[i].checked)
					checked = radios.length;
				radios.push(inputs[i]);
			}
		var next = (checked + 1) % radios.length;
		for (var i = 0; i < radios.length; i++)
			radios[i].checked = i == next;
		this.updateActionCursor();
		this.playSound("toggle");
	}

	this.renderSlotTray = function() {
		var slot = this.expandedSlot;
		if (!slot)
			return;
		var action = this.getTileAction();
		this.slotTrayAction.className = "slot-tray-action-" + action +
			" " + slot.row.familyClass;
		this.slotTrayActionSample.className = "slot-tray-action-sample";
		if (action == "pencil-select")
			this.slotTrayActionSample.className +=
				" pencil-selected pencil-explicit";
		else if (action == "pencil-remove")
			this.slotTrayActionSample.className +=
				" pencil-removed pencil-explicit";
		this.slotTray.classList.remove(
			"pencil-conflict");
		if (slot.row.elem.classList.contains("pencil-conflict"))
			this.slotTray.classList.add(
				"pencil-conflict");

		for (var value = 0; value < this.slotTrayTiles.length; value++) {
			var tile = this.slotTrayTiles[value];
			tile.className = "slot-tray-symbol " + slot.row.familyClass;
			var mark = this.pencilMarks.find(mark => mark.slot == slot && mark.value == value);
			tile.style.setProperty("--chalk-author", mark?.color || "");
			if (!slot.possible[value] || this.suppose &&
			    !(this.suppose.domains[this.rows.indexOf(slot.row)][value] & (1 << slot.row.slots.indexOf(slot)))) {
				tile.className += " eliminated";
				tile.disabled = true;
				tile.textContent = "";
				tile.setAttribute("aria-label", "");
				continue;
			}
			tile.disabled = false;

			var boardClasses = slot.possibilityElems[value].className.split(" ");
			for (var i = 0; i < boardClasses.length; i++)
				if (boardClasses[i].indexOf("pencil-") == 0)
					tile.className += " " + boardClasses[i];
			renderTileSymbol(tile, slot.symbols[value]);
			var label;
			if (action == "place")
				label = "Choose ";
			else if (action == "remove")
				label = "Discard ";
			else if (action == "pencil-select")
				label = "Mark as chosen: ";
			else
				label = "Mark as discarded: ";
			tile.setAttribute("aria-label", label + tileSymbolLabel(slot.symbols[value]));
		}
		this.positionSlotTray();
	}

	this.togglePencilMark = function(slot, value, discard) {
		if (this.gameOver || this.paused || this.proof || slot.single ||
		    !slot.possible[value])
			return;
		var existing = this.pencilMarks.find(mark => mark.slot == slot && mark.value == value);
		this.setPencilMark(slot, value, existing?.discard === discard ? "erase" :
			discard ? "remove" : "select");
	}

	this.setPencilMark = function(slot, value, kind, actor, color) {
		var existing = this.pencilMarks.find(mark => mark.slot == slot && mark.value == value);
		/* Repeated additions retain the original author's color. */
		if (kind != "erase" && existing?.discard === (kind == "remove"))
			return;
		this.pencilMarks = this.pencilMarks.filter(mark => mark.slot != slot || mark.value != value);
		if (kind != "erase")
			this.pencilMarks.push({ slot, value, discard: kind == "remove", actor, color });
		this.renderPencilMarks(slot.row);
	}

	this.reconcilePencilMarks = function(row) {
		if (!this.pencilMarks.length)
			return;
		this.pencilMarks = this.pencilMarks.filter(function(mark) {
			return !mark.slot.single && mark.slot.possible[mark.value];
		});
		this.renderPencilMarks(row);
	}

	this.dismissExhaustedClues = function() {
		if (!this.autoDismissClues)
			return;
		for (var i = 0; i < this.clues.length; i++) {
			var clue = this.clues[i];
			if (!clue.display || !clue.active)
				continue;
			if (!isClueExhausted(clue))
				continue;
			clue.active = false;
			checkClueDisplay(clue, true);
		}
	}

	this.renderPencilMarks = function(row) {
		this.updateChalkControls();
		/* Rebuild tentative domains without changing committed slot state. */
		var domains = domainsFromRow(row);
		var marks = [];
		for (var i = 0; i < this.pencilMarks.length; i++) {
			var mark = this.pencilMarks[i];
			if (mark.slot.row != row)
				continue;
			marks.push(mark);
			applyPencilMark(domains, mark);
		}
		var conflict = propagatePencilRow(domains);
		row.displayPencil(domains, marks, conflict);
		if (this.expandedSlot && this.expandedSlot.row == row)
			this.renderSlotTray();
	}

	this.findContradictingClues = function(slot, value, discard) {
		var domains = domainsFromSlots(this);
		applyMove(domains, slot, value, discard, this.rows);

		if (!cluesAllow(this, [], domains))
			return [];
		for (var i = 0; i < this.clues.length; i++) {
			var clue = this.clues[i];
			if (clue.display && !cluesAllow(this, [clue],
						       copyDomains(domains)))
				return [clue];
		}
		return [];
	}

	this.revealSolution = function() {
		for (var i = 0; i < this.rows.length; i++)
			for (var j = 0; j < this.rows[i].slots.length; j++)
				this.rows[i].slots[j].reveal();
	}

	this.say = function(msg) {
		if (this.effectsSuppressed)
			return;
		if (this.messageTimeout !== null) {
			clearTimeout(this.messageTimeout);
			this.messageTimeout = null;
		}
		this.messages.classList.remove("fading");
		this.messages.innerHTML = msg;
		if (msg) {
			this.messages.classList.add("appearing");
			this.messages.offsetWidth;
			this.messages.classList.remove("appearing");
		}
		if (msg && this.timerTimeout !== null) {
			var puzzle = this;
			this.messageTimeout = setTimeout(function() {
				puzzle.fadeMessage();
			}, 9000);
		}
	}

	this.fadeMessage = function() {
		if (this.effectsSuppressed)
			return;
		if (this.messageTimeout !== null)
			clearTimeout(this.messageTimeout);
		this.messages.classList.add("fading");
		this.messageTimeout = setTimeout(() => {
			this.messages.innerHTML = "";
			this.messages.classList.remove("fading");
			this.messageTimeout = null;
		}, 1000);
	}

	this.restartMessage = function() {
		if (!this.messages.innerHTML)
			return;
		this.messages.classList.add("marquee-restarting");
		this.messages.offsetWidth;
		this.messages.classList.remove("marquee-restarting");
	}

	this.updateTimer = function(elapsed) {
		var unstarted = this.seed === undefined || this.pendingSeed !== undefined;
		var untimed = !unstarted && this.practiceMode && !this.timer.classList.contains("lost");
		this.timer.classList[unstarted ? "add" : "remove"]("unstarted");
		this.timer.classList[untimed ? "add" : "remove"]("zen");
		this.timerText.textContent = unstarted ? "—" : this.manualPaused ? "Paused" : formatTime(elapsed);
	}

	this.updatePauseControl = function() {
		this.updateSupposeControls();
		this.updateChalkControls();
		var paused = this.manualPaused;
		document.body.classList[paused ? "add" : "remove"]("game-paused");
		for (var element of [board, this.hClues, this.vClues, this.boardActions, this.proofControls])
			element.inert = paused || !!this.supposeReplay || this.pendingSeed !== undefined;
		this.timer.disabled = this.gameOver || this.practiceMode || this.pendingSeed !== undefined;
		this.timer.title = this.invitationDeclined && this.pendingSeed !== undefined ?
			"Invitation declined" : this.seed === undefined || this.pendingSeed !== undefined ?
			"Puzzle not started" : this.practiceMode ?
			(this.timer.classList.contains("lost") ? "Zen mode: time at loss" :
			 "Zen mode: no time limit") : paused ? "Resume game" : "Pause game";
		this.timer.setAttribute("aria-label", this.timer.title);
		this.updateTimer(this.timerTimeout === null ? this.timerElapsed : Date.now() - this.timerStarted);
	}

	this.togglePause = function() {
		if (this.gameOver || this.practiceMode ||
		    this.pageHidden && !this.actionController ||
		    this.paused && !this.manualPaused)
			return;
		if (this.actionController?.role == "guest")
			return this.actionController.requestPause(!this.manualPaused);
		this.manualPaused = !this.manualPaused;
		this.paused = this.manualPaused;
		if (this.manualPaused) {
			this.closeSlotTray();
			this.stopTimer();
		} else {
			this.startTimer();
		}
		this.updatePauseControl();
	}

	this.loadHistory = async function(run, level = "all", multiplayer = false) {
		var request = this.pantheonRequest = {};
		var gameIdentity = this.gameIdentity;
		var current = () => this.pantheonRequest === request &&
			this.gameIdentity === gameIdentity;
		var history = await accessRunHistory(run, false, level, multiplayer);
		if (history && run)
			this.gameStats = history.gameStats;
		if (history && level != "all") {
			for (var candidate of history.unratedRuns || []) {
				var last = history.highScores[9];
				if (last && (candidate.elapsed > last.elapsed ||
				    candidate.elapsed == last.elapsed && candidate.id > last.id))
					break;
				await new Promise(resolve => setTimeout(resolve, 0));
				if (!current())
					return !!history;
				try {
					candidate.difficulty = puzzleDifficulty(puzzleFromSeed(candidate.seed));
					await saveRunDifficulty(candidate.id, candidate.difficulty);
					if (candidate.difficulty.level == level) {
						history.highScores.push(candidate);
						history.highScores.sort((a, b) => a.elapsed - b.elapsed || a.id - b.id);
						history.highScores = history.highScores.slice(0, 10);
					}
				} catch (e) {
					/* An unrateable legacy run cannot enter a specific ranking. */
				}
			}
		}
		if (!current())
			return !!history;
		this.pantheonLevel = level;
		this.pantheonMultiplayer = !!multiplayer;
		this.pantheonLoading = false;
		this.historyError = history ? "" : run ?
			"Your result could not be saved." : "The Chronicle could not be loaded.";
		if (history) {
			this.hasMultiplayerHistory = history.hasMultiplayer;
			this.highScores = history.highScores;
			this.gameStats = history.gameStats;
			/* A different ranking may omit the new score. Remember it so
			 * returning to its ranking restores the highlight.
			 */
			var highlighted = this.highlightedScore;
			this.highlightedScore = highlighted ?
				this.highScores.find(function(score) {
					return score.id === highlighted.id;
				}) || highlighted : null;
		}
		return !!history;
	}

	this.finishRun = function(outcome) {
		if (this.effectsSuppressed)
			return null;
		if (this.actionController)
			return this.actionController.finishRun(outcome);
		return this.recordOutcome(outcome);
	}

	this.runRecord = function(outcome) {
		/* Capture the finished game before the asynchronous save.
		 * date is the finish time in Unix milliseconds; elapsed is
		 * active play time in milliseconds, excluding pauses. Untimed
		 * completions omit elapsed and so do not enter the Pantheon index.
		 */
		var run = {
			date: Date.now(),
			seed: this.seed,
			outcome: outcome,
			rows: this.rows.length,
			columns: this.rows[0].slots.length,
			generatorVersion: puzzleGeneratorVersion,
		};
		if (this.scoreEligible)
			run.elapsed = this.timerElapsed;
		if (this.daily)
			run.daily = this.daily;
		if (this.extreme) {
			run.extreme = true;
			run.extremeDifficulty = storedExtremeDifficulty(this.extremeDifficulty());
		} else
			run.difficulty = puzzleDifficulty(this);
		return run;
	}

	this.recordOutcome = async function(outcome, sharedRun) {
		/* Experiments with the calendar must not consume daily attempts or
		 * add fictional dates to the Chronicle (and hence the Pantheon).
		 */
		if (debugDateActive)
			return false;
		var gameIdentity = this.gameIdentity;
		var run = sharedRun || this.runRecord(outcome);
		var saving = this.loadHistory(run,
			outcome == "won" && run.difficulty ? run.difficulty.level : "all", !!run.multiplayer);
		var request = this.pantheonRequest;
		var saved = await saving;
		var dailyResult;
		if (run.daily) {
			if (saved) {
				dailyResult = await this.getDailyResult(run.daily);
				if (dailyResult?.runId !== run.id && dailyResult?.completionRunId !== run.id)
					dailyResult = null;
			} else {
				dailyResult = this.dailyResultFromRun(run);
				dailyResult.historyUnsaved = true;
			}
		}
		if (saved && dailyResult)
			this.dailyScoreSaved?.();
		if (this.pantheonRequest !== request)
			return saved;
		var highScore = this.highScores.find(function(score) {
			return run.id !== undefined && score.id === run.id;
		});
		/* A completed save must not interrupt a newer game. */
		if (highScore && !run.daily && this.gameIdentity === gameIdentity) {
			this.highlightedScore = highScore;
			if (this.scores.hidden)
				this.toggleModal(this.scores, this.scoresButton,
					"Rejoin the mortal realm");
			/* Position the selected tablet only once the viewport has a width. */
			this.showPantheon();
		}
		if (!saved && this.gameIdentity === gameIdentity)
			this.say("Your result could not be saved.");
		if (!this.scores.hidden)
			this.renderHighScores();
		if (dailyResult && this.gameIdentity === gameIdentity &&
		    !(outcome === "lost" && this.continuedFromLoss && !this.gameOver))
			this.showDailyResult(dailyResult);
		return saved;
	}

	this.renderHighScores = function() {
		if (!this.scores.querySelector(".pantheon-view").hidden)
			this.renderPantheonTitle();
		this.pantheonTablets = this.pantheonModeTablets[this.pantheonMultiplayer ? 1 : 0];
		var tablet = this.pantheonTablets[this.pantheonLevel];
		for (var [mode, tablets] of this.pantheonModeTablets.entries()) {
			for (var level of pantheonLevels) {
				var inactive = !!mode != this.pantheonMultiplayer || level != this.pantheonLevel;
				tablets[level].inert = inactive;
				tablets[level].setAttribute("aria-hidden", inactive);
				tablets[level].style.visibility = !!mode != this.pantheonMultiplayer ? "hidden" : "";
			}
		}
		var status = tablet.querySelector(".scores-status");
		tablet.setAttribute(
			"aria-busy", String(!!this.pantheonLoading));
		for (var level of pantheonLevels)
			this.scores.querySelector(".pantheon-" + level).setAttribute(
				"aria-pressed", String(level == this.pantheonLevel));
		/* Keep the current tablet in place until its replacement is ready. */
		if (this.pantheonLoading)
			return;
		status.hidden = !this.historyError;
		status.textContent = this.historyError || "";
		var list = tablet.querySelector("ol");
		var empty = tablet.querySelector(".scores-empty");
		this.scores.querySelector(".game-stats").hidden = !!this.historyError;
		list.hidden = !!this.historyError;
		if (this.historyError) {
			empty.hidden = true;
			return;
		}
		var gamesSought = this.gameStats.won + this.gameStats.lost;
		this.scores.querySelector(".games-subject").textContent =
			this.pantheonMultiplayer ? "Together, you" : "You";
		this.scores.querySelector(".games-sought").textContent = gamesSought;
		this.scores.querySelector(".games-sought-unit").textContent =
			gamesSought == 1 ? "time" : "times";
		this.scores.querySelector(".games-won").textContent =
			this.gameStats.won;
		list.innerHTML = "";
		empty.hidden = this.highScores.length != 0;
		empty.textContent = this.pantheonLevel == "all" ?
			"No victors have been enshrined." :
			"No " + this.pantheonLevel + " victories have been enshrined.";
		for (var i = 0; i < this.highScores.length; i++) {
			var item = document.createElement("li");
			if (this.highScores[i] == this.highlightedScore) {
				item.className = "score-new";
				item.setAttribute("aria-current", "true");
			}
			var entry = document.createElement("button");
			entry.className = "score-entry";
			entry.type = "button";
			if (this.pantheonMultiplayer && this.highScores[i].players?.length)
				entry.title = "Multiplayer with " + this.highScores[i].players.join(", ");
			entry.addEventListener("click", function(id) {
				return function() { return puzzle.showRunHistory(id); };
			}(this.highScores[i].id));
			var date = document.createElement("span");
			date.className = "score-date";
			var modern = document.createElement("span");
			modern.className = "score-modern-date";
			modern.textContent = formatScoreDate(this.highScores[i].date);
			date.appendChild(modern);
			if (this.highScores[i].date !== null) {
				var attic = document.createElement("span");
				attic.className = "score-attic-date";
				attic.textContent = greekNumeralDay(
					this.highScores[i].date) + " " +
					atticMonth(this.highScores[i].date) + " · " +
					formatOlympiad(this.highScores[i].date);
				date.appendChild(attic);
			}
			entry.appendChild(date);
			var time = document.createElement("span");
			time.className = "score-time";
			time.textContent = formatTime(this.highScores[i].elapsed);
			entry.appendChild(time);
			item.appendChild(entry);
			list.appendChild(item);
		}
	}

	this.selectPantheon = async function(level, fromScroll = false, multiplayer = this.pantheonMultiplayer) {
		if (!pantheonLevels.includes(level))
			return;
		if (!fromScroll) {
			var left = pantheonLevels.indexOf(level) * this.pantheonViewport.clientWidth;
			this.pantheonScroll.to(left);
		}
		if (level == this.pantheonLevel && multiplayer == this.pantheonMultiplayer && !this.historyError)
			return;
		this.pantheonLevel = level;
		this.pantheonMultiplayer = !!multiplayer;
		this.pantheonLoading = true;
		this.historyError = "";
		this.renderHighScores();
		var gameIdentity = this.gameIdentity;
		var loading = this.loadHistory(undefined, level, multiplayer);
		var request = this.pantheonRequest;
		await loading;
		if (this.pantheonRequest !== request || this.gameIdentity !== gameIdentity ||
		    this.scores.hidden || this.scores.querySelector(".pantheon-view").hidden)
			return;
		this.renderHighScores();
	}

	this.togglePantheonMode = function() {
		if (!this.pantheonMultiplayer && !this.hasMultiplayerHistory)
			return;
		return this.selectPantheon(this.pantheonLevel, false, !this.pantheonMultiplayer);
	}

	this.renderPantheonTitle = function() {
		this.scores.querySelector("#scores-title").textContent = this.pantheonMultiplayer ?
			"The Circle of the Wise" : "The Pantheon of the Wise";
		var button = this.scores.querySelector(".pantheon-friends");
		button.hidden = false;
		this.scores.querySelector(".pantheon-mode").hidden =
			!this.pantheonMultiplayer && !this.hasMultiplayerHistory;
		button.setAttribute("aria-pressed", String(this.pantheonMultiplayer));
		button.title = this.pantheonMultiplayer ? "Show the solo Pantheon" : "Show the Circle of the Wise (multiplayer)";
		button.setAttribute("aria-label", button.title);
	}

	this.showPantheon = function() {
		this.pantheonScroll.cancel();
		this.scores.querySelector(".pantheon-view").hidden = false;
		this.scores.querySelector(".history-view").hidden = true;
		this.renderPantheonTitle();
		var close = this.scores.querySelector(".modal-close");
		close.classList.remove("help-page-turn");
		close.classList.add("modal-done");
		close.value = this.resumeAfterModal ? "Resume game" : "Rejoin the mortal realm";
		close.title = close.value;
		close.setAttribute("aria-label", close.value);
		this.scores.querySelector(".scores-actions").appendChild(close);
		this.pantheonViewport.scrollLeft = pantheonLevels.indexOf(
			this.pantheonLevel) * this.pantheonViewport.clientWidth;
		this.pantheonViewport.focus({ preventScroll: true });
	}

	this.showRunHistory = async function(id) {
		this.pantheonScroll.cancel();
		this.pantheonRequest = {};
		var gameIdentity = this.gameIdentity;
		var history = await accessRunHistory(null, true);
		if (this.scores.hidden || this.gameIdentity !== gameIdentity)
			return;
		this.runHistory = history ? history.runs : null;
		this.historyDifficultyFailures = new WeakSet();
		this.selectedRun = id;
		this.historySort = "newest";
		this.scores.querySelector(".history-wins").checked = true;
		this.scores.querySelector(".history-losses").checked = true;
		for (var level of [...difficultyLevels, "extreme"])
			this.scores.querySelector(".history-" + level).checked = true;
		this.scores.querySelector(".pantheon-view").hidden = true;
		this.scores.querySelector(".history-view").hidden = false;
		this.scores.querySelector("#scores-title").textContent = "Chronicle of Trials";
		this.scores.querySelector(".pantheon-friends").hidden = true;
		var close = this.scores.querySelector(".modal-close");
		close.classList.remove("modal-done");
		close.classList.add("help-page-turn");
		close.value = "Claude librum";
		close.title = "Close the Chronicle";
		close.setAttribute("aria-label", "Close the Chronicle");
		this.scores.querySelector(".history-folio").appendChild(close);
		this.renderRunHistory();
		var selected = this.historyTable.querySelector(".history-selected");
		if (id !== undefined && selected) {
			selected.focus({ preventScroll: true });
		} else {
			this.historyViewport.focus({ preventScroll: true });
		}
	}

	this.sortRunHistory = function(column) {
		if (column == "date")
			this.historySort = this.historySort == "newest" ? "oldest" : "newest";
		else
			this.historySort = this.historySort == "fastest" ? "slowest" : "fastest";
		this.renderRunHistory();
	}

	this.selectHistoryPage = function(page) {
		this.historyPage = Math.max(0, Math.min(page, this.historyPageCount - 1));
		this.scores.querySelector(".history-folio .help-page-number").textContent =
			"Leaf " + romanNumeral(this.historyPage + 1) + " of " + romanNumeral(this.historyPageCount);
		for (var direction of [-1, 1]) {
			var previous = direction < 0;
			var button = this.scores.querySelector(".history-folio .help-page-" +
				(previous ? "previous" : "next"));
			button.disabled = previous ? this.historyPage == 0 :
				this.historyPage == this.historyPageCount - 1;
			button.querySelector("span").textContent = button.disabled ?
				(previous ? "Incipit" : "Explicit") : (previous ? "‹ Retr" : "Prox ›");
			button.title = button.disabled ? (previous ? "Beginning" : "End") :
				(previous ? "Previous leaf" : "Next leaf");
			button.setAttribute("aria-label", button.title);
		}
	}

	this.turnHistoryPage = function(direction) {
		var page = this.historyPage + direction;
		if (page < 0 || page >= this.historyPageCount)
			return;
		if (!("onscrollend" in this.historyViewport) || !this.historyScroll.canAnimate()) {
			this.renderRunHistory(page);
			return;
		}
		/* Extend the strip without replacing the leaves already in motion. */
		while (page < this.historyWindowStart) {
			var left = this.historyViewport.scrollLeft;
			this.historyWindowStart--;
			this.historyViewport.insertBefore(this.makeHistoryLeaf(this.historyWindowStart),
				this.historyViewport.children[0]);
			/* Prepending shifts the coordinate system, not the visible content. */
			this.historyViewport.scrollLeft = left + this.historyViewport.clientWidth;
			this.historyWindowExpanded = true;
		}
		while (page >= this.historyWindowStart + this.historyViewport.children.length) {
			this.historyViewport.appendChild(this.makeHistoryLeaf(
				this.historyWindowStart + this.historyViewport.children.length));
			this.historyWindowExpanded = true;
		}
		this.selectHistoryPage(page);
		this.historyScroll.to((page - this.historyWindowStart) * this.historyViewport.clientWidth);
	}

	this.renderRunHistory = function(page) {
		this.historyScroll.cancel();
		this.historyWindowExpanded = false;
		var request = this.historyDifficultyRequest = {};
		var wins = this.scores.querySelector(".history-wins").checked;
		var losses = this.scores.querySelector(".history-losses").checked;
		var levels = difficultyLevels.filter(level =>
			this.scores.querySelector(".history-" + level).checked);
		var showExtreme = this.scores.querySelector(".history-extreme").checked;
		var filteringDifficulty = levels.length > 0 && levels.length < 3;
		var pendingDifficulty = [];
		var sort = this.historySort;
		this.scores.querySelector(".history-date-sort").setAttribute("aria-sort",
			sort == "newest" ? "descending" : sort == "oldest" ? "ascending" : "none");
		this.scores.querySelector(".history-time-sort").setAttribute("aria-sort",
			sort == "fastest" ? "ascending" : sort == "slowest" ? "descending" : "none");
		var runs = (this.runHistory || []).filter(function(run) {
			return (wins && run.outcome == "won") || (losses && run.outcome == "lost");
		}).filter(run => {
			if (run.extreme)
				return showExtreme;
			if (filteringDifficulty && !hasRunDifficulty(run) && canRateRun(run) &&
			    !this.historyDifficultyFailures.has(run))
				pendingDifficulty.push({ run: run });
			/* Unknown difficulties remain visible when all levels are selected. */
			return levels.length == 3 || hasRunDifficulty(run) &&
				levels.includes(run.difficulty.level);
		}).sort(function(a, b) {
			if (sort == "fastest" || sort == "slowest") {
				/* Untimed completions follow timed runs in either direction. */
				if (a.elapsed === undefined || b.elapsed === undefined)
					return (a.elapsed === undefined) - (b.elapsed === undefined) || a.id - b.id;
				return (sort == "fastest" ? a.elapsed - b.elapsed : b.elapsed - a.elapsed) || a.id - b.id;
			}
			/* Imported runs with unknown dates always go last. */
			if (a.date === null || b.date === null)
				return (a.date === null) - (b.date === null) || a.id - b.id;
			return (sort == "oldest" ? a.date - b.date : b.date - a.date) || a.id - b.id;
		});
		var status = this.scores.querySelector(".history-status");
		status.hidden = this.runHistory !== null && runs.length > 0;
		status.textContent = this.runHistory === null ? "The Chronicle could not be loaded." :
			this.runHistory.length ? "No runs match this filter." : "No runs recorded yet.";
		if (pendingDifficulty.length) {
			status.hidden = false;
			status.textContent = "Checking difficulty…";
		}
		this.scores.querySelector(".history-heading").hidden = !runs.length;
		this.historyTable.hidden = !runs.length;
		var body = this.historyBody;
		body.replaceChildren();
		var selectedRun = this.selectedRun;
		var difficultyEntries = [];
		function makeRow(run, rate = true) {
			var row = document.createElement("tr");
			if (run.id === selectedRun) {
				row.className = "history-selected";
				row.tabIndex = -1;
				row.setAttribute("aria-current", "true");
			}
			var values = [formatScoreDate(run.date, true),
				run.outcome == "won" ? "Win" : "Loss",
				run.elapsed === undefined ? "" : formatTime(run.elapsed),
				run.seed === undefined ? "—" : formatSeed(run.seed)];
			for (var value of values) {
				var cell = document.createElement("td");
				cell.textContent = value;
				row.appendChild(cell);
			}
			if (run.elapsed === undefined) {
				var time = row.children[2];
				time.textContent = "";
				time.title = "Untimed completion";
				time.innerHTML = '<svg class="history-infinity" viewBox="0 0 40 20" ' +
					'role="img" aria-label="Untimed completion" focusable="false">' +
					'<use href="#infinity-shape"/></svg>';
			}
			if (run.multiplayer) {
				var friends = document.createElement("span");
				friends.className = "history-friends";
				friends.setAttribute("role", "img");
				friends.title = "Multiplayer" + (run.players?.length ? " with " + run.players.join(", ") : "");
				friends.setAttribute("aria-label", friends.title);
				friends.innerHTML = '<svg viewBox="0 0 24 18" aria-hidden="true" focusable="false">' +
					'<g fill="none" stroke="currentColor" stroke-width="1.6">' +
					'<circle cx="8" cy="5" r="3"/><path d="M1 17v-2a7 7 0 0 1 14 0v2 M16 2a3 3 0 0 1 0 6 M17 10a6 6 0 0 1 6 6v1"/>' +
					'</g></svg>';
				row.children[1].append(friends);
			}
			if (run.seed !== undefined) {
				var link = document.createElement("a");
				link.textContent = formatSeed(run.seed);
				link.href = "#seed=" + formatSeed(run.seed) + (run.extreme ? "&extreme" : "");
				link.title = "Open this puzzle";
				link.onclick = event => {
					/* A solo invitation must not replace a live shared game. */
					if (puzzle.actionController) {
						link.target = "_blank";
						link.rel = "noopener";
						return;
					}
					handleLinkClick(event, () => {
						puzzle.scoresDailyReturn = null;
						puzzle.scoresReturn = null;
						puzzle.toggleScores();
						puzzle.loadURLSeed(link.href);
					});
				};
				row.children[3].replaceChildren(link);
			}
			var difficulty = document.createElement("td");
			difficulty.className = "history-difficulty";
			showRunDifficulty(difficulty, run);
			row.appendChild(difficulty);
			if (rate)
				difficultyEntries.push({ run: run, element: difficulty });
			if (run.date !== null)
				row.children[0].title = new Date(run.date).toLocaleString(undefined, {
					dateStyle: "full", timeStyle: "long", hourCycle: "h23",
				});
			return row;
		}
		/* Measure one row to fit a leaf to the available panel height. */
		var pageSize = 8;
		if (runs.length) {
			var sample = makeRow(runs[0]);
			body.appendChild(sample);
			var available = this.scores.querySelector(".history-page-content").clientHeight;
			var heading = this.scores.querySelector(".history-heading").offsetHeight;
			if (sample.offsetHeight)
				pageSize = Math.max(1, Math.floor((available - heading - 1) / sample.offsetHeight));
			body.replaceChildren();
		}
		difficultyEntries = [];
		var pages = Math.max(1, Math.ceil(runs.length / pageSize));
		/* Explicit page turns take precedence; otherwise follow the highlight. */
		if (page === undefined) {
			var index = runs.findIndex(function(run) { return run.id === selectedRun; });
			page = index < 0 ? 0 : Math.floor(index / pageSize);
		}
		this.historyPageCount = pages;
		this.selectHistoryPage(page);
		this.historyRenderedPage = this.historyPage;
		var start = this.historyPage * pageSize;
		for (var run of runs.slice(start, start + pageSize))
			body.appendChild(makeRow(run));
		/* Retain just the current leaf and its neighbors once scrolling settles.
		 * Button-driven scrolling can extend this strip while it is moving.
		 */
		this.historyWindowStart = Math.max(0, this.historyPage - 1);
		this.makeHistoryLeaf = function(leaf) {
			var table = document.createElement("table");
			table.className = "history-table";
			initializeHistoryTable(table);
			for (var run of runs.slice(leaf * pageSize, (leaf + 1) * pageSize))
				table.querySelector("tbody").appendChild(makeRow(run, false));
			table.inert = true;
			table.setAttribute("aria-hidden", "true");
			table.setAttribute("aria-label", "Chronicle leaf " + (leaf + 1));
			return table;
		};
		var leaves = [];
		for (var leaf = this.historyWindowStart; leaf <= Math.min(pages - 1, this.historyPage + 1); leaf++) {
			var table = this.historyTable;
			if (leaf != this.historyPage)
				table = this.makeHistoryLeaf(leaf);
			table.setAttribute("aria-label", "Chronicle leaf " + (leaf + 1));
			leaves.push(table);
		}
		this.historyViewport.replaceChildren(...leaves);
		this.historyViewport.scrollLeft = (this.historyPage - this.historyWindowStart) *
			this.historyViewport.clientWidth;
		this.historyDifficultyTask = this.fillRunDifficulties(
			filteringDifficulty ? pendingDifficulty.concat(difficultyEntries.filter(entry =>
				entry.run.extreme && !hasRunDifficulty(entry.run) &&
				!this.historyDifficultyFailures.has(entry.run))) :
				difficultyEntries, request,
			filteringDifficulty ? { page: page } : null);
	}

	this.fillRunDifficulties = async function(entries, request, refresh) {
		for (var entry of entries) {
			var run = entry.run;
			if (hasRunDifficulty(run) || !canRateRun(run))
				continue;
			/* Let the page paint and handle input between expensive ratings. */
			await new Promise(resolve => setTimeout(resolve, 0));
			if (this.historyDifficultyRequest !== request || this.scores.hidden ||
			    this.scores.querySelector(".history-view").hidden)
				return;
			try {
				var difficulty;
				if (run.extreme) {
					var puzzle = puzzleFromSeed(run.seed);
					var indices = extremeClueIndices(puzzle);
					if (!indices)
						throw new Error("seed has no extreme variant");
					puzzle.clues = indices.map(index => puzzle.clues[index]);
					difficulty = run.extremeDifficulty = storedExtremeDifficulty(measureExtremeDifficulty(puzzle));
				} else {
					difficulty = run.difficulty = puzzleDifficulty(puzzleFromSeed(run.seed));
				}
				if (entry.element)
					showRunDifficulty(entry.element, run);
				await saveRunDifficulty(run.id, difficulty);
			} catch (e) {
				this.historyDifficultyFailures.add(run);
				if (entry.element) {
					entry.element.textContent = "—";
					entry.element.title = "Difficulty unavailable";
					entry.element.setAttribute("aria-label", entry.element.title);
				}
			}
		}
		if (entries.length && refresh &&
		    this.historyDifficultyRequest === request && !this.scores.hidden &&
		    !this.scores.querySelector(".history-view").hidden)
			this.renderRunHistory(refresh.page);
	}

	this.clearOutcome = function() {
		this.timer.classList.remove("won", "lost", "contemplating");
		this.messages.classList.remove("won", "lost");
	}

	this.startTimer = function() {
		if (this.actionController?.restoreHostTimer())
			return;
		clearTimeout(this.timerTimeout);
		this.timerStarted = Date.now() - this.timerElapsed;
		this.scheduleTimerUpdate();
		this.actionController?.timerChanged();
	}

	this.scheduleTimerUpdate = function() {
		var puzzle = this;
		var elapsed = Date.now() - this.timerStarted;
		var delay = 1000 - elapsed % 1000;
		this.timerTimeout = setTimeout(function() {
			puzzle.updateTimer(Date.now() - puzzle.timerStarted);
			puzzle.actionController?.timerTick();
			puzzle.scheduleTimerUpdate();
		}, delay);
	}

	this.stopTimer = function() {
		if (this.actionController?.restoreHostTimer())
			return;
		if (this.timerTimeout === null)
			return;
		this.timerElapsed = Date.now() - this.timerStarted;
		this.updateTimer(this.timerElapsed);
		clearTimeout(this.timerTimeout);
		this.timerTimeout = null;
		this.timerStarted = null;
		this.actionController?.timerChanged();
	}

	this.generateClues = function(indices = null) {
		this.hClues.classList.remove("solution");
		this.vClues.classList.remove("solution");
		generatePuzzleClues(this, this.hClueSlots.length, this.vClueSlots.length);
		this.originalClues = this.clues.slice();
		this.revealedClues = [];
		if (indices)
			this.clues = indices.map(index => this.clues[index]);

		for (var slot of [...this.hClueSlots, ...this.vClueSlots])
			clearClueSlot(slot);

		this.numHClues = 0;
		this.numVClues = 0;
		for (var i = 0; i < this.clues.length; i++) {
			var clue = this.clues[i];
			if (clue.applyInitialState) {
				clue.applyInitialState();
				continue;
			} else if (clue.displayType == "horizontal")
				clue.display = this.getHClueSlot();
			else if (clue.displayType == "vertical")
				clue.display = this.getVClueSlot();
			checkClueDisplay(clue);
		}
	}

	this.getHClueSlot = function() { return this.hClueSlots[this.numHClues++]; }
	this.getVClueSlot = function() { return this.vClueSlots[this.numVClues++]; }

	this.toggleModal = function(modal, button, closeText) {
		if (modal.hidden) {
			this.resumeAfterModal = !this.actionController && !this.gameOver &&
				this.timerTimeout !== null;
			var done = modal.querySelector(".modal-close");
			if (done)
				done.value = this.resumeAfterModal ?
					"Resume game" : closeText;
			if (!this.actionController)
				this.paused = true;
			if (this.resumeAfterModal)
				this.stopTimer();
			setDialogOpen(modal, true);
		} else {
			if (modal === this.scores && this.pantheonLoading) {
				this.pantheonRequest = {};
				this.pantheonLoading = false;
			}
			setDialogOpen(modal, false);
			this.paused = this.manualPaused ||
				(this.pageHidden && !this.actionController) || this.pendingSeed !== undefined;
			if (!this.gameOver && !this.practiceMode && !this.paused &&
			    this.timerTimeout === null)
				this.startTimer();
			this.resumeAfterModal = false;
		}
		this.actionController?.restoreHostTimer();
		this.updateSupposeControls();
		button.setAttribute("aria-expanded", !modal.hidden);
	}

	this.toggleOptions = function() {
		this.updateDailyButton();
		this.analysisClicks = 0;
		if (this.options.hidden && this.seed !== undefined)
			this.options.querySelector("#game-seed").value =
				formatSeed(this.seed);
		this.updateSeedControls();
		this.toggleModal(this.options, this.optionsButton, "Close");
		this.updateSeedDifficulty();
	}

	this.toggleHelp = function() {
		this.toggleModal(this.help, this.helpButton, "Close");
		if (!this.help.hidden)
			this.showHelpPage(0);
	}

	this.selectHelpPage = function(page) {
		this.helpPage = Math.max(0,
			Math.min(this.helpPages.length - 1, page));
		for (var i = 0; i < this.helpPages.length; i++) {
			this.helpPages[i].inert = this.helpPage != i;
			this.helpPages[i].setAttribute("aria-hidden", this.helpPage != i);
			this.helpFolios[i].hidden = this.helpPage != i;
		}
	}

	this.showHelpPage = function(page) {
		this.helpScroll.cancel();
		this.selectHelpPage(page);
		this.helpViewport.scrollLeft = this.helpPage * this.helpViewport.clientWidth;
	}

	this.turnHelpPage = function(direction, fromKeyboard = false) {
		if (this.helpPage + direction < 0 ||
		    this.helpPage + direction >= this.helpPages.length)
			return;
		var page = this.helpPage + direction;
		this.selectHelpPage(page);
		this.helpScroll.to(page * this.helpViewport.clientWidth);
		if (fromKeyboard)
			return;
		var selector = direction > 0 ?
			".help-page-previous" : ".help-page-next";
		this.helpFolios[this.helpPage].querySelector(selector).focus({ preventScroll: true });
	}

	this.toggleScores = async function() {
		if (!this.scores.hidden) {
			var dailyReturn = this.scoresDailyReturn;
			this.scoresDailyReturn = null;
			var scoresReturn = this.scoresReturn;
			this.scoresReturn = null;
			this.pantheonRequest = {};
			this.toggleModal(this.scores, this.scoresButton,
				"Rejoin the mortal realm");
			this.highlightedScore = null;
			if (dailyReturn && dailyReturn.gameIdentity === this.gameIdentity)
				this.showDailyResult(dailyReturn.result);
			if (scoresReturn && scoresReturn.gameIdentity === this.gameIdentity)
				await scoresReturn.show();
			return;
		}
		var gameIdentity = this.gameIdentity;
		await this.loadHistory();
		if (this.gameIdentity !== gameIdentity)
			return;
		this.renderHighScores();
		if (this.scores.hidden)
			this.toggleModal(this.scores, this.scoresButton,
				"Rejoin the mortal realm");
		this.showPantheon();
	}

	this.toggleAbout = function() {
		this.toggleModal(this.about, this.logoButton, "Close");
	}


	this.setPageHidden = function(hidden) {
		if (hidden == this.pageHidden)
			return;
		this.pageHidden = hidden;
		if (this.actionController) {
			/* A local visibility change must not pause the shared game. */
			if (hidden) {
				this.closeSlotTray();
			} else {
				this.actionController.restoreHostTimer();
			}
			return;
		}
		if (hidden) {
			this.resumeAfterPageHidden = !this.gameOver &&
				this.timerTimeout !== null;
			this.pausedBeforePageHidden = this.paused;
			if (this.resumeAfterPageHidden)
				this.stopTimer();
			this.paused = true;
			this.closeSlotTray();
		} else {
			this.paused = this.pausedBeforePageHidden;
			if (this.resumeAfterPageHidden && !this.gameOver &&
			    !this.paused && this.timerTimeout === null)
				this.startTimer();
			this.resumeAfterPageHidden = false;
			this.pausedBeforePageHidden = false;
		}
		this.updateSupposeControls();
	}

	var puzzle = this;
	for (var [dialog, close] of [
		[this.analysis, () => this.closeAnalysis()],
		[this.options, () => this.toggleOptions()],
		[this.hintNotice, () => this.finishHintNotice(false)],
		[this.help, () => this.toggleHelp()],
		[this.invitation, () => this.closeInvitation()],
		[this.scores, () => this.toggleScores()],
		[this.about, () => this.toggleAbout()],
		[this.slotTray, () => this.closeSlotTray()],
	])
		initializeDialog(dialog, close);
	this.options.querySelector("#game-seed").addEventListener("paste", function(ev) {
		if (!ev.clipboardData)
			return;
		ev.preventDefault();
		this.value = ev.clipboardData.getData("text/plain").trim();
		puzzle.updateSeedControls();
		puzzle.updateSeedDifficulty();
	});
	this.options.querySelector("#game-seed").addEventListener("input", function() {
		puzzle.updateSeedControls();
		puzzle.updateSeedDifficulty();
	});
	this.pantheonViewport.addEventListener("scroll", function() {
		if (puzzle.scores.hidden || puzzle.scores.querySelector(".pantheon-view").hidden ||
		    !puzzle.pantheonViewport.clientWidth)
			return;
		if (!puzzle.pantheonScroll.settled())
			return;
		var index = Math.round(puzzle.pantheonViewport.scrollLeft /
			puzzle.pantheonViewport.clientWidth);
		var level = pantheonLevels[index];
		if (level && level != puzzle.pantheonLevel)
			return puzzle.selectPantheon(level, true);
	});
	var syncHistoryScroll = function() {
		if (puzzle.scores.hidden || puzzle.scores.querySelector(".history-view").hidden ||
		    !puzzle.historyViewport.clientWidth)
			return false;
		if (!puzzle.historyScroll.settled())
			return false;
		var page = puzzle.historyWindowStart + Math.round(
			puzzle.historyViewport.scrollLeft / puzzle.historyViewport.clientWidth);
		if (page != puzzle.historyPage)
			puzzle.selectHistoryPage(page);
		return true;
	};
	this.historyViewport.addEventListener("scroll", syncHistoryScroll);
	this.historyViewport.addEventListener("scrollend", function() {
		if (syncHistoryScroll() && (puzzle.historyPage != puzzle.historyRenderedPage ||
		    puzzle.historyWindowExpanded))
			puzzle.renderRunHistory(puzzle.historyPage);
	});
	this.helpViewport.addEventListener("scroll", function() {
		if (puzzle.help.hidden || !puzzle.helpViewport.clientWidth)
			return;
		if (!puzzle.helpScroll.settled())
			return;
		puzzle.selectHelpPage(Math.round(puzzle.helpViewport.scrollLeft /
			puzzle.helpViewport.clientWidth));
	});
	this.invitation.querySelector(".invitation-accept").addEventListener("blur", function() {
		this.classList.remove("invitation-initial-focus");
	});
	document.querySelector("#daily-menu .modal-close").addEventListener("blur", function() {
		this.classList.remove("invitation-initial-focus");
	});
	document.addEventListener("fullscreenchange", function() {
		puzzle.updateFullscreenButton();
	});
	document.addEventListener("keydown", function(ev) {
		if (ev.key != "ArrowLeft" && ev.key != "ArrowRight") {
			puzzle.invitation.querySelector(".invitation-accept").classList.remove("invitation-initial-focus");
			document.querySelector("#daily-menu .modal-close").classList.remove("invitation-initial-focus");
		}
		if (ev.key == "Control" || ev.key == "Shift" || ev.key == "Alt") {
			if (ev.key == "Control")
				puzzle.controlHeld = true;
			else if (ev.key == "Shift")
				puzzle.shiftHeld = true;
			else
				puzzle.altHeld = true;
			puzzle.updateActionCursor();
		}
		if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey)
			return;
		var direction;
		if (ev.key == "ArrowLeft")
			direction = -1;
		else if (ev.key == "ArrowRight")
			direction = 1;
		else
			return;
		var modals = document.querySelectorAll(".modal:not([hidden])");
		if (modals.length) {
			var target = ev.target;
			if (target && (target.isContentEditable ||
			    target.tagName == "SELECT" || target.tagName == "TEXTAREA" ||
			    (target.tagName == "INPUT" &&
			     !["button", "submit", "reset", "checkbox"].includes(target.type))))
				return;
			var modal = modals[modals.length - 1];
			if (modal == puzzle.invitation && (puzzle.daily || puzzle.dailyResultOpen)) {
				ev.preventDefault();
				var arrow = modal.querySelector(direction < 0 ? ".daily-previous" : ".daily-next");
				if (arrow && !arrow.disabled) {
					arrow.click();
				}
			} else if (modal == puzzle.help) {
				ev.preventDefault();
				puzzle.helpViewport.focus({ preventScroll: true });
				var page = puzzle.helpPage + direction;
				if (page >= 0 && page < puzzle.helpPages.length)
					puzzle.turnHelpPage(direction, true);
			} else if (modal == puzzle.scores &&
			           !puzzle.scores.querySelector(".history-view").hidden) {
				ev.preventDefault();
				puzzle.historyViewport.focus({ preventScroll: true });
				puzzle.turnHistoryPage(direction);
			} else if (modal == puzzle.scores &&
			           !puzzle.scores.querySelector(".pantheon-view").hidden) {
				ev.preventDefault();
				puzzle.pantheonViewport.focus({ preventScroll: true });
				var level = pantheonLevels[pantheonLevels.indexOf(puzzle.pantheonLevel) + direction];
				if (level)
					puzzle.selectPantheon(level);
			}
			return;
		}
		if ((!puzzle.proof && !puzzle.suppose) || puzzle.paused)
			return;
		ev.preventDefault();
		if (puzzle.suppose)
			puzzle.moveSuppose(direction);
		else
			puzzle.moveProof(direction);
	});
	document.addEventListener("keyup", function(ev) {
		if (ev.key == "Control" || ev.key == "Shift" || ev.key == "Alt") {
			if (ev.key == "Control")
				puzzle.controlHeld = false;
			else if (ev.key == "Shift")
				puzzle.shiftHeld = false;
			else
				puzzle.altHeld = false;
			puzzle.updateActionCursor();
		}
	});
	document.addEventListener("visibilitychange", function() {
		puzzle.setPageHidden(document.hidden);
	});
	if (typeof window != "undefined") {
		window.addEventListener("resize", function() {
			puzzle.positionSlotTray();
			if (!puzzle.help.hidden)
				puzzle.showHelpPage(puzzle.helpPage);
			if (!puzzle.scores.hidden && !puzzle.scores.querySelector(".pantheon-view").hidden) {
				puzzle.pantheonScroll.cancel();
				puzzle.pantheonViewport.scrollLeft = pantheonLevels.indexOf(
					puzzle.pantheonLevel) * puzzle.pantheonViewport.clientWidth;
			}
			if (!puzzle.scores.hidden && !puzzle.scores.querySelector(".history-view").hidden)
				puzzle.renderRunHistory(puzzle.historyPage);
		});
		window.addEventListener("blur", function() {
			puzzle.controlHeld = false;
			puzzle.shiftHeld = false;
			puzzle.altHeld = false;
			puzzle.updateActionCursor();
		});
	}

	this.saveOption = function(name, value) {
		if (this.loadingOptions)
			return;
		try {
			localStorage.setItem(name, value);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.setCustomCursor = function(enabled) {
		document.body.dataset.customCursor = enabled;
		this.options.querySelector("#custom-cursor").checked = enabled;
		this.saveOption("customCursor", enabled);
	}

	this.setMilestones = function(show) {
		this.showMilestones = show;
		this.options.querySelector("#show-milestones").checked = show;
		this.saveOption("showMilestones", show);
	}

	this.setAutoDismissClues = function(enabled) {
		this.autoDismissClues = enabled;
		this.options.querySelector("#auto-dismiss-clues").checked = enabled;
		if (enabled)
			this.dismissExhaustedClues();
		this.saveOption("autoDismissClues", enabled);
	}

	this.setExtremeMode = function(enabled) {
		this.extremeMode = enabled;
		this.options.querySelector("#extreme-mode").checked = enabled;
		for (var level of difficultyLevels)
			this.options.querySelector("#random-" + level).disabled = enabled;
		this.options.querySelector(".random-difficulties").setAttribute("aria-disabled", String(enabled));
		this.updateSeedControls();
		this.updateSeedDifficulty();
		this.saveOption("extremeMode", enabled);
	}

	this.setRandomDifficulties = function(levels) {
		this.randomDifficulties = difficultyLevels.filter(level => levels.includes(level));
		for (var level of difficultyLevels)
			this.options.querySelector("#random-" + level).checked = this.randomDifficulties.includes(level);
		this.saveOption("randomDifficulties", JSON.stringify(this.randomDifficulties));
	}

	this.changeRandomDifficulties = function() {
		this.setRandomDifficulties(difficultyLevels.filter(level =>
			this.options.querySelector("#random-" + level).checked));
	}

	this.setPracticeMode = function(enabled) {
		this.practiceModePreference = enabled;
		this.options.querySelector("#practice-mode").checked = enabled;
		this.saveOption("practiceMode", enabled);
		if (!enabled && this.practiceMode && !this.gameOver) {
			this.say("Accepting enlightenment is a one-way door. " +
				"Your next journey will not be so calm.");
			return false;
		}
		this.practiceMode = enabled;
		if (enabled) {
			this.manualPaused = false;
			if (!this.gameOver)
				this.scoreEligible = false;
			this.stopTimer();
		} else if (!this.gameOver && !this.paused &&
			   this.timerTimeout === null) {
			this.startTimer();
		}
		this.updatePauseControl();
		return true;
	}

	this.setContinueAfterLoss = function(enabled) {
		this.continueAfterLoss = enabled;
		this.options.querySelector("#continue-after-loss").checked = enabled;
		this.saveOption("continueAfterLoss", enabled);
	}

	this.setSoundEffects = function(enabled) {
		this.soundEffects = enabled;
		this.options.querySelector("#sound-effects").checked = enabled;
		this.options.querySelector("#sound-volume").disabled = !enabled;
		if (this.soundGain)
			this.soundGain.gain.value = enabled ? this.soundVolume : 0;
		for (var name in this.soundSamples)
			this.soundSamples[name].muted = !enabled;
		this.saveOption("soundEffects", enabled);
	}

	this.setSoundVolume = function(volume) {
		this.soundVolume = Number.isFinite(volume) ?
			Math.max(0, Math.min(1, volume)) : 1;
		var input = this.options.querySelector("#sound-volume");
		input.value = Math.round(this.soundVolume * 100);
		input.setAttribute("aria-valuetext", input.value + "%");
		input.title = "Volume: " + input.value + "%";
		if (this.soundGain)
			this.soundGain.gain.value = this.soundEffects ? this.soundVolume : 0;
		for (var name in this.soundSamples)
			this.soundSamples[name].volume = this.soundVolumes[name] * this.soundVolume;
		this.saveOption("soundVolume", this.soundVolume);
	}

	this.setExpandTileChoices = function(enabled) {
		this.expandTileChoices = enabled;
		this.options.querySelector("#expand-tile-choices").checked = enabled;
		if (!enabled)
			this.closeSlotTray();
		this.saveOption("expandTileChoices", enabled);
	}

	this.setShowActionSelector = function(enabled) {
		this.showActionSelector = enabled;
		this.options.querySelector("#show-action-selector").checked = enabled;
		this.updateActionCursor();
		this.updateActionControls();
		this.saveOption("showActionSelector", enabled);
	}

	this.updateActionControls = function() {
		this.updatePauseControl();
		var show = this.showActionSelector && !this.gameOver;
		if (this.seed === undefined)
			document.body.classList.remove("game-started");
		else
			document.body.classList.add("game-started");
		this.boardActions.hidden = !show;
		this.slotTrayAction.hidden = !this.showActionSelector;
		var showInvitation = this.dailyResultOpen ||
			(this.pendingSeed !== undefined && !this.invitationDeclined);
		var openingInvitation = this.invitation.hidden && showInvitation;
		setDialogOpen(this.invitation, showInvitation);
		if (openingInvitation && !this.dailyResultOpen) {
			var accept = this.invitation.querySelector(".invitation-accept");
			accept.classList.add("invitation-initial-focus");
			accept.focus();
		}
		this.logoButton.hidden = show;
	}

	this.updateFullscreenButton = function() {
		var button = this.options.querySelector("#fullscreen-button");
		button.hidden = !document.fullscreenEnabled;
		button.value = document.fullscreenElement ?
			"Exit full screen" : "Enter full screen";
	}

	this.toggleFullscreen = function() {
		var action = document.fullscreenElement ?
			document.exitFullscreen() :
			document.documentElement.requestFullscreen({
				navigationUI: "hide",
			});
		action.catch(function() {
			/* The browser may decline a fullscreen request. */
		});
	}

	this.getAudioContext = function() {
		if (this.audioContext)
			return this.audioContext;
		if (typeof window == "undefined")
			return null;
		var AudioContext = window.AudioContext || window.webkitAudioContext;
		if (!AudioContext)
			return null;
		try {
			this.audioContext = new AudioContext();
		} catch (e) {
			return null;
		}
		return this.audioContext;
	}

	this.getSoundOutput = function(context) {
		if (!this.soundGain) {
			this.soundGain = context.createGain();
			this.soundGain.gain.value = this.soundEffects ? this.soundVolume : 0;
			this.soundGain.connect(context.destination);
		}
		return this.soundGain;
	}

	this.loadSampleSound = function(name) {
		var context = this.getAudioContext();
		if (!context ||
		    this.soundBuffers[name] || this.soundBufferPromises[name])
			return;
		var puzzle = this;
		if (typeof fetch == "undefined")
			return;
		this.soundBufferPromises[name] = fetch(this.soundSamples[name].src)
			.then(function(response) {
				return response.arrayBuffer();
			})
			.then(function(data) {
				return context.decodeAudioData(data);
			})
			.then(function(buffer) {
				puzzle.soundBuffers[name] = buffer;
			})
			.catch(function(error) {
				if (typeof console != "undefined")
					console.warn("falling back to media playback for " +
						name + " sound", error);
				/* The media element remains available as a fallback. */
			});
	}

	this.playMediaSampleSound = function(name, rate) {
		var audio = new Audio(this.soundSamples[name].src);
		audio.preservesPitch = false;
		audio.muted = !this.soundEffects;
		audio.volume = this.soundVolumes[name] * this.soundVolume;
		audio.playbackRate = rate;
		var playback = audio.play();
		if (playback)
			playback.catch(function() {});
	}

	this.playSampleSound = function(name) {
		var audio = this.soundSamples[name];
		if (!audio)
			return;
		var variation = this.soundVariations[name];
		var position = this.soundSequencePositions[name] || 0;
		var rate = 1 + variation * this.soundSequence[position];
		this.soundSequencePositions[name] =
			(position + 1) % this.soundSequence.length;

		var context = this.getAudioContext();
		var buffer = this.soundBuffers[name];
		if (!context || !buffer) {
			this.loadSampleSound(name);
			this.playMediaSampleSound(name, rate);
			return;
		}
		if (context.state == "suspended")
			context.resume();
		var source = context.createBufferSource();
		var gain = context.createGain();
		source.buffer = buffer;
		source.playbackRate.value = rate;
		gain.gain.value = this.soundVolumes[name];
		source.connect(gain).connect(this.getSoundOutput(context));
		source.start();
	}

	this.playSound = function(type) {
		if (this.effectsSuppressed || !this.soundEffects)
			return;
		if (this.soundSamples[type]) {
			this.playSampleSound(type);
			return;
		}
		var context = this.getAudioContext();
		if (!context)
			return;
		if (context.state == "suspended")
			context.resume();
		var output = this.getSoundOutput(context);
		var variation = 0.94 + Math.random() * 0.12;
		if (type == "win") {
			var notes = [587.33, 783.99, 659.25, 880,
				     783.99, 1046.5, 880, 1174.66,
				     1046.5, 1318.51, 1174.66, 1567.98];
			var delays = [0, 0.09, 0.17, 0.26, 0.34, 0.43,
				      0.52, 0.62, 0.73, 0.85, 0.98, 1.12];
			for (var i = 0; i < notes.length; i++)
				playChime(context, notes[i] * variation, delays[i],
					i == notes.length - 1 ? 0.07 : 0.05, output);
		} else if (type == "practice-mistake") {
			playChime(context, 523.25 * variation, 0, 0.018, output);
			playChime(context, 440 * variation, 0.13, 0.014, output);
		}
	}

	for (var name in this.soundSamples)
		this.loadSampleSound(name);

	var randomDifficulties = difficultyLevels;
	try {
		var storedDifficulties = JSON.parse(localStorage.getItem("randomDifficulties"));
		if (Array.isArray(storedDifficulties) &&
		    storedDifficulties.every(level => randomDifficulties.includes(level)))
			randomDifficulties = storedDifficulties;
	} catch (e) {
		/* Missing or invalid preferences use all difficulties. */
	}
	this.highScores = [];
	this.pantheonLevel = "all";
	this.pantheonMultiplayer = false;
	this.hasMultiplayerHistory = false;
	this.pantheonLoading = false;
	this.gameStats = { won: 0, lost: 0 };
	/* Applying saved preferences must not write a stale snapshot back. */
	this.loadingOptions = true;
	this.setRandomDifficulties(randomDifficulties);
	this.setExtremeMode(readOption("extremeMode", false));
	this.setCustomCursor(readOption("customCursor", true));
	this.setMilestones(readOption(
		"showMilestones", this.showMilestones));
	this.setAutoDismissClues(readOption("autoDismissClues", true));
	this.setPracticeMode(readOption(
		"practiceMode", this.practiceModePreference));
	this.setContinueAfterLoss(readOption(
		"continueAfterLoss", this.continueAfterLoss));
	this.setSoundEffects(readOption("soundEffects", true));
	this.setSoundVolume(readOption("soundVolume", 1));
	this.setExpandTileChoices(readOption(
		"expandTileChoices", this.expandTileChoices));
	this.setShowActionSelector(readOption(
		"showActionSelector", this.showActionSelector));
	this.loadingOptions = false;
	initializePortraitClueLayout();
	this.updateFullscreenButton();

	this.clear();
}

function formatTime(elapsed) {
	var totalSeconds = Math.floor(elapsed / 1000);
	var minutes = Math.floor(totalSeconds / 60);
	var seconds = totalSeconds % 60;
	return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
}

function romanNumeral(number) {
	var result = "";
	for (var [value, symbol] of [
		[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
		[100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
		[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
	]) {
		while (number >= value) {
			result += symbol;
			number -= value;
		}
	}
	return result;
}

function formatScoreDate(timestamp, compact) {
	if (timestamp === null)
		return "Earlier";
	var date = new Date(timestamp);
	var month = date.toLocaleDateString(undefined, { month: compact ? "short" : "long" });
	return date.getDate() + " " + month + " " +
		date.getFullYear() + (compact ? "" : " CE");
}

function atticMonth(timestamp) {
	/* Decorative correspondence only; the Attic calendar was lunar. */
	var months = [
		"Gamelion", "Anthesterion", "Elaphebolion", "Mounichion",
		"Thargelion", "Skirophorion", "Hekatombaion", "Metageitnion",
		"Boedromion", "Pyanopsion", "Maimakterion", "Poseideon",
	];
	return months[new Date(timestamp).getMonth()];
}

function greekNumeralDay(timestamp) {
	var day = new Date(timestamp).getDate();
	var tens = ["", "ι", "κ", "λ"];
	var units = ["", "α", "β", "γ", "δ", "ε", "ϛ", "ζ", "η", "θ"];
	return tens[Math.floor(day / 10)] + units[day % 10] + "\u0374";
}

function formatOlympiad(timestamp) {
	var date = new Date(timestamp);
	var olympiadYear = date.getFullYear();
	/* Use July 1 as a decorative approximation of the summer boundary. */
	if (date.getMonth() < 6)
		olympiadYear--;
	var yearsSinceFirst = olympiadYear + 775;
	var olympiad = Math.floor(yearsSinceFirst / 4) + 1;
	var year = yearsSinceFirst % 4 + 1;
	return "Olympiad " + olympiad + "." + year;
}

/* Numeric multiplayer flags are valid IndexedDB keys; booleans are not. */
function openRunDatabase() {
	var request = indexedDB.open("logos", 3);
	request.onupgradeneeded = function(event) {
		var store = event.oldVersion < 1 ?
			request.result.createObjectStore("runs", { autoIncrement: true }) :
			request.transaction.objectStore("runs");
		if (event.oldVersion < 3) {
			if (store.indexNames.contains("outcomeElapsed"))
				store.deleteIndex("outcomeElapsed");
			store.createIndex("multiplayerOutcomeElapsed", ["multiplayer", "outcome", "elapsed"]);
			store.createIndex("multiplayerId", "multiplayerId", { unique: true });
			store.openCursor().onsuccess = function(event) {
				var cursor = event.target.result;
				if (!cursor)
					return;
				var run = cursor.value;
				/* Histories predating multiplayer contain only solo runs. */
				run.multiplayer = 0;
				cursor.update(run);
				cursor.continue();
			};
		}
	};
	return request;
}

/* Import legacy scores and optionally append a run, then return a committed
 * Pantheon summary. Record keys are exposed as id, but remain out-of-line.
 */
function accessRunHistory(run, includeRuns, level = "all", multiplayer = false) {
	return new Promise(function(resolve) {
		if (typeof indexedDB == "undefined") {
			resolve(null);
			return;
		}
		var request = openRunDatabase();
		request.onerror = function() { resolve(null); };
		request.onsuccess = function() {
			var db = request.result;
			db.onversionchange = function() { db.close(); };
			var legacy = null;
			try {
				legacy = localStorage.getItem("highScores");
			} catch (e) {
				/* IndexedDB may still be usable when localStorage is not. */
			}
			try {
				var scores = parseLegacyScores(legacy);
				var transaction = db.transaction("runs",
					run || legacy !== null ? "readwrite" : "readonly");
				var store = transaction.objectStore("runs");
				var summary = { highScores: [], gameStats: { won: 0, lost: 0 } };
				if (level != "all")
					summary.unratedRuns = [];
				var added = [];
				transaction.oncomplete = function() {
					db.close();
					for (var i = 0; i < added.length; i++)
						added[i].entry.id = added[i].id;
					/* Leave legacy data intact until its import commits. */
					try {
						if (legacy !== null)
							localStorage.removeItem("highScores");
						localStorage.removeItem("gameStats");
					} catch (e) {
						/* A later access can retry the cleanup. */
					}
					resolve(summary);
				};
				transaction.onabort = function() {
					db.close();
					resolve(null);
				};
				function add(entry) {
					entry.multiplayer = entry.multiplayer ? 1 : 0;
					store.add(entry).onsuccess = function(event) {
						added.push({ entry: entry, id: event.target.result });
					};
				}
				function readSummary() {
					/* Read/write transactions serialize tabs sharing this database. */
					if (run?.multiplayer && run.multiplayerId) {
						var shared = run;
						run = null;
						store.index("multiplayerId").getKey(shared.multiplayerId).onsuccess = function(event) {
							var id = event.target.result;
							if (id === undefined)
								add(shared);
							else
								added.push({ entry: shared, id: id });
							readSummary();
						};
						return;
					}
					if (run)
						add(run);
					if (includeRuns) {
						summary.runs = [];
						store.openCursor().onsuccess = function(event) {
							var cursor = event.target.result;
							if (!cursor)
								return;
							summary.runs.push(Object.assign({}, cursor.value,
								{ id: cursor.primaryKey }));
							cursor.continue();
						};
					}
					var index = store.index("multiplayerOutcomeElapsed");
					/* Return only the first matching key, without reading a run. */
					index.getKey(IDBKeyRange.bound([1], [2], false, true)).onsuccess = function(event) {
						summary.hasMultiplayer = event.target.result !== undefined;
					};
					var mode = multiplayer ? 1 : 0;
					var wins = IDBKeyRange.bound([mode, "won", 0], [mode, "won", Number.MAX_VALUE]);
					var losses = IDBKeyRange.bound([mode, "lost", 0], [mode, "lost", Number.MAX_VALUE]);
					index.count(wins).onsuccess = function(event) {
						summary.gameStats.won = event.target.result;
					};
					index.count(losses).onsuccess = function(event) {
						summary.gameStats.lost = event.target.result;
					};
					index.openCursor(wins).onsuccess = function(event) {
						var cursor = event.target.result;
						if (!cursor)
							return;
						var entry = Object.assign({}, cursor.value, { id: cursor.primaryKey });
						/* Preserve Extreme times in history without ranking them. */
						if (entry.extreme) {
							cursor.continue();
							return;
						}
						if (level == "all" || hasRunDifficulty(entry) &&
						    entry.difficulty.level == level)
							summary.highScores.push(entry);
						else if (!hasRunDifficulty(entry) && canRateRun(entry))
							summary.unratedRuns.push(entry);
						if (summary.highScores.length < 10)
							cursor.continue();
					};
				}
				if (!scores.length) {
					readSummary();
				} else {
					/* Only legacy import needs to inspect the full history. */
					store.getAll().onsuccess = function(event) {
						var known = new Set(event.target.result.filter(function(entry) {
							return entry.outcome == "won" && !entry.multiplayer;
						}).map(legacyScoreKey));
						for (var i = 0; i < scores.length; i++) {
							var key = legacyScoreKey(scores[i]);
							if (known.has(key))
								continue;
							known.add(key);
							add(Object.assign({}, scores[i], {
								outcome: "won", generatorVersion: 1,
								rows: 6, columns: 6,
							}));
						}
						readSummary();
					};
				}
			} catch (e) {
				db.close();
				resolve(null);
			}
		};
	}).catch(function() {
		/* Storage failures must not prevent finishing the game. */
		return null;
	});
}

/* Patch only difficulty, preserving the stored run and its out-of-line key.
 * A failed cache write is harmless: a future visit can calculate it again.
 */
function saveRunDifficulty(id, difficulty) {
	return new Promise(function(resolve) {
		if (typeof indexedDB == "undefined" || id === undefined) {
			resolve(false);
			return;
		}
		var request = openRunDatabase();
		request.onerror = function() { resolve(false); };
		request.onsuccess = function() {
			var db = request.result;
			db.onversionchange = function() { db.close(); };
			try {
				var transaction = db.transaction("runs", "readwrite");
				transaction.oncomplete = function() { db.close(); resolve(true); };
				transaction.onabort = function() { db.close(); resolve(false); };
				var store = transaction.objectStore("runs");
				store.get(id).onsuccess = function(event) {
					var run = event.target.result;
					if (run) {
						run[run.extreme ? "extremeDifficulty" : "difficulty"] = difficulty;
						store.put(run, id);
					}
				};
			} catch (e) {
				db.close();
				resolve(false);
			}
		};
	}).catch(function() { return false; });
}

function legacyScoreKey(score) {
	return JSON.stringify([score.date, score.seed, score.elapsed]);
}

function parseLegacyScores(raw) {
	var scores = JSON.parse(raw || "[]");
	if (!Array.isArray(scores))
		throw new Error("Invalid legacy high scores");
	return scores.map(function(score) {
		/* Early versions stored only elapsed times, then added dates and seeds. */
		if (Number.isFinite(score) && score >= 0)
			return { elapsed: score, date: null };
		if (!score || !Number.isFinite(score.elapsed) || score.elapsed < 0)
			throw new Error("Invalid legacy high score");
		var entry = { elapsed: score.elapsed, date: null };
		if (Number.isFinite(score.date) && score.date >= 0)
			entry.date = score.date;
		if (Number.isInteger(score.seed) && score.seed >= 0 && score.seed <= 0xffffffff)
			entry.seed = score.seed;
		return entry;
	});
}

function playChime(context, frequency, delay, volume, output) {
	var partials = [1, 2.76, 5.4, 8.93];
	var strengths = [0.7, 1, 0.32, 0.12];
	var durations = [1.5, 1.15, 0.65, 0.38];
	var start = context.currentTime + delay;
	for (var i = 0; i < partials.length; i++) {
		var oscillator = context.createOscillator();
		var gain = context.createGain();
		oscillator.type = "sine";
		oscillator.frequency.value = frequency * partials[i];
		gain.gain.setValueAtTime(0.0001, start);
		gain.gain.exponentialRampToValueAtTime(volume * strengths[i],
			start + 0.002);
		gain.gain.exponentialRampToValueAtTime(0.0001,
			start + durations[i]);
		oscillator.connect(gain).connect(output);
		oscillator.start(start);
		oscillator.stop(start + durations[i]);
	}
}

/* Shared by gameplay and reconstruction of stored version-1 seeds. */
function generatePuzzleClues(puzzle, horizontalLimit, verticalLimit) {
	puzzle.clues = [];
	var types = [ExactClue, OrderClue, Adjacent2Clue,
		     Adjacent3Clue, ColumnClue];
	do {
		while (!cluesSolve(puzzle, puzzle.clues)) {
			var type = weightedChoice(types);
			var clue = new type(puzzle);
			puzzle.clues.push(clue);
			if (clue.displayType)
				clue.active = true;
		}

		for (var i = puzzle.clues.length - 1; i >= 0; i--) {
			var without = puzzle.clues.slice();
			without.splice(i, 1);
			if (cluesSolve(puzzle, without))
				puzzle.clues = without;
		}

		puzzle.clues = limitDisplayedClues(puzzle.clues,
			"horizontal", horizontalLimit);
		puzzle.clues = limitDisplayedClues(puzzle.clues,
			"vertical", verticalLimit);
	} while (!cluesSolve(puzzle, puzzle.clues));
}

/* Deterministically prune a normal puzzle with the full solver. Return the
 * retained clue indices, or null if deduction still solves the result. */
function extremeClueIndices(puzzle) {
	var indices = puzzle.clues.map((clue, index) => index);
	for (var i = indices.length - 1; i >= 0; i--) {
		var without = indices.filter((index, position) => position !== i);
		if (countSolutions(puzzle, without.map(index => puzzle.clues[index])) === 1)
			indices = without;
	}
	return cluesSolve(puzzle, indices.map(index => puzzle.clues[index])) ? null : indices;
}

/* Count interruptions to ordinary propagation along a deterministic route.
 * At each stall, reject the trial that unlocks the most candidate removals.
 * This is a reproducible estimate, not the minimum over all solving routes.
 * Limit trial work and leave deeper-search puzzles unrated. */
function traceExtremeDifficulty(puzzle, maxTrials = 10000, options = {}) {
	var size = puzzle.rows[0].slots.length;
	var domains = puzzle.rows.map(() => Array(size).fill((1 << size) - 1));
	var result = { bottlenecks: 0, complete: false };
	if (options.measureCost)
		result.costs = [];
	var route = options.route || 0;
	var clues = clueRouteOrder(puzzle.clues, route);
	var candidates = data => data.flat().reduce((sum, bits) => sum + countBits(bits), 0);
	if (!cluesAllow(puzzle, clues, domains))
		return result;
	while (candidates(domains) > puzzle.rows.length * size) {
		var best = null, chosen;
		var bestSize = candidates(domains);
		var trials = [];
		for (var row = 0; row < domains.length; row++) {
			for (var symbol = 0; symbol < size; symbol++) {
				var choices = domains[row][symbol];
				if ((choices & (choices - 1)) == 0)
					continue;
				for (var bits = choices; bits; bits &= bits - 1)
					trials.push({ row, symbol, bit: bits & -bits });
			}
		}
		for (var trial of clueRouteOrder(trials, route)) {
			if (--maxTrials < 0)
				return result;
			var assumed = copyDomains(domains);
			assumed[trial.row][trial.symbol] = trial.bit;
			if (cluesAllow(puzzle, clues, assumed))
				continue;
			var after = copyDomains(domains);
			after[trial.row][trial.symbol] &= ~trial.bit;
			if (!cluesAllow(puzzle, clues, after))
				return result;
			var remaining = candidates(after);
			if (remaining < bestSize) {
				best = after;
				bestSize = remaining;
				chosen = trial;
			}
		}
		if (!best)
			return { ...result, stalled: true };
		if (options.measureCost) {
			/* Measure only the selected contradiction, excluding the act of
			 * assuming a placement and the progress after rejecting it. */
			var assumed = copyDomains(domains);
			assumed[chosen.row][chosen.symbol] = chosen.bit;
			var before = candidates(assumed);
			var work = { passes: 0 };
			cluesAllow(puzzle, clues, assumed, work);
			result.costs.push({
				row: chosen.row, symbol: chosen.symbol, column: Math.log2(chosen.bit),
				eliminations: before - candidates(assumed), passes: work.passes,
				progress: candidates(domains) - bestSize,
			});
		}
		domains = best;
		result.bottlenecks++;
	}
	result.complete = true;
	return result;
}

/* Average weighted contradiction work over fixed routes, independently of
 * proof narration. A genuine stall rates as infinite; an interrupted search
 * leaves the puzzle unrated. */
function measureExtremeDifficulty(puzzle, maxTrials = 10000, routes = 10) {
	if (!Number.isInteger(routes) || routes < 1)
		throw new Error("difficulty analysis needs a positive route count");
	var score = 0, bottlenecks = 0;
	for (var route = 0; route < routes; route++) {
		var run = traceExtremeDifficulty(puzzle, maxTrials, { route, measureCost: true });
		if (!run.complete)
			return run.stalled ? { complete: false, stalled: true, skulls: Infinity } :
				{ complete: false };
		score += run.costs.reduce((sum, cost) => sum + cost.eliminations ** 1.5, 0);
		bottlenecks += run.bottlenecks;
	}
	score /= routes;
	return { complete: true, score, skulls: Math.ceil(score / 1500),
		bottlenecks: bottlenecks / routes };
}

function extremeSkulls(rating) {
	if (!rating.complete && !rating.stalled)
		return "(?)";
	var skull = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
		'<use href="#extreme-skull-icon"/></svg>';
	if (rating.stalled)
		return '<span class="extreme-skulls" role="img" aria-label="Infinite skulls">' +
			skull + ' × ∞</span>';
	return '<span class="extreme-skulls" role="img" aria-label="' +
		rating.skulls + (rating.skulls == 1 ? ' skull' : ' skulls') + '">' +
		(rating.skulls > 5 ? skull + " × " + rating.skulls :
			skull.repeat(rating.skulls)) + '</span>';
}

/* Enumerate single-placement contradictions and the progress unlocked by
 * rejecting each assumption and resuming ordinary propagation. */
function* extremeExplorationTrials(puzzle, domains) {
	var before = difficultyPlacements(domains);
	var candidates = data => data.reduce((sum, row) =>
		sum + row.reduce((count, bits) => count + countBits(bits), 0), 0);
	var beforeCandidates = candidates(domains);
	for (var row = 0; row < domains.length; row++) {
		for (var symbol = 0; symbol < domains[row].length; symbol++) {
			var choices = domains[row][symbol];
			if ((choices & (choices - 1)) == 0)
				continue;
			for (var bits = choices; bits; bits &= bits - 1) {
				var bit = bits & -bits;
				var trial = copyDomains(domains);
				trial[row][symbol] = bit;
				var work = { passes: 0 };
				if (cluesAllow(puzzle, puzzle.clues, trial, work))
					continue;
				var after = copyDomains(domains);
				after[row][symbol] &= ~bit;
				if (!cluesAllow(puzzle, puzzle.clues, after))
					continue;
				var gain = difficultyPlacements(after) - before;
				var reduction = beforeCandidates - candidates(after);
				yield { row, symbol, column: Math.log2(bit), gain, reduction, passes: work.passes };
			}
		}
	}
}

/* Count up to two solutions, branching on the smallest remaining domain.
 * A search budget keeps experimental generation bounded; null means that
 * uniqueness is unproven, so the caller must retain the clue. */
function countSolutions(puzzle, clues, maxNodes = 10000) {
	var size = puzzle.rows[0].slots.length;
	var domains = puzzle.rows.map(() => Array(size).fill((1 << size) - 1));
	var count = 0;
	var exhausted = false;
	function search(domains) {
		if (count >= 2 || exhausted)
			return;
		if (--maxNodes < 0) {
			exhausted = true;
			return;
		}
		if (!cluesAllow(puzzle, clues, domains))
			return;
		var bestRow = -1, bestSymbol, bestSize = size + 1;
		for (var row = 0; row < domains.length; row++) {
			for (var symbol = 0; symbol < size; symbol++) {
				var bits = domains[row][symbol];
				var n = 0;
				for (; bits; bits &= bits - 1)
					n++;
				if (n > 1 && n < bestSize) {
					bestRow = row;
					bestSymbol = symbol;
					bestSize = n;
				}
			}
		}
		if (bestRow < 0) {
			count++;
			return;
		}
		var choices = domains[bestRow][bestSymbol];
		for (var bits = choices; bits; bits &= bits - 1) {
			var branch = copyDomains(domains);
			branch[bestRow][bestSymbol] = bits & -bits;
			search(branch);
		}
	}
	search(domains);
	return exhausted ? null : count;
}

function puzzleFromSeed(seed) {
	return withPuzzleRandom(seed, function() {
		var puzzle = { rows: [], clues: [] };
		for (var r = 0; r < 6; r++) {
			var row = { puzzle: puzzle, slots: [] };
			var values = shuffle([0, 1, 2, 3, 4, 5]);
			for (var value of values)
				row.slots.push({ row: row, value: value });
			puzzle.rows.push(row);
		}
		generatePuzzleClues(puzzle, 18, 8);
		return puzzle;
	});
}

function canRateRun(run) {
	return Number.isInteger(run.seed) && run.seed >= 0 && run.seed <= 0xffffffff &&
		run.generatorVersion == puzzleGeneratorVersion &&
		run.rows == 6 && run.columns == 6;
}

/* Store infinity as an explicit stalled flag so shared JSON results retain it. */
function storedExtremeDifficulty(rating) {
	var { skulls, ...details } = rating;
	return { ...details, version: extremeDifficultyVersion,
		level: rating.stalled ? null : skulls };
}

function hasRunDifficulty(run) {
	if (run.extreme)
		return run.extremeDifficulty?.version === extremeDifficultyVersion;
	return run.difficulty && run.difficulty.version === puzzleDifficultyVersion &&
		difficultyLevels.includes(run.difficulty.level);
}

function showRunDifficulty(element, run) {
	if (run.extreme) {
		element.textContent = "Extreme";
		element.title = "Difficulty: Extreme";
	} else if (hasRunDifficulty(run)) {
		var level = run.difficulty.level;
		element.textContent = level[0].toUpperCase() + level.slice(1);
		element.title = "Difficulty: " + element.textContent;
	} else {
		element.textContent = canRateRun(run) ? "…" : "—";
		element.title = "Difficulty unavailable";
	}
	element.setAttribute("aria-label", element.title);
}

function limitDisplayedClues(clues, displayType, limit) {
	var count = 0;
	return clues.filter(function(clue) {
		if (clue.displayType != displayType)
			return true;
		return count++ < limit;
	});
}

// Generate a random integer in the interval [lo, hi).
function randInt(lo, hi) {
	return lo + Math.floor(puzzleRandom() * (hi - lo));
}

function randomChoice(choices) {
	return choices[randInt(0, choices.length)];
}

function weightedChoice(choices) {
	var total = 0;
	for (var i = 0; i < choices.length; i++)
		total += choices[i].weight;

	var value = puzzleRandom() * total;
	for (var i = 0; i < choices.length; i++) {
		value -= choices[i].weight;
		if (value < 0)
			return choices[i];
	}
}

function shuffle(array) {
	for (var i = array.length - 1; i >= 0; i--) {
		var r = Math.floor(puzzleRandom() * (i+1));
		var tmp = array[i];
		array[i] = array[r];
		array[r] = tmp;
	}
	return array;
}

function copyDomains(domains) {
	return domains.map(function(row) { return row.slice(); });
}

function domainsFromSlots(puzzle) {
	var domains = [];
	for (var row = 0; row < puzzle.rows.length; row++)
		domains[row] = domainsFromRow(puzzle.rows[row]);
	return domains;
}

function proofPlacementsFromSlots(puzzle) {
	var placements = Array(puzzle.rows.length).fill(0);
	for (var row = 0; row < puzzle.rows.length; row++)
		for (var col = 0; col < puzzle.rows[row].slots.length; col++) {
			var slot = puzzle.rows[row].slots[col];
			if (slot.single)
				placements[row] |= 1 << slot.value;
		}
	return placements;
}

function domainsFromRow(row) {
	var rowSize = row.slots.length;
	var domains = Array(rowSize).fill(0);
	for (var col = 0; col < rowSize; col++) {
		var slot = row.slots[col];
		var bit = 1 << col;
		if (slot.single)
			domains[slot.value] |= bit;
		else
			for (var symbol = 0; symbol < rowSize; symbol++)
				if (slot.possible[symbol])
					domains[symbol] |= bit;
	}
	return domains;
}

function applyMove(domains, slot, value, discard, rows) {
	var row = rows.indexOf(slot.row);
	var col = slot.row.slots.indexOf(slot);
	var bit = 1 << col;
	if (discard) {
		domains[row][value] &= ~bit;
	} else {
		for (var symbol = 0; symbol < domains[row].length; symbol++)
			domains[row][symbol] &= ~bit;
		domains[row][value] = bit;
	}
}

function applyPencilMark(domains, mark) {
	var col = mark.slot.row.slots.indexOf(mark.slot);
	var bit = 1 << col;
	if (mark.discard) {
		domains[mark.value] &= ~bit;
	} else {
		domains[mark.value] &= bit;
		for (var symbol = 0; symbol < domains.length; symbol++)
			if (symbol != mark.value)
				domains[symbol] &= ~bit;
	}
}

function propagatePencilRow(domains) {
	var changed;
	do {
		changed = false;
		var singles = 0;
		for (var symbol = 0; symbol < domains.length; symbol++) {
			var domain = domains[symbol];
			if (domain && (domain & (domain - 1)) == 0)
				singles |= domain;
		}
		for (var symbol = 0; symbol < domains.length; symbol++) {
			var domain = domains[symbol];
			if (domain && (domain & (domain - 1)) != 0) {
				var reduced = domain & ~singles;
				if (reduced != domain) {
					domains[symbol] = reduced;
					changed = true;
				}
			}
		}

		for (var col = 0; col < domains.length; col++) {
			var bit = 1 << col;
			var candidate = -1;
			for (var symbol = 0; symbol < domains.length; symbol++) {
				if (domains[symbol] & bit) {
					if (candidate >= 0) {
						candidate = -2;
						break;
					}
					candidate = symbol;
				}
			}
			if (candidate >= 0 && domains[candidate] != bit) {
				domains[candidate] = bit;
				changed = true;
			}
		}
	} while (changed);

	var singles = 0;
	for (var symbol = 0; symbol < domains.length; symbol++) {
		var domain = domains[symbol];
		if (!domain)
			return true;
		if ((domain & (domain - 1)) == 0) {
			if (singles & domain)
				return true;
			singles |= domain;
		}
	}
	for (var col = 0; col < domains.length; col++) {
		var bit = 1 << col;
		var found = false;
		for (var symbol = 0; symbol < domains.length; symbol++)
			if (domains[symbol] & bit)
				found = true;
		if (!found)
			return true;
	}
	return false;
}

function cluesAllow(puzzle, clues, domains, work = null) {
	var numRows = puzzle.rows.length;
	var rowSize = puzzle.rows[0].slots.length;
	var fullDomain = (1 << rowSize) - 1;

	var changed;
	do {
		if (work)
			work.passes++;
		changed = false;

		/* Each column contains exactly one symbol from each row. */
		for (var row = 0; row < numRows; row++) {
			var singles = 0;
			for (var symbol = 0; symbol < rowSize; symbol++) {
				var domain = domains[row][symbol];
				if (!domain)
					return false;
				if ((domain & (domain - 1)) == 0) {
					if (singles & domain)
						return false;
					singles |= domain;
				}
			}
			for (var symbol = 0; symbol < rowSize; symbol++) {
				var domain = domains[row][symbol];
				if ((domain & (domain - 1)) != 0) {
					var reduced = domain & ~singles;
					if (reduced != domain) {
						domains[row][symbol] = reduced;
						changed = true;
					}
				}
			}

			/* A column which has only one candidate fixes that symbol. */
			for (var col = 0; col < rowSize; col++) {
				var bit = 1 << col;
				var candidate = -1;
				for (var symbol = 0; symbol < rowSize; symbol++) {
					if (domains[row][symbol] & bit) {
						if (candidate >= 0) {
							candidate = -2;
							break;
						}
						candidate = symbol;
					}
				}
				if (candidate == -1)
					return false;
				if (candidate >= 0 && domains[row][candidate] != bit) {
					domains[row][candidate] = bit;
					changed = true;
				}
			}
		}

		for (var i = 0; i < clues.length; i++) {
			if (clues[i].constrain(domains, fullDomain))
				changed = true;
		}
	} while (changed);
	return true;
}

function countBits(bits) {
	var count = 0;
	for (; bits; bits &= bits - 1)
		count++;
	return count;
}

/* Return the zero-based index of a single set bit, or null otherwise. */
function singleBitIndex(bits) {
	if (!bits || (bits & (bits - 1)))
		return null;
	var index = 0;
	while (!(bits & (1 << index)))
		index++;
	return index;
}

function proofSymbolReference(puzzle, row, symbol) {
	return "\ue000" + row + ":" + symbol + "\ue001";
}

function proofMessageText(puzzle, message) {
	return message.replace(/\ue000(\d+):(\d+)\ue001/g,
		function(match, row, symbol) {
			return tileSymbolLabel(puzzle.rows[row].slots[0].symbols[symbol]);
		});
}

function renderProofMessage(puzzle, elem, message, qed, contradicts) {
	if (contradicts) {
		var placement = /^(\ue000\d+:\d+\ue001)( must be\b)/;
		if (!placement.test(message))
			throw new Error("contradicting proof is not a placement");
		message = message.replace(placement,
			"$1, not " + contradicts + ",$2");
	}
	var suffix = qed ? " Q.E.D." : "";
	elem.textContent = proofMessageText(puzzle, message) + suffix;
	var wrapper = document.createElement("span");
	wrapper.className = "proof-message";
	var pattern = /\ue000(\d+):(\d+)\ue001/g;
	var offset = 0;
	var match;
	while ((match = pattern.exec(message))) {
		wrapper.appendChild(document.createTextNode(
			message.slice(offset, match.index)));
		var row = Number(match[1]);
		var symbol = Number(match[2]);
		var tile = document.createElement("span");
		tile.className = "proof-tile " + puzzle.rows[row].familyClass;
		renderTileSymbol(tile, puzzle.rows[row].slots[0].symbols[symbol]);
		wrapper.appendChild(tile);
		offset = pattern.lastIndex;
	}
	wrapper.appendChild(document.createTextNode(message.slice(offset) + suffix));
	elem.replaceChildren(wrapper);
}

/*
 * Keep deduction identifiers stable when changing their messages. Besides
 * making the proof logic easier to discuss, they let related presentation
 * steps be recognized without comparing their rendered text.
 */
var proofDeductionCatalog = [
	{ id: "adjacent2.placement",
	  message: "{subject} must be in the {position} column because that is the only remaining position adjacent to {other}." },
	{ id: "adjacent2.not-adjacent",
	  message: "{subject} cannot be in {positions} because {other} is not adjacent." },
	{ id: "adjacent3.middle.outer-not-adjacent",
	  message: "{subject} cannot be in {positions} because {outer} must be adjacent." },
	{ id: "adjacent3.middle.placement-between",
	  message: "{subject} must be in the {position} column because it must be between {left} and {right}." },
	{ id: "adjacent3.middle.placement",
	  message: "{subject} must be in the {position} column because that is the only place where {left} and {right} can fit on opposite sides of it." },
	{ id: "adjacent3.middle.no-neighbor",
	  message: "{subject} cannot be in the {position} column because neither {left} nor {right} can be in the {neighbor} column." },
	{ id: "adjacent3.middle.opposite-sides",
	  message: "{subject} cannot be in the {position} column because {left} and {right} must fit on opposite sides of it." },
	{ id: "adjacent3.middle.remove-edges",
	  message: "{subject} cannot be on either edge because it is between two symbols." },
	{ id: "adjacent3.placement.inward-from-edge",
	  message: "{subject} must be in the {position} column because the sequence containing {outer} can only extend toward the center." },
	{ id: "adjacent3.outer.middle-not-adjacent",
	  message: "{subject} cannot be in {positions} because {middle} must be adjacent." },
	{ id: "adjacent3.outer.placement",
	  message: "{subject} must be in the {position} column to complete the sequence with {middle} and {other}." },
	{ id: "adjacent3.outer.only-position",
	  message: "{subject} must be in the {position} column because that is the only place where {middle} can be between it and {other}." },
	{ id: "adjacent3.outer.no-orientation",
	  message: "{subject} cannot be in the {position} column because {middle} and {other} cannot fit beside it in either orientation." },
	{ id: "adjacent3.outer.other-not-two-away",
	  message: "{subject} cannot be in {positions} because {other} must be two positions away." },
	{ id: "clue.placement",
	  message: "{subject} must be in the {position} column." },
	{ id: "clue.remove-position",
	  message: "{subject} cannot be in {positions}." },
	{ id: "column.placement",
	  message: "{subject} must be in the {position} column with {other}." },
	{ id: "column.other-not-position",
	  message: "{subject} cannot be in {positions} because {other} is not." },
	{ id: "conclusion.placement",
	  message: "{subject} must be in the {position} column because it is the only remaining option." },
	{ id: "conclusion.remove-position",
	  message: "{subject} cannot be in the {position} column." },
	{ id: "order.placement",
	  message: "{subject} must be in the {position} column because it must be to the {direction} of {other}." },
	{ id: "order.other-not-beyond",
	  message: "{subject} cannot be in {positions} because {other} must be to its {otherDirection}." },
	{ id: "row.only-candidate",
	  message: "{subject} must be in the {position} column because it is the only remaining option." },
	{ id: "row.only-position",
	  message: "{subject} must be in the {position} column because it has been eliminated everywhere else." },
];

var proofDeductionIds = proofDeductionCatalog.map(function(entry) {
	return entry.id;
});
if (new Set(proofDeductionIds).size != proofDeductionIds.length)
	throw new Error("duplicate proof deduction identifier");

function identifiedDeduction(step, id, values) {
	var entry = proofDeductionCatalog.find(function(candidate) {
		return candidate.id == id;
	});
	if (!entry)
		throw new Error("missing proof deduction: " + id);
	step.deduction = id;
	step.deductionValues = values;
	return entry.message.replace(/\{([A-Za-z]+)\}/g,
		function(match, name) {
			if (!Object.hasOwn(values, name))
				throw new Error("missing value " + name + " for " + id);
			return values[name];
		});
}

function deductionMessage(puzzle, step, before, after) {
	var name = proofSymbolReference(puzzle, step.row, step.symbol);
	var col = singleBitIndex(after);
	if (step.placement && col !== null) {
		return identifiedDeduction(step, "clue.placement", {
			subject: name,
			position: ordinalName(col),
		});
	}
	return identifiedDeduction(step, "clue.remove-position", {
		subject: name,
		positions: positionList(before & ~after),
	});
}

function adjacent3InwardPosition(outerDomain, rowSize, distance) {
	var col = singleBitIndex(outerDomain);
	if (col === null)
		return 0;
	if (col < 2)
		return 1 << (col + distance);
	if (col >= rowSize - 2)
		return 1 << (col - distance);
	return 0;
}

function adjacent3DeductionMessage(puzzle, step, before, after, domains) {
	var clue = step.clue;
	var row = step.row;
	var symbol = step.symbol;
	var removed = before & ~after;
	var placedCol = singleBitIndex(after);
	var removedCol = singleBitIndex(removed);
	var rowSize = domains[row].length;
	var middleRow = puzzle.rows.indexOf(clue.mRow);
	var middleSymbol = clue.mRow.slots[clue.mCol].value;
	var leftRow = puzzle.rows.indexOf(clue.lRow);
	var leftSymbol = clue.lRow.slots[clue.lCol].value;
	var rightRow = puzzle.rows.indexOf(clue.rRow);
	var rightSymbol = clue.rRow.slots[clue.rCol].value;
	var name = proofSymbolReference(puzzle, row, symbol);
	var middleName = proofSymbolReference(puzzle, middleRow, middleSymbol);
	var leftName = proofSymbolReference(puzzle, leftRow, leftSymbol);
	var rightName = proofSymbolReference(puzzle, rightRow, rightSymbol);
	var edges = 1 | (1 << (rowSize - 1));
	if (row == middleRow && symbol == middleSymbol) {
		if (step.placement && placedCol !== null) {
			if (countBits(domains[leftRow][leftSymbol]) == 1 &&
			    countBits(domains[rightRow][rightSymbol]) == 1)
				return identifiedDeduction(step,
					"adjacent3.middle.placement-between", {
						subject: name,
						position: ordinalName(placedCol),
						left: leftName,
						right: rightName,
					});
			if (adjacent3InwardPosition(
			    domains[leftRow][leftSymbol], rowSize, 1) == after)
				return identifiedDeduction(step,
					"adjacent3.placement.inward-from-edge", {
						subject: name,
						position: ordinalName(placedCol),
						outer: leftName,
					});
			if (adjacent3InwardPosition(
			    domains[rightRow][rightSymbol], rowSize, 1) == after)
				return identifiedDeduction(step,
					"adjacent3.placement.inward-from-edge", {
						subject: name,
						position: ordinalName(placedCol),
						outer: rightName,
					});
			return identifiedDeduction(step,
				"adjacent3.middle.placement", {
					subject: name,
					position: ordinalName(placedCol),
					left: leftName,
					right: rightName,
				});
		}
		if (removed == edges)
			return identifiedDeduction(step,
				"adjacent3.middle.remove-edges", { subject: name });
		if (removedCol !== null) {
			var col = removedCol;
			if (col == 0 || col == rowSize - 1)
				return identifiedDeduction(step,
					"adjacent3.middle.remove-edges", {
						subject: name,
					});
			var low = col > 0 ? 1 << (col - 1) : 0;
			var high = col + 1 < rowSize ? 1 << (col + 1) : 0;
			var leftDomain = domains[leftRow][leftSymbol];
			var rightDomain = domains[rightRow][rightSymbol];
			var adjacent = low | high;
			if (!(leftDomain & adjacent))
				return identifiedDeduction(step,
					"adjacent3.middle.outer-not-adjacent", {
						subject: name,
						positions: positionList(removed),
						outer: leftName,
					});
			if (!(rightDomain & adjacent))
				return identifiedDeduction(step,
					"adjacent3.middle.outer-not-adjacent", {
						subject: name,
						positions: positionList(removed),
						outer: rightName,
					});
			if (!(leftDomain & low) && !(rightDomain & low))
				return identifiedDeduction(step,
					"adjacent3.middle.no-neighbor", {
						subject: name,
						position: ordinalName(col),
						left: leftName,
						right: rightName,
						neighbor: ordinalName(col - 1),
					});
			if (!(leftDomain & high) && !(rightDomain & high))
				return identifiedDeduction(step,
					"adjacent3.middle.no-neighbor", {
						subject: name,
						position: ordinalName(col),
						left: leftName,
						right: rightName,
						neighbor: ordinalName(col + 1),
					});
			return identifiedDeduction(step,
				"adjacent3.middle.opposite-sides", {
					subject: name,
					position: ordinalName(col),
					left: leftName,
					right: rightName,
				});
		}
		var leftDomain = domains[leftRow][leftSymbol];
		var rightDomain = domains[rightRow][rightSymbol];
		if (positionsLackAdjacent(removed, leftDomain, rowSize))
			return identifiedDeduction(step,
				"adjacent3.middle.outer-not-adjacent", {
					subject: name,
					positions: positionList(removed),
					outer: leftName,
				});
		if (positionsLackAdjacent(removed, rightDomain, rowSize))
			return identifiedDeduction(step,
				"adjacent3.middle.outer-not-adjacent", {
					subject: name,
					positions: positionList(removed),
					outer: rightName,
				});
		return deductionMessage(puzzle, step, before, after);
	}

	var otherRow = row == leftRow && symbol == leftSymbol ?
		rightRow : leftRow;
	var otherSymbol = row == leftRow && symbol == leftSymbol ?
		rightSymbol : leftSymbol;
	var otherName = proofSymbolReference(puzzle, otherRow, otherSymbol);
	if (step.placement && placedCol !== null &&
	    adjacent3InwardPosition(domains[otherRow][otherSymbol],
		rowSize, 2) == after) {
		return identifiedDeduction(step,
			"adjacent3.placement.inward-from-edge", {
				subject: name,
				position: ordinalName(placedCol),
				outer: otherName,
			});
	}
	if (step.placement && placedCol !== null &&
	    countBits(domains[middleRow][middleSymbol]) == 1 &&
	    countBits(domains[otherRow][otherSymbol]) == 1) {
		return identifiedDeduction(step, "adjacent3.outer.placement", {
			subject: name,
			position: ordinalName(placedCol),
			middle: middleName,
			other: otherName,
		});
	}
	if (step.placement && placedCol !== null) {
		return identifiedDeduction(step, "adjacent3.outer.only-position", {
			subject: name,
			position: ordinalName(placedCol),
			middle: middleName,
			other: otherName,
		});
	}
	if (removed && removedCol === null) {
		var cause = adjacent3OuterCommonCause(removed, rowSize,
			domains[middleRow][middleSymbol], domains[otherRow][otherSymbol]);
		if (cause.otherCannotFit)
			return identifiedDeduction(step,
				"adjacent3.outer.other-not-two-away", {
					subject: name,
					positions: positionList(removed),
					other: otherName,
				});
		if (cause.middleCannotFit)
			return identifiedDeduction(step,
				"adjacent3.outer.middle-not-adjacent", {
					subject: name,
					positions: positionList(removed),
					middle: middleName,
				});
	}

	if (removedCol !== null) {
		var col = removedCol;
		var adjacent = 0;
		var twoAway = 0;
		if (col > 0)
			adjacent |= 1 << (col - 1);
		if (col + 1 < rowSize)
			adjacent |= 1 << (col + 1);
		if (col > 1)
			twoAway |= 1 << (col - 2);
		if (col + 2 < rowSize)
			twoAway |= 1 << (col + 2);
		if (!(domains[middleRow][middleSymbol] & adjacent))
			return identifiedDeduction(step,
				"adjacent3.outer.middle-not-adjacent", {
					subject: name,
					positions: positionList(removed),
					middle: middleName,
				});
		if (!(domains[otherRow][otherSymbol] & twoAway))
			return identifiedDeduction(step,
				"adjacent3.outer.other-not-two-away", {
					subject: name,
					positions: positionList(removed),
					other: otherName,
				});
		return identifiedDeduction(step,
			"adjacent3.outer.no-orientation", {
				subject: name,
				position: ordinalName(col),
				middle: middleName,
				other: otherName,
			});
	}
	return deductionMessage(puzzle, step, before, after);
}

function adjacent2DeductionMessage(puzzle, step, before, after) {
	var clue = step.clue;
	var removed = before & ~after;
	var leftRow = puzzle.rows.indexOf(clue.lRow);
	var leftSymbol = clue.lRow.slots[clue.lCol].value;
	var rightRow = puzzle.rows.indexOf(clue.rRow);
	var rightSymbol = clue.rRow.slots[clue.rCol].value;
	var otherRow = step.row == leftRow && step.symbol == leftSymbol ?
		rightRow : leftRow;
	var otherSymbol = step.row == leftRow && step.symbol == leftSymbol ?
		rightSymbol : leftSymbol;
	if (step.placement && countBits(after) == 1)
		return identifiedDeduction(step, "adjacent2.placement", {
			subject: proofSymbolReference(puzzle, step.row, step.symbol),
			position: ordinalName(Math.log2(after)),
			other: proofSymbolReference(puzzle, otherRow, otherSymbol),
		});
	return identifiedDeduction(step, "adjacent2.not-adjacent", {
		subject: proofSymbolReference(puzzle, step.row, step.symbol),
		positions: positionList(removed),
		other: proofSymbolReference(puzzle, otherRow, otherSymbol),
	});
}

function orderDeductionMessage(puzzle, step, before, after) {
	var removed = before & ~after;
	var leftRow = puzzle.rows.indexOf(step.clue.lRow);
	var leftSymbol = step.clue.lRow.slots[step.clue.lCol].value;
	var isLeft = step.row == leftRow && step.symbol == leftSymbol;
	var subject = proofSymbolReference(puzzle, step.row, step.symbol);
	var otherRow = isLeft ? puzzle.rows.indexOf(step.clue.rRow) : leftRow;
	var otherSymbol = isLeft ? step.clue.rRow.slots[step.clue.rCol].value :
		leftSymbol;
	if (step.placement && countBits(after) == 1)
		return identifiedDeduction(step, "order.placement", {
			subject: subject,
			position: ordinalName(singleBitIndex(after)),
			other: proofSymbolReference(puzzle, otherRow, otherSymbol),
			direction: isLeft ? "left" : "right",
		});
	return identifiedDeduction(step, "order.other-not-beyond", {
		subject: subject,
		positions: positionList(removed),
		other: proofSymbolReference(puzzle, otherRow, otherSymbol),
		otherDirection: isLeft ? "right" : "left",
	});
}

function columnDeductionMessage(puzzle, step, before, after) {
	var removed = before & ~after;
	var clue = step.clue;
	var topRow = puzzle.rows.indexOf(clue.tRow);
	var topSymbol = clue.tRow.slots[clue.col].value;
	var otherRow = step.row == topRow && step.symbol == topSymbol ?
		puzzle.rows.indexOf(clue.bRow) : topRow;
	var otherSymbol = step.row == topRow && step.symbol == topSymbol ?
		clue.bRow.slots[clue.col].value : topSymbol;
	var col = singleBitIndex(after);
	if (step.placement && col !== null) {
		return identifiedDeduction(step, "column.placement", {
			subject: proofSymbolReference(puzzle, step.row, step.symbol),
			position: ordinalName(col),
			other: proofSymbolReference(puzzle, otherRow, otherSymbol),
		});
	}
	return identifiedDeduction(step, "column.other-not-position", {
		subject: proofSymbolReference(puzzle, step.row, step.symbol),
		positions: positionList(removed),
		other: proofSymbolReference(puzzle, otherRow, otherSymbol),
	});
}

function proofDeductionMessage(puzzle, step, before, after, domains) {
	if (step.clue && step.clue.mRow)
		return adjacent3DeductionMessage(puzzle, step, before, after,
			domains);
	if (step.clue && step.clue.constructor == Adjacent2Clue)
		return adjacent2DeductionMessage(puzzle, step, before, after);
	if (step.clue && step.clue.constructor == OrderClue)
		return orderDeductionMessage(puzzle, step, before, after);
	if (step.clue && step.clue.constructor == ColumnClue)
		return columnDeductionMessage(puzzle, step, before, after);
	return deductionMessage(puzzle, step, before, after);
}

function forcedProofMessage(puzzle, step) {
	var name = proofSymbolReference(puzzle, step.row, step.symbol);
	if (step.rule == "only-position")
		return identifiedDeduction(step, "row.only-position", {
			subject: name,
			position: ordinalName(step.column),
		});
	return identifiedDeduction(step, "row.only-candidate", {
		subject: name,
		position: ordinalName(step.column),
	});
}

function ordinalName(col) {
	var names = ["first", "second", "third", "fourth", "fifth", "sixth"];
	return names[col] || String(col + 1);
}

function positionsLackAdjacent(positions, domain, rowSize) {
	for (var col = 0; col < rowSize; col++) {
		if (!(positions & (1 << col)))
			continue;
		var adjacent = 0;
		if (col > 0)
			adjacent |= 1 << (col - 1);
		if (col + 1 < rowSize)
			adjacent |= 1 << (col + 1);
		if (domain & adjacent)
			return false;
	}
	return true;
}

function positionList(bits) {
	var positions = [];
	for (var col = 0; bits; col++, bits >>= 1)
		if (bits & 1)
			positions.push(ordinalName(col));
	if (positions.length == 1)
		return "the " + positions[0] + " column";
	if (positions.length == 2)
		return "the " + positions[0] + " and " + positions[1] +
			" columns";
	return "the " + positions.slice(0, -1).join(", ") + ", and " +
		positions[positions.length - 1] + " columns";
}

/* Which neighbor rules out every removed position of an outer symbol? */
function adjacent3OuterCommonCause(removed, rowSize, middleDomain, otherDomain) {
	var middleCannotFit = true;
	var otherCannotFit = true;
	for (var col = 0; col < rowSize; col++) {
		if (!(removed & (1 << col)))
			continue;
		var adjacent = 0;
		var twoAway = 0;
		if (col > 0)
			adjacent |= 1 << (col - 1);
		if (col + 1 < rowSize)
			adjacent |= 1 << (col + 1);
		if (col > 1)
			twoAway |= 1 << (col - 2);
		if (col + 2 < rowSize)
			twoAway |= 1 << (col + 2);
		if (middleDomain & adjacent)
			middleCannotFit = false;
		if (otherDomain & twoAway)
			otherCannotFit = false;
	}
	return { middleCannotFit, otherCannotFit };
}

function adjacent3OuterHasCommonCause(puzzle, step, removed, domains) {
	var clue = step.clue;
	var middleRow = puzzle.rows.indexOf(clue.mRow);
	var middleSymbol = clue.mRow.slots[clue.mCol].value;
	if (step.row == middleRow && step.symbol == middleSymbol)
		return false;
	var leftRow = puzzle.rows.indexOf(clue.lRow);
	var leftSymbol = clue.lRow.slots[clue.lCol].value;
	var rightRow = puzzle.rows.indexOf(clue.rRow);
	var rightSymbol = clue.rRow.slots[clue.rCol].value;
	var otherRow = step.row == leftRow && step.symbol == leftSymbol ?
		rightRow : leftRow;
	var otherSymbol = step.row == leftRow && step.symbol == leftSymbol ?
		rightSymbol : leftSymbol;
	var cause = adjacent3OuterCommonCause(removed, domains[step.row].length,
		domains[middleRow][middleSymbol], domains[otherRow][otherSymbol]);
	return cause.middleCannotFit || cause.otherCannotFit;
}

function adjacent3OuterCommonCauseGroup(puzzle, step, removed, domains) {
	var group = 0;
	for (var bits = removed; bits; bits &= bits - 1) {
		var bit = bits & -bits;
		if (!group || adjacent3OuterHasCommonCause(puzzle, step,
		    group | bit, domains))
			group |= bit;
	}
	return group;
}

function proofConcluded(puzzle, domains, failedSlot, failedValue) {
	var row = puzzle.rows.indexOf(failedSlot.row);
	var col = failedSlot.row.slots.indexOf(failedSlot);
	var bit = 1 << col;
	if (failedSlot.value == failedValue) {
		if (!(domains[row][failedValue] & bit))
			return false;
		for (var symbol = 0; symbol < domains[row].length; symbol++)
			if (symbol != failedValue && domains[row][symbol] & bit)
				return false;
		return true;
	}
	return !(domains[row][failedValue] & bit);
}

function proofConclusionPresented(puzzle, domains, placements,
				  failedSlot, failedValue) {
	if (!proofConcluded(puzzle, domains, failedSlot, failedValue))
		return false;
	if (failedSlot.value != failedValue)
		return true;
	var row = puzzle.rows.indexOf(failedSlot.row);
	return !!(placements[row] & (1 << failedValue));
}

function proofStepDomain(before, after, rowSize, groupEdges) {
	var removed = before & ~after;
	var edges = 1 | (1 << (rowSize - 1));
	if (countBits(after) == 1 || groupEdges && removed == edges ||
	    countBits(removed) <= 1)
		return after;
	return before & ~(removed & -removed);
}

function nextForcedProofStep(domains, placements) {
	for (var row = 0; row < domains.length; row++) {
		for (var symbol = 0; symbol < domains[row].length; symbol++) {
			var col = singleBitIndex(domains[row][symbol]);
			if (col !== null &&
			    !(placements[row] & (1 << symbol))) {
				return {
					clues: [],
					rule: "only-position",
					placement: true,
					column: col,
					row: row,
					symbol: symbol,
					removed: 0,
				};
			}
		}

		for (var col = 0; col < domains[row].length; col++) {
			var bit = 1 << col;
			var candidate = -1;
			for (var symbol = 0; symbol < domains[row].length; symbol++) {
				if (!(domains[row][symbol] & bit))
					continue;
				if (candidate >= 0) {
					candidate = -2;
					break;
				}
				candidate = symbol;
			}
			if (candidate >= 0 &&
			    !(placements[row] & (1 << candidate))) {
				var removed = domains[row][candidate] & ~bit;
				return {
					clues: [],
					rule: "only-candidate",
					placement: true,
					column: col,
					row: row,
					symbol: candidate,
					removed: removed,
				};
			}
		}
	}
	return null;
}

function clueDirectlyPlaces(clue, domains, row, symbol, fullDomain) {
	/* Adjacency placements can use the target's remaining candidates. */
	if (clue.constructor == Adjacent2Clue || clue.constructor == Adjacent3Clue)
		return true;
	var expanded = copyDomains(domains);
	expanded[row][symbol] = fullDomain;
	clue.constrain(expanded, fullDomain);
	return countBits(expanded[row][symbol]) == 1;
}

function* clueProofSteps(puzzle, clue, domains) {
	var fullDomain = (1 << domains[0].length) - 1;
	var trial = copyDomains(domains);
	clue.constrain(trial, fullDomain);
	var variables = [];
	if (clue.mRow) {
		variables.push({
			row: puzzle.rows.indexOf(clue.mRow),
			symbol: clue.mRow.slots[clue.mCol].value,
		});
	}
	var slots = clueSlots(clue);
	for (var i = 0; i < slots.length; i++) {
		var variable = {
			row: puzzle.rows.indexOf(slots[i].row),
			symbol: slots[i].value,
		};
		if (!variables.some(function(existing) {
			return existing.row == variable.row &&
				existing.symbol == variable.symbol;
		}))
			variables.push(variable);
	}
	for (var i = 0; i < variables.length; i++) {
		var row = variables[i].row;
		var symbol = variables[i].symbol;
		var before = domains[row][symbol];
		var after = before & trial[row][symbol];
		if (after == domains[row][symbol])
			continue;
		var middleRow = clue.mRow ? puzzle.rows.indexOf(clue.mRow) : -1;
		var middleSymbol = clue.mRow ?
			clue.mRow.slots[clue.mCol].value : -1;
		var edges = 1 | (1 << (domains[row].length - 1));
		var removedEdges = domains[row][symbol] & ~after & edges;
		/* Keep direct placements intact before splitting edge discards. */
		if (countBits(after) != 1 &&
		    row == middleRow && symbol == middleSymbol &&
		    removedEdges == edges)
			after = domains[row][symbol] & ~removedEdges;
		else
			after = proofStepDomain(before, after,
				domains[row].length);
		yield {
			clues: clue.display ? [clue] : [],
			clue: clue,
			rule: "clue",
			/* A split discard may leave one candidate even when the clue
			 * rejects all of them. Do not describe that as a clue placement. */
			placement: countBits(after) == 1 && countBits(before & trial[row][symbol]) == 1 &&
				clueDirectlyPlaces(clue, domains, row, symbol,
					fullDomain),
			row: row,
			symbol: symbol,
			removed: domains[row][symbol] & ~after,
		};
	}
}

/* Mistake proofs retain their first-deduction ordering. */
function clueProofStep(puzzle, clue, domains) {
	return clueProofSteps(puzzle, clue, domains).next().value || null;
}

/* Prefer the explainable step which opens the largest automatic row cascade.
 * Break ties with the original anchored/placement priorities, then clue and
 * symbol order. Show only the chosen step: row consequences will be explained
 * on subsequent calls, not silently applied.
 */
function nextHintStep(puzzle, base, basePlacements, clues = puzzle.clues) {
	var step = nextForcedProofStep(base, basePlacements);
	if (!step) {
		var before = difficultyPlacements(base);
		var best = -1, bestPriority = Infinity;
		var full = (1 << base[0].length) - 1;
		var anchored = base.map(row => row.map(bits =>
			countBits(bits) == 1 ? bits : full));
		for (var clue of clues) {
			if (clue.applyInitialState)
				continue;
			var simple = copyDomains(anchored);
			clue.constrain(simple, full);
			for (var candidate of clueProofSteps(puzzle, clue, base)) {
				var trial = copyDomains(base);
				var trialPlacements = basePlacements.slice();
				applyProofStep(trial, trialPlacements, candidate);
				drainForcedProofSteps(trial, trialPlacements);
				var gain = difficultyPlacements(trial) - before;
				var anchoredStep = !(candidate.removed &
					simple[candidate.row][candidate.symbol]);
				var priority = (anchoredStep ? 0 : 2) +
					(candidate.placement ? 0 : 1);
				if (gain > best || gain == best && priority < bestPriority) {
					best = gain;
					bestPriority = priority;
					step = candidate;
				}
			}
		}
		if (!step)
			return null;
	}
	var domains = copyDomains(base);
	var placements = basePlacements.slice();
	var before = domains[step.row][step.symbol];
	applyProofStep(domains, placements, step);
	step.domain = domains[step.row][step.symbol];
	step.domains = domains;
	step.placements = placements;
	step.message = step.rule == "clue" ?
		proofDeductionMessage(puzzle, step, before, step.domain, domains) :
		forcedProofMessage(puzzle, step);
	return step;
}

/* Search only when expanding the hint, and keep the step already shown.
 * A caller starting at a stall can pass null and the current board instead. */
function buildHintSteps(puzzle, first, base, basePlacements, firstLemma) {
	var full = (1 << puzzle.rows[0].slots.length) - 1;
	var best = [];
	var partial;
	for (var route = 0; route < 10; route++) {
		var clues = clueRouteOrder(puzzle.clues, route);
		var steps = first ? [first] : [];
		var next = first || { domains: base, placements: basePlacements };
		while ((next = nextHintStep(puzzle, next.domains,
				next.placements, clues)))
			steps.push(next);
		if (!partial)
			partial = steps;
		if (steps.length && steps[steps.length - 1].placements.every(bits => bits == full) &&
		    (!best.length || steps.length < best.length))
			best = steps;
		if (best.length == 1)
			break;
	}
	if (!best.length) {
		best = partial;
		extendHintWithLemmas(puzzle, best, base, basePlacements, !best.length && firstLemma);
		var last = best[best.length - 1] || { domains: base, placements: basePlacements };
		if (!last.placements.every(bits => bits == full))
			best.push({
				domains: last.domains, placements: last.placements, clues: [],
				conclusion: true, stalled: true,
				message: "No further ordinary deductions. Explore with chalk to make more progress.",
			});
	}
	return best;
}

/* Explain contradictions without consulting the generated solution. */
function chalkContradiction(puzzle, domains) {
	for (var row = 0; row < domains.length; row++) {
		for (var symbol = 0; symbol < domains[row].length; symbol++)
			if (!domains[row][symbol])
				return "Contradiction: " + proofSymbolReference(puzzle, row, symbol) +
					" has no possible column.";
		for (var column = 0; column < domains[row].length; column++)
			if (!domains[row].some(bits => bits & (1 << column)))
				return "Contradiction: none of the symbols in the row containing " +
					proofSymbolReference(puzzle, row, 0) + " can occupy column " +
					(column + 1) + ".";
	}
	return null;
}

function chalkClueContradiction(puzzle, domains, clues = puzzle.clues) {
	var full = (1 << domains[0].length) - 1;
	for (var clue of clues) {
		if (!clue.displayType)
			continue;
		var trial = copyDomains(domains);
		clue.constrain(trial, full);
		if (!trial.some(row => row.some(bits => !bits)))
			continue;
		var symbols = clueSlots(clue).map(slot =>
			proofSymbolReference(puzzle, puzzle.rows.indexOf(slot.row), slot.value));
		var reason;
		if (clue.constructor == Adjacent3Clue)
			reason = symbols[1] + " cannot fit between " + symbols[0] + " and " +
				symbols[2] + " in three consecutive columns.";
		else if (clue.constructor == Adjacent2Clue)
			reason = symbols[0] + " and " + symbols[1] + " cannot be adjacent.";
		else if (clue.constructor == ColumnClue)
			reason = symbols[0] + " and " + symbols[1] + " cannot share a column.";
		else if (clue.constructor == OrderClue)
			reason = symbols[0] + " cannot be to the left of " + symbols[1] + ".";
		else
			continue;
		return { clue, clues: clue.display ? [clue] : [],
			lemmaStage: "contradiction", message: "Contradiction: " + reason };
	}
	return null;
}

/* A lemma has its own hypothetical snapshots. Only its final discard belongs
 * to the main route; none of the assumption's other consequences survive. */
function buildChalkLemma(puzzle, base, basePlacements, trial,
			 clues = puzzle.clues, maxSteps = Infinity) {
	var { row, symbol, column } = trial;
	var bit = 1 << column;
	var subject = proofSymbolReference(puzzle, row, symbol);
	var claim = subject + " cannot be in column " + (column + 1) + ".";
	var steps = [{
		domains: copyDomains(base), placements: basePlacements.slice(), clues: [],
		lemmaStage: "start", message: claim,
	}];
	var domains = copyDomains(base), placements = basePlacements.slice();
	var selections = [];
	function record(step) {
		step.domain = domains[step.row]?.[step.symbol];
		step.domains = copyDomains(domains);
		step.placements = placements.slice();
		if (step.lemmaStage != "end") {
			if (step.placement)
				selections.push({ row: step.row, symbol: step.symbol,
					column: singleBitIndex(step.domain),
					explicit: step.lemmaStage == "assumption" });
			step.chalkBase = base;
			step.chalkBasePlacements = basePlacements;
			step.chalkSelections = selections.slice();
		}
		steps.push(step);
	}
	var assumption = {
		row, symbol, column, placement: true, removed: base[row][symbol] & ~bit,
		clues: [], lemmaStage: "assumption",
		message: "Suppose " + subject + " is in column " + (column + 1) + ".",
	};
	applyProofStep(domains, placements, assumption);
	record(assumption);
	while (true) {
		/* A finished lemma still needs its contradiction and final discard. */
		if (steps.length + 2 > maxSteps)
			return [];
		var contradiction = chalkContradiction(puzzle, domains);
		if (contradiction) {
			record({ clues: [], lemmaStage: "contradiction", message: contradiction });
			break;
		}
		var clueContradiction = chalkClueContradiction(puzzle, domains, clues);
		if (clueContradiction) {
			record(clueContradiction);
			break;
		}
		var step = nextForcedProofStep(domains, placements) ||
			nextClueProofStep(puzzle, clues, domains);
		if (!step)
			return [];
		var before = domains[step.row][step.symbol];
		applyProofStep(domains, placements, step);
		step.message = step.rule == "clue" ?
			proofDeductionMessage(puzzle, step, before, domains[step.row][step.symbol], domains) :
			forcedProofMessage(puzzle, step);
		step.lemmaStage = "deduction";
		record(step);
	}
	domains = copyDomains(base);
	placements = basePlacements.slice();
	domains[row][symbol] &= ~bit;
	record({ row, symbol, removed: bit, placement: false, clues: [],
		lemmaStage: "end", message: "Therefore " + claim,
	});
	return steps;
}

/* Balance progress up to the next stall against the cost of explaining it.
 * Count substeps (assumption through conclusion), excluding the lemma title.
 * Simplify the selected proof afterward to avoid pruning every candidate. */
function bestChalkLemma(puzzle, domains, placements) {
	var trials = Array.from(extremeExplorationTrials(puzzle, domains));
	trials.sort((a, b) => b.reduction - a.reduction);
	var best = [], chosen;
	for (var trial of trials) {
		var limit = chosen ?
			Math.floor(trial.reduction * (best.length - 1) / chosen.reduction) + 1 : Infinity;
		var lemma = buildChalkLemma(puzzle, domains, placements, trial,
			puzzle.clues, limit);
		if (lemma.length && (!chosen ||
		    trial.reduction * (best.length - 1) > chosen.reduction * (lemma.length - 1))) {
			best = lemma;
			chosen = trial;
		}
	}
	if (!chosen)
		return [];
	/* Fewer clues can expose a different, longer route. Accept a removal
	 * only if its rebuilt explanation is no longer than the current best. */
	var clues = puzzle.clues.slice();
	for (var clue of puzzle.clues) {
		var reduced = clues.filter(candidate => candidate !== clue);
		var lemma = buildChalkLemma(puzzle, domains, placements, chosen,
			reduced, best.length);
		if (lemma.length) {
			clues = reduced;
			best = lemma;
		}
	}
	return best;
}

function extendHintWithLemmas(puzzle, steps, base, basePlacements, firstLemma) {
	while (true) {
		var last = steps[steps.length - 1] || { domains: base, placements: basePlacements };
		var lemma = firstLemma || bestChalkLemma(puzzle, last.domains, last.placements);
		firstLemma = null;
		if (!lemma.length)
			break;
		steps.push(...lemma);
		last = steps[steps.length - 1];
		var next;
		while ((next = nextHintStep(puzzle, last.domains, last.placements))) {
			steps.push(next);
			last = next;
		}
	}
	var number = 0, substep = 0;
	for (var step of steps) {
		if (!step.lemmaStage || step.lemmaStage == "start") {
			number++;
			substep = 0;
			step.walkthroughNumber = String(number);
		} else {
			step.walkthroughNumber = number + "." + (++substep);
		}
	}
}

function nextClueProofStep(puzzle, clues, domains) {
	for (var i = 0; i < clues.length; i++) {
		var step = clueProofStep(puzzle, clues[i], domains);
		if (step)
			return step;
	}
	return null;
}

function proofStepSupported(puzzle, step, domains, placements) {
	var row = step.row;
	var symbol = step.symbol;
	if (step.rule == "only-position") {
		var bit = 1 << step.column;
		return !(placements[row] & (1 << symbol)) &&
			domains[row][symbol] == bit;
	}
	if (step.rule == "only-candidate") {
		var bit = 1 << step.column;
		if (placements[row] & (1 << symbol) ||
		    !(domains[row][symbol] & bit))
			return false;
		for (var other = 0; other < domains[row].length; other++)
			if (other != symbol && domains[row][other] & bit)
				return false;
		return true;
	}
	var fullDomain = (1 << domains[row].length) - 1;
	var trial = copyDomains(domains);
	step.clue.constrain(trial, fullDomain);
	if (step.clue.mRow) {
		var middleRow = puzzle.rows.indexOf(step.clue.mRow);
		var middleSymbol = step.clue.mRow.slots[step.clue.mCol].value;
		if (step.placement &&
		    (row != middleRow || symbol != middleSymbol) &&
		    trial[middleRow][middleSymbol] !=
		    domains[middleRow][middleSymbol]) {
			if (step.clue.constructor != Adjacent3Clue)
				return false;
			var leftRow = puzzle.rows.indexOf(step.clue.lRow);
			var leftSymbol = step.clue.lRow.slots[step.clue.lCol].value;
			var otherRow = row == leftRow && symbol == leftSymbol ?
				puzzle.rows.indexOf(step.clue.rRow) : leftRow;
			var otherSymbol = row == leftRow && symbol == leftSymbol ?
				step.clue.rRow.slots[step.clue.rCol].value : leftSymbol;
			var after = domains[row][symbol] & trial[row][symbol];
			if (adjacent3InwardPosition(domains[otherRow][otherSymbol],
				domains[row].length, 2) != after)
				return false;
		}
	}
	return trial[row][symbol] != domains[row][symbol];
}

function refreshProofStep(puzzle, step, domains) {
	if (!step.clue)
		return step;
	var fullDomain = (1 << domains[step.row].length) - 1;
	var trial = copyDomains(domains);
	step.clue.constrain(trial, fullDomain);
	var before = domains[step.row][step.symbol];
	var after = before & trial[step.row][step.symbol];
	if (after == before)
		return null;
	var directlyPlaced = countBits(after) == 1 &&
		clueDirectlyPlaces(step.clue, domains, step.row, step.symbol,
			fullDomain);
	/* A stronger deduction may need an explanation the original removal
	 * did not. Do not promote it to a placement that replay would reject.
	 */
	if (directlyPlaced && !step.placement && !proofStepSupported(puzzle,
	    Object.assign({}, step, { placement: true }), domains, []))
		directlyPlaced = false;
	var anchored = before & ~after & step.removed;
	if (step.clue.constructor == Adjacent3Clue && countBits(anchored) > 1) {
		var edges = 1 | (1 << (domains[step.row].length - 1));
		var middleEdges = anchored == edges &&
			step.row == puzzle.rows.indexOf(step.clue.mRow) &&
			step.symbol == step.clue.mRow.slots[step.clue.mCol].value;
		/* Only the middle has an unconditional reason to exclude both
		 * edges. An outer symbol still needs a shared cause.
		 */
		if (!middleEdges && !adjacent3OuterHasCommonCause(puzzle,
			    step, anchored, domains))
			anchored &= -anchored;
	}
	if (!directlyPlaced && anchored)
		after = before & ~anchored;
	else {
		var middleRow = step.clue && step.clue.mRow ?
			puzzle.rows.indexOf(step.clue.mRow) : -1;
		var middleSymbol = step.clue && step.clue.mRow ?
			step.clue.mRow.slots[step.clue.mCol].value : -1;
		var groupEdges = step.row == middleRow &&
			step.symbol == middleSymbol;
		after = proofStepDomain(before, after,
			domains[step.row].length, groupEdges);
	}
	var refreshed = Object.assign({}, step);
	refreshed.removed = before & ~after;
	refreshed.placement = countBits(after) == 1 && directlyPlaced;
	return refreshed;
}

function applyProofStep(domains, placements, step) {
	var row = step.row;
	var symbol = step.symbol;
	domains[row][symbol] &= ~step.removed;
	if (!step.placement)
		return;
	var placed = domains[row][symbol];
	placements[row] |= 1 << symbol;
	for (var other = 0; other < domains[row].length; other++)
		if (other != symbol)
			domains[row][other] &= ~placed;
}

function drainForcedProofSteps(domains, placements, output, stop) {
	var step;
	while ((!stop || !stop()) &&
	       (step = nextForcedProofStep(domains, placements))) {
		var before = domains[step.row][step.symbol];
		applyProofStep(domains, placements, step);
		if (output)
			output(step, before);
	}
}

function replayProofSteps(puzzle, base, basePlacements, steps,
			  failedSlot, failedValue) {
	var current = copyDomains(base);
	var placements = basePlacements.slice();
	for (var i = 0; i < steps.length; i++) {
		var step = refreshProofStep(puzzle, steps[i], current);
		/* A forced step may already have made this deduction redundant. */
		if (!step)
			continue;
		if (!proofStepSupported(puzzle, step, current, placements))
			return null;
		applyProofStep(current, placements, step);
		drainForcedProofSteps(current, placements);
	}
	return proofConcluded(puzzle, current, failedSlot, failedValue) ?
		current : null;
}

function pruneProofSteps(puzzle, base, basePlacements, steps,
			 failedSlot, failedValue) {
	var orders = [steps.slice(), steps.slice().reverse()];
	var best = steps;
	for (var pass = 0; pass < orders.length; pass++) {
		var kept = steps.slice();
		for (var i = 0; i < orders[pass].length; i++) {
			var candidate = orders[pass][i];
			var trial = kept.filter(function(step) {
				return step != candidate;
			});
			if (replayProofSteps(puzzle, base, basePlacements, trial,
					     failedSlot, failedValue))
				kept = trial;
		}
		if (kept.length < best.length)
			best = kept;
	}

	/*
	 * Removing one step at a time can leave an unused chain at a local
	 * minimum: each later step is anchored to the domain left by the earlier
	 * one, even though the whole chain is irrelevant. Try each subject's
	 * deductions as a group, and let replayProofSteps verify that removing the
	 * group preserves both the proof and its conclusion.
	 */
	var changed = true;
	while (changed) {
		changed = false;
		var subjects = [];
		for (var i = 0; i < best.length; i++) {
			var subject = best[i].row + ":" + best[i].symbol;
			if (subjects.indexOf(subject) < 0)
				subjects.push(subject);
		}
		for (var i = 0; i < subjects.length; i++) {
			var subject = subjects[i];
			var trial = best.filter(function(step) {
				return step.row + ":" + step.symbol != subject;
			});
			if (replayProofSteps(puzzle, base, basePlacements, trial,
					     failedSlot, failedValue)) {
				best = trial;
				changed = true;
				break;
			}
		}
	}
	return best;
}

function proofStepSubjects(puzzle, step) {
	var subjects = [step.row + ":" + step.symbol];
	if (!step.clue)
		return subjects;
	var slots = clueSlots(step.clue);
	for (var i = 0; i < slots.length; i++) {
		var subject = puzzle.rows.indexOf(slots[i].row) + ":" +
			slots[i].value;
		if (subjects.indexOf(subject) < 0)
			subjects.push(subject);
	}
	return subjects;
}

function orderProofSteps(puzzle, base, basePlacements, steps,
			 failedSlot, failedValue) {
	var current = copyDomains(base);
	var placements = basePlacements.slice();
	var remaining = steps.slice();
	var ordered = [];
	var previousSubjects = [];
	while (remaining.length) {
		var best = null;
		var bestStep = null;
		var bestScore = -1;
		/* Drop deductions superseded by the forced steps drained below. */
		for (var i = remaining.length - 1; i >= 0; i--) {
			var step = refreshProofStep(puzzle, remaining[i], current);
			if (!step)
				remaining.splice(i, 1);
		}
		for (var i = 0; i < remaining.length; i++) {
			var step = refreshProofStep(puzzle, remaining[i], current);
			if (!proofStepSupported(puzzle, step, current, placements))
				continue;
			var subjects = proofStepSubjects(puzzle, step);
			var score = 0;
			for (var j = 0; j < subjects.length; j++)
				if (previousSubjects.indexOf(subjects[j]) >= 0)
					score++;
			if (ordered.length && step.row == ordered[ordered.length - 1].row &&
			    step.symbol == ordered[ordered.length - 1].symbol)
				score += 10;
			if (score > bestScore) {
				best = i;
				bestStep = step;
				bestScore = score;
			}
		}
		if (!remaining.length)
			break;
		if (best === null)
			return steps;
		remaining.splice(best, 1);
		var step = bestStep;
		applyProofStep(current, placements, step);
		drainForcedProofSteps(current, placements);
		ordered.push(step);
		previousSubjects = proofStepSubjects(puzzle, step);
	}
	return proofConcluded(puzzle, current, failedSlot, failedValue) ?
		ordered : steps;
}

function proofConclusionMessage(puzzle, failedSlot, failedValue) {
	var row = puzzle.rows.indexOf(failedSlot.row);
	var col = failedSlot.row.slots.indexOf(failedSlot);
	var name = proofSymbolReference(puzzle, row, failedValue);
	if (failedSlot.value == failedValue)
		return name + " must be in the " + ordinalName(col) +
			" column.";
	return name + " cannot be in the " + ordinalName(col) +
		" column.";
}

function directFailedProofStep(puzzle, domains, failedSlot, failedValue, clues) {
	var row = puzzle.rows.indexOf(failedSlot.row);
	var col = failedSlot.row.slots.indexOf(failedSlot);
	var bit = 1 << col;
	if (!(domains[row][failedValue] & bit))
		return null;
	var fullDomain = (1 << domains[row].length) - 1;
	for (var i = 0; i < clues.length; i++) {
		var clue = clues[i];
		var trial = copyDomains(domains);
		clue.constrain(trial, fullDomain);
		if (trial[row][failedValue] & bit)
			continue;
		return {
			clues: clue.display ? [clue] : [],
			clue: clue,
			rule: "clue",
			placement: false,
			row: row,
			symbol: failedValue,
			removed: bit,
		};
	}
	return null;
}

function combineRelatedProofSteps(puzzle, steps) {
	var causeFields = {
		"adjacent3.middle.outer-not-adjacent": "outer",
		"adjacent3.outer.middle-not-adjacent": "middle",
		"adjacent3.outer.other-not-two-away": "other",
	};
	var combined = [];
	for (var i = 0; i < steps.length; i++) {
		var step = steps[i];
		var previous = combined[combined.length - 1];
		var causeField = causeFields[step.deduction];
		var sameCause = previous && causeField &&
			previous.deductionValues &&
			step.deductionValues &&
			previous.deductionValues[causeField] ==
				step.deductionValues[causeField];
		if (!previous || !causeField ||
		    step.deduction != previous.deduction ||
		    step.clue != previous.clue || step.row != previous.row ||
		    step.symbol != previous.symbol || !sameCause) {
			combined.push(step);
			continue;
		}

		var before = previous.domain | previous.removed;
		previous.removed |= step.removed;
		previous.domain = step.domain;
		previous.domains = step.domains;
		previous.placements = step.placements;
		previous.placement = step.placement;
		previous.conclusion = previous.conclusion || step.conclusion;
		previous.message = proofDeductionMessage(puzzle, previous, before,
			previous.domain, previous.domains);
	}
	return combined;
}

/* Use a local random stream and leave the displayed clue order intact. */
function clueRouteOrder(clues, route) {
	var order = clues.slice();
	if (route) {
		var random = seedRandom(Math.imul(route, 0x9e3779b9));
		for (var i = order.length - 1; i > 0; i--) {
			var j = Math.floor(random() * (i + 1));
			[order[i], order[j]] = [order[j], order[i]];
		}
	}
	return order;
}

/* Keep the original route on ties. Fixed shuffle seeds make alternate routes
 * reproducible without changing clue display order or the game's random stream.
 */
function buildProofSteps(puzzle, base, basePlacements,
			 failedSlot, failedValue) {
	var best = [];
	for (var route = 0; route < 5; route++) {
		var clues = clueRouteOrder(puzzle.clues, route);
		var steps = buildProofRoute(puzzle, base, basePlacements,
			failedSlot, failedValue, clues);
		if (steps.length && (!best.length || steps.length < best.length))
			best = steps;
		if (best.length == 1)
			break;
	}
	return best;
}

function buildProofRoute(puzzle, base, basePlacements,
			 failedSlot, failedValue, clues) {
	var direct = directFailedProofStep(puzzle, base, failedSlot,
		failedValue, clues);
	if (direct) {
		var directDomains = copyDomains(base);
		var directPlacements = basePlacements.slice();
		var before = directDomains[direct.row][direct.symbol];
		applyProofStep(directDomains, directPlacements, direct);
		if (proofConcluded(puzzle, directDomains, failedSlot, failedValue)) {
			direct.domain = directDomains[direct.row][direct.symbol];
			direct.domains = copyDomains(directDomains);
			direct.placements = directPlacements;
			direct.message = proofDeductionMessage(puzzle, direct, before,
				direct.domain, directDomains);
			direct.conclusion = true;
			return [direct];
		}
	}
	var current = copyDomains(base);
	var placements = basePlacements.slice();
	var steps = [];
	while (true) {
		var step = nextForcedProofStep(current, placements);
		if (!step && proofConcluded(puzzle, current,
					    failedSlot, failedValue))
			break;
		/* Prefer a newly available conclusion over another clue branch.
		 * Pruning can remove steps, but cannot invent this shortcut later.
		 */
		if (!step)
			step = directFailedProofStep(puzzle, current,
				failedSlot, failedValue, clues);
		if (!step)
			step = nextClueProofStep(puzzle, clues, current);
		if (!step || steps.length > 500)
			return [];
		applyProofStep(current, placements, step);
		steps.push(step);
	}

	steps = steps.filter(function(step) { return step.rule == "clue"; });
	steps = pruneProofSteps(puzzle, base, basePlacements, steps,
		failedSlot, failedValue);
	steps = orderProofSteps(puzzle, base, basePlacements, steps,
		failedSlot, failedValue);
	current = copyDomains(base);
	placements = basePlacements.slice();
	var replay = [];
	function recordStep(step, before) {
		step.domain = current[step.row][step.symbol];
		step.domains = copyDomains(current);
		step.placements = placements.slice();
		step.message = step.rule == "clue" ?
			proofDeductionMessage(puzzle, step, before, step.domain, current) :
			forcedProofMessage(puzzle, step);
		replay.push(step);
	}
	for (var i = 0; i < steps.length; i++) {
		var step = refreshProofStep(puzzle, steps[i], current);
		/* Ordering may expose another deduction as redundant. */
		if (!step)
			continue;
		var before = current[step.row][step.symbol];
		var middleRow = step.clue && step.clue.mRow ?
			puzzle.rows.indexOf(step.clue.mRow) : -1;
		var middleSymbol = step.clue && step.clue.mRow ?
			step.clue.mRow.slots[step.clue.mCol].value : -1;
		var fullDomain = (1 << current[step.row].length) - 1;
		if (step.placement && step.clue.constructor == Adjacent3Clue &&
		    (step.row != middleRow || step.symbol != middleSymbol) &&
		    before != fullDomain) {
			/*
			 * If earlier clues have already narrowed an outer symbol, show
			 * each remaining adjacent-three reason before the row singleton
			 * turns into a placement.
			 */
			var target = before & ~step.removed;
			while (current[step.row][step.symbol] != target) {
				var domain = current[step.row][step.symbol];
				var removed = domain & ~target;
				var group = adjacent3OuterCommonCauseGroup(puzzle,
					step, removed, current);
				if (!group)
					group = removed & -removed;
				var split = Object.assign({}, step, {
					placement: false,
					removed: group,
				});
				applyProofStep(current, placements, split);
				recordStep(split, domain);
			}
		} else {
			applyProofStep(current, placements, step);
			recordStep(step, before);
		}
		drainForcedProofSteps(current, placements, recordStep, function() {
			return proofConclusionPresented(puzzle, current,
				placements, failedSlot, failedValue);
		});
	}
	if (!proofConcluded(puzzle, current, failedSlot, failedValue)) {
		var step = directFailedProofStep(puzzle, current,
			failedSlot, failedValue, clues);
		if (!step)
			return [];
		var before = current[step.row][step.symbol];
		applyProofStep(current, placements, step);
		recordStep(step, before);
	}
	steps = replay;
	var conclusion = proofConclusionMessage(puzzle, failedSlot, failedValue);
	if (steps.length && failedSlot.value != failedValue)
		steps[steps.length - 1].conclusion = true;
	else if (steps.length && steps[steps.length - 1].placement &&
		 steps[steps.length - 1].row == puzzle.rows.indexOf(failedSlot.row) &&
		 steps[steps.length - 1].symbol == failedValue &&
		 steps[steps.length - 1].domain ==
			1 << failedSlot.row.slots.indexOf(failedSlot))
		steps[steps.length - 1].conclusion = true;
	else if (steps.length && steps[steps.length - 1].message == conclusion)
		steps[steps.length - 1].conclusion = true;
	else {
		var row = puzzle.rows.indexOf(failedSlot.row);
		var col = failedSlot.row.slots.indexOf(failedSlot);
		var step = {
			clues: [],
			conclusion: true,
			domains: copyDomains(current),
			placements: placements.slice(),
			row: row,
			symbol: failedValue,
		};
		var id = failedSlot.value == failedValue ?
			"conclusion.placement" : "conclusion.remove-position";
		step.message = identifiedDeduction(step, id, {
			subject: proofSymbolReference(puzzle, row, failedValue),
			position: ordinalName(col),
		});
		steps.push(step);
	}
	var finalStep = steps[steps.length - 1];
	var failedRow = puzzle.rows.indexOf(failedSlot.row);
	var failedCol = failedSlot.row.slots.indexOf(failedSlot);
	var failedBit = 1 << failedCol;
	var conflictingPlacement = finalStep && finalStep.placement &&
		finalStep.row == failedRow &&
		(finalStep.symbol == failedValue ?
		 !(finalStep.domain & failedBit) : finalStep.domain == failedBit);
	if (finalStep && finalStep.conclusion && conflictingPlacement &&
	    finalStep.symbol != failedValue)
		finalStep.contradicts = proofSymbolReference(puzzle, failedRow,
			failedValue);
	return combineRelatedProofSteps(puzzle, steps);
}

function clueSlots(clue) {
	if (clue.slot)
		return [clue.slot];
	if (clue.mRow) {
		return [clue.lRow.slots[clue.lCol],
			clue.mRow.slots[clue.mCol],
			clue.rRow.slots[clue.rCol]];
	}
	if (clue.tRow) {
		return [clue.tRow.slots[clue.col],
			clue.bRow.slots[clue.col]];
	}
	if (clue.lRow) {
		return [clue.lRow.slots[clue.lCol],
			clue.rRow.slots[clue.rCol]];
	}
	return [];
}

function isClueExhausted(clue) {
	return clueSlots(clue).every(function(slot) { return slot.single; });
}

/* Placement-first route effort and scarcity, averaged over ten routes.
 * The integer weight balances their sampled spreads; see analysis/DIFFICULTY.md.
 */
function difficultyRating(metrics) {
	var score = metrics.excessDiscards + 5 * metrics.scarcity;
	return { score, level: score < 47 ? "easy" : score < 70 ? "medium" : "hard" };
}

/* Rate the original puzzle, regardless of the player's current progress.
 * This does not mutate the puzzle or consume the generator's random stream.
 */
function puzzleDifficulty(puzzle) {
	return { ...difficultyRating(measureDifficulty(puzzle)), version: puzzleDifficultyVersion };
}

function difficultyPlacements(domains) {
	return domains.flat().filter(bits => countBits(bits) == 1).length;
}

/* Group all reductions to one target from one clue as one observation. */
function difficultyOpportunities(puzzle, domains) {
	var full = (1 << domains[0].length) - 1;
	var result = [];
	for (var clue of puzzle.clues) {
		if (clue.applyInitialState)
			continue;
		var complete = copyDomains(domains);
		clue.constrain(complete, full);
		for (var row = 0; row < domains.length; row++) {
			for (var symbol = 0; symbol < domains[row].length; symbol++) {
				var before = domains[row][symbol];
				var after = before & complete[row][symbol];
				if (!after)
					throw new Error("constraint contradicted generated solution");
				if (after == before)
					continue;
				result.push({ row, symbol, after,
					placement: countBits(after) == 1 });
			}
		}
	}
	return result;
}

/* Look ahead only through automatic row deductions, not subsequent clues.
 * A discard that opens a cascade competes equally with a direct placement.
 */
function placementDifficultyChoices(domains, placements, available) {
	var before = difficultyPlacements(domains);
	var best = -1, choices = [];
	for (var move of available) {
		var trial = copyDomains(domains);
		trial[move.row][move.symbol] = move.after;
		drainForcedProofSteps(trial, placements.slice());
		var gain = difficultyPlacements(trial) - before;
		if (gain > best) {
			best = gain;
			choices = [];
		}
		if (gain == best)
			choices.push(move);
	}
	return choices;
}

function traceDifficulty(puzzle, orderSeed) {
	var random = seedRandom(orderSeed);
	var full = (1 << puzzle.rows[0].slots.length) - 1;
	var domains = puzzle.rows.map(row => row.slots.map(() => full));
	var placements = puzzle.rows.map(() => 0);
	for (var clue of puzzle.clues)
		if (clue.applyInitialState)
			clue.constrain(domains, full);
	drainForcedProofSteps(domains, placements);
	var scarcity = 0;
	var gap = 0, excessDiscards = 0;
	while (difficultyPlacements(domains) < domains.flat().length) {
		var available = difficultyOpportunities(puzzle, domains);
		if (!available.length)
			throw new Error("difficulty solver stalled");
		scarcity += 1 / available.length;
		var choices = placementDifficultyChoices(domains, placements, available);
		var move = choices[Math.floor(random() * choices.length)];
		var beforePlacements = difficultyPlacements(domains);
		domains[move.row][move.symbol] = move.after;
		drainForcedProofSteps(domains, placements);
		if (!move.placement) {
			gap++;
			// The first three discards of each stretch are routine work.
			if (gap > 3)
				excessDiscards++;
		}
		if (difficultyPlacements(domains) > beforePlacements)
			gap = 0;
	}
	return { scarcity, excessDiscards };
}

/* Measure an already-generated puzzle without changing its board or clues.
 * Fixed route seeds keep the result independent of the game's random stream.
 */
function measureDifficulty(puzzle, routes = 10) {
	if (!Number.isInteger(routes) || routes < 1)
		throw new Error("difficulty analysis needs a positive route count");
	var metrics = { scarcity: 0, excessDiscards: 0 };
	for (var i = 0; i < routes; i++) {
		var run = traceDifficulty(puzzle, Math.imul(i + 1, 0x9e3779b9));
		for (var key of Object.keys(metrics))
			metrics[key] += run[key];
	}
	for (var key of Object.keys(metrics))
		metrics[key] /= routes;
	return metrics;
}

/* Try to solve the puzzle using only deductions from the given clues. */
function cluesSolve(puzzle, clues) {
	var numRows = puzzle.rows.length;
	var rowSize = puzzle.rows[0].slots.length;
	var fullDomain = (1 << rowSize) - 1;
	var domains = [];

	for (var row = 0; row < numRows; row++)
		domains[row] = Array(rowSize).fill(fullDomain);

	if (!cluesAllow(puzzle, clues, domains))
		return false;

	for (var row = 0; row < numRows; row++) {
		for (var symbol = 0; symbol < rowSize; symbol++) {
			var domain = domains[row][symbol];
			if (!domain || (domain & (domain - 1)) != 0)
				return false;
		}
	}
	return true;
}

function clueVariable(domains, row, slot) {
	var rowNum = row.puzzle.rows.indexOf(row);
	return {
		domains: domains[rowNum],
		symbol: slot.value
	};
}

function restrictVariable(variable, allowed) {
	var old = variable.domains[variable.symbol];
	variable.domains[variable.symbol] &= allowed;
	return old != variable.domains[variable.symbol];
}

function Row(puzzle, symbols, display, family) {
	this.puzzle = puzzle;
	this.elem = display;
	this.familyClass = "family-" + family;
	this.slots = [];
	for (var i = 0; i < symbols.length; i++)
		this.slots[i] = new Slot(this, symbols, display.insertCell());

	this.clear = function() {
		for (var i = 0; i < this.slots.length; i++) {
			renderTileSymbol(this.slots[i].singleElem, this.slots[i].symbols[i]);
			this.slots[i].displaySingle();
		}
	}

	this.newGame = function() {
		var values = [];
		for (var i = 0; i < this.slots.length; i++)
			values.push(i);
		shuffle(values);
		for (var i = 0; i < this.slots.length; i++)
			this.slots[i].newGame(values[i]);
	}

	this.clearPencilDisplay = function() {
		this.elem.classList.remove("pencil-conflict");
		for (var i = 0; i < this.slots.length; i++)
			this.slots[i].clearPencilDisplay();
	}

	this.displayPencil = function(domains, marks, conflict) {
		this.clearPencilDisplay();
		if (conflict)
			this.elem.classList.add("pencil-conflict");
		for (var col = 0; col < this.slots.length; col++) {
			var slot = this.slots[col];
			if (slot.single)
				continue;
			for (var value = 0; value < domains.length; value++) {
				if (!slot.possible[value])
					continue;
				var selected = false;
				var removed = false;
				for (var i = 0; i < marks.length; i++) {
					if (marks[i].slot != slot ||
					    marks[i].value != value)
						continue;
					slot.possibilityElems[value].style.setProperty("--chalk-author", marks[i].color || "");
					if (marks[i].discard)
						removed = true;
					else
						selected = true;
				}
				var bit = 1 << col;
				var elem = slot.possibilityElems[value];
				if (selected)
					elem.className +=
						" pencil-selected pencil-explicit";
				else if (domains[value] == bit)
					elem.className +=
						" pencil-selected pencil-derived";
				if (removed)
					elem.className +=
						" pencil-removed pencil-explicit";
				else if (!(domains[value] & bit))
					elem.className += selected ? " pencil-contradiction" :
						" pencil-removed pencil-derived";
			}
		}
	}

	this.removePossible = function(value) {
		for (var i = 0; i < this.slots.length; i++)
			this.slots[i].removePossible(value, true);
		for (var i = 0; i < this.slots.length; i++)
			this.slots[i].checkSingleton();
		for (var i = 0; i < this.slots.length; i++)
			if (i != value)
				this.checkSingleton(i);
	}

	this.checkSingleton = function(value) {
		var possible = this.slots.filter(
			function(slot) { return slot.isPossible(value) });
		if (possible.length == 1)
			possible[0].choose(value);
	}

	this.isComplete = function() {
		for (var i = 0; i < this.slots.length; i++)
			if (!this.slots[i].single)
				return false;
		return true;
	}
}

/* A null slot uses the tray's currently expanded slot and action selector. */
function bindTileActions(puzzle, elem, slot, value) {
	var touchPress = false;
	var press = null;
	function suppressReleaseClick() {
		/* Closing the tray can retarget the release click to the board. */
		var controller = new AbortController();
		var options = { capture: true, signal: controller.signal };
		document.addEventListener("pointerdown", function() {
			controller.abort();
		}, options);
		document.addEventListener("click", function(click) {
			controller.abort();
			if (click.detail) {
				click.preventDefault();
				click.stopImmediatePropagation();
			}
		}, options);
	}
	function resetSwipe() {
		elem.style.transform = "";
		elem.style.opacity = "";
		elem.classList.remove("tile-swiping");
		press = null;
	}
	function move(ev) {
		if (!press || press.id != ev.pointerId)
			return;
		var dx = ev.clientX - press.x;
		var dy = ev.clientY - press.y;
		if (!press.swiping && Math.max(Math.abs(dx), Math.abs(dy)) < 6)
			return;
		press.swiping = true;
		press.distance = Math.max(Math.abs(dx), Math.abs(dy));
		elem.classList.add("tile-swiping");
		elem.style.transform = "translate(" + dx + "px," + dy + "px)";
		elem.style.opacity = Math.max(0.15, 1 - press.distance / 100);
	}

	function act(ev, contextMenu) {
		if (!slot)
			puzzle.applySlotTrayAction(value, ev, contextMenu);
		else if (contextMenu || !puzzle.expandTileChoices)
			puzzle.requestTileAction(slot, value,
				puzzle.tileActionForPointer(ev, contextMenu));
	}
	elem.addEventListener("pointerdown", function(ev) {
		resetSwipe();
		touchPress = ev.pointerType == "touch";
		if (touchPress) {
			press = { id: ev.pointerId, x: ev.clientX, y: ev.clientY,
				slot: slot || puzzle.expandedSlot };
			if (elem.setPointerCapture)
				elem.setPointerCapture(ev.pointerId);
		}
		if (slot)
			puzzle.pressTile(elem, ev, slot, value);
	});
	elem.addEventListener("pointermove", move);
	elem.addEventListener("pointerup", function(ev) {
		if (!press || press.id != ev.pointerId)
			return;
		move(ev);
		var swipe = press;
		resetSwipe();
		if (!swipe.swiping)
			return;
		suppressReleaseClick();
		if (swipe.distance >= 30 && swipe.slot &&
		    (slot || puzzle.expandedSlot == swipe.slot) &&
		    swipe.slot.possible[value]) {
			swipe.slot.swiping = true;
			try {
				act(ev, true);
			} finally {
				swipe.slot.swiping = false;
			}
		}
	});
	function cancelSwipe() {
		if (press && press.swiping)
			suppressReleaseClick();
		resetSwipe();
	}
	elem.addEventListener("pointercancel", cancelSwipe);
	elem.addEventListener("lostpointercapture", cancelSwipe);
	elem.addEventListener("click", function(ev) {
		if (puzzle.suppressTileClick == elem) {
			puzzle.suppressTileClick = null;
			return;
		}
		act(ev, false);
	});
	elem.addEventListener("contextmenu", function(ev) {
		ev.preventDefault();
		if (puzzle.suppressTileContextMenu == elem) {
			puzzle.suppressTileContextMenu = null;
			return;
		}
		if (press && press.swiping)
			return;
		resetSwipe();
		if (!slot && puzzle.expandedSlot && (touchPress || ev.pointerType == "touch"))
			suppressReleaseClick();
		act(ev, true);
	});
}

function Slot(row, symbols, display) {
	this.row = row;
	this.symbols = symbols;
	this.elem = display;
	this.elem.className = "slot " + row.familyClass;
	this.elem.addEventListener("click", function(slot) {
		return function() {
			var puzzle = slot.row.puzzle;
			if (!puzzle.expandTileChoices)
				return;
			puzzle.openSlotTray(slot);
		};
	}(this));

	this.say = function(msg) { this.row.puzzle.say(msg) };

	this.newGame = function(value) {
		this.value = value;
		renderTileSymbol(this.singleElem, this.symbols[value]);
		this.possible = [];
		for (var i = 0; i < this.symbols.length; i++)
			this.possible.push(true);
		this.displayPossible();
	}

	this.symbol = function() {
		return this.symbols[this.value];
	}

	this.displaySingle = function(source, supposed) {
		var sourceRect;
		if (source && source.getBoundingClientRect)
			sourceRect = source.getBoundingClientRect();
		this.singleElem.classList.remove("placing", "failed-action",
			"proof-change");
		this.singleElem.hidden = false;
		this.possibleElem.hidden = true;
		if (source) {
			var x = 0;
			var y = -1;
			var scaleX = 1.04;
			var scaleY = 1.04;
			if (sourceRect && this.singleElem.getBoundingClientRect) {
				var destRect = this.singleElem.getBoundingClientRect();
				x = sourceRect.left + sourceRect.width / 2 -
					(destRect.left + destRect.width / 2);
				y = sourceRect.top + sourceRect.height / 2 -
					(destRect.top + destRect.height / 2);
				scaleX = sourceRect.width / destRect.width;
				scaleY = sourceRect.height / destRect.height;
			}
			this.singleElem.style.setProperty("--tile-place-x", x + "px");
			this.singleElem.style.setProperty("--tile-place-y", y + "px");
			this.singleElem.style.setProperty("--tile-place-scale-x", scaleX);
			this.singleElem.style.setProperty("--tile-place-scale-y", scaleY);
			this.singleElem.style.setProperty("--tile-place-overshoot-x",
				(x ? -Math.sign(x) * 2 : 0) + "px");
			this.singleElem.style.setProperty("--tile-place-overshoot-y",
				(y ? -Math.sign(y) * 2 : 0) + "px");
			this.singleElem.classList.add("placing");
		}
		if (!supposed)
			this.single = true;
	}

	this.reveal = function() {
		if (this.single)
			return;
		this.singleElem.hidden = true;
		this.possibleElem.hidden = false;
		this.possibleElem.className = "solution";
		this.possibilityElems[this.value].className = "possibility answer";
	}

	this.displayPossible = function() {
		this.singleElem.classList.remove("placing", "failed-action",
			"proof-change", "clue-highlight-source");
		this.possibleElem.className = "";
		for (var i = 0; i < this.possibilityElems.length; i++)
			this.possibilityElems[i].className = "possibility";
		this.singleElem.hidden = true;
		this.possibleElem.hidden = false;
		this.single = false;
	}

	this.displayProof = function(domains, col, placements, change) {
		this.singleElem.classList.remove("placing");
		var bit = 1 << col;
		var placed = -1;
		for (var i = 0; i < domains.length; i++) {
			if (placements & (1 << i) && domains[i] == bit) {
				placed = i;
				break;
			}
		}
		this.singleElem.classList.remove("failed-action", "proof-change");
		if (placed >= 0) {
			renderTileSymbol(this.singleElem, this.symbols[placed]);
			if (change && change.placement && change.symbol == placed)
				this.singleElem.classList.add("proof-change");
			if (this.row.puzzle.proof &&
			    this.row.puzzle.proof.failedSlot == this &&
			    this.row.puzzle.proof.failedValue == placed)
				this.singleElem.classList.add("failed-action");
			this.singleElem.hidden = false;
			this.possibleElem.hidden = true;
			return;
		}
		this.possibleElem.className = "proof";
		for (var i = 0; i < this.possibilityElems.length; i++) {
			var failed = this.row.puzzle.proof &&
				this.row.puzzle.proof.failedSlot == this &&
				this.row.puzzle.proof.failedValue == i;
			var changed = change && !change.placement &&
				change.symbol == i && change.removed & bit;
			this.possibilityElems[i].className = "possibility" +
				(domains[i] & bit ? "" : " proof-impossible") +
				(changed ? " proof-change" : "") +
				(failed ? " failed-action" : "");
		}
		this.singleElem.hidden = true;
		this.possibleElem.hidden = false;
	}

	this.clearPencilDisplay = function() {
		if (!this.possible)
			return;
		for (var i = 0; i < this.possibilityElems.length; i++) {
			var elem = this.possibilityElems[i];
			elem.style.setProperty("--chalk-author", "");
			var discarding = elem.classList.contains("discarding");
			elem.className = this.possible[i] ? "possibility" :
				"possibility dead-possibility" + (discarding ? " discarding" : "");
		}
	}

	this.choose = function(value, playerAction) {
		if (this.row.puzzle.gameOver || this.row.puzzle.paused ||
		    this.row.puzzle.proof)
			return;
		this.row.puzzle.clearHint();
		this.row.puzzle.clearPracticeMistake();
		if (this.value == value) {
			if (playerAction || this.row.puzzle.placeSoundAllowed)
				this.row.puzzle.playSound("place");
			this.row.puzzle.placeSoundAllowed = false;
			this.displaySingle(this.possibilityElems[value]);
			this.row.removePossible(value);
			this.row.puzzle.reconcilePencilMarks(this.row);
			this.row.puzzle.checkWin();
		} else {
			var clues = this.row.puzzle.findContradictingClues(
				this, value, false);
			this.row.puzzle.lose(
				this.row.puzzle.practiceMode ?
					practiceMistakeMessage(false, clues) :
					randomChoice(falsePlacementMessages),
				clues, this, value);
		}
	}

	this.discard = function(value, playerAction) {
		if (this.single || this.row.puzzle.gameOver ||
		    this.row.puzzle.paused || this.row.puzzle.proof)
			return;
		this.row.puzzle.clearHint();
		this.row.puzzle.clearPracticeMistake();
		if (this.value == value) {
			var clues = this.row.puzzle.findContradictingClues(
				this, value, true);
			this.row.puzzle.lose(
				this.row.puzzle.practiceMode ?
					practiceMistakeMessage(true, clues) :
					randomChoice(falseEliminationMessages),
				clues, this, value);
		} else {
			if (playerAction)
				this.row.puzzle.placeSoundAllowed = true;
			this.removePossible(value);
			this.row.checkSingleton(value);
			if (playerAction && this.row.puzzle.placeSoundAllowed)
				this.row.puzzle.playSound("discard");
			this.row.puzzle.placeSoundAllowed = false;
			this.row.puzzle.reconcilePencilMarks(this.row);
		}
	}

	this.isPossible = function(value) {
		return !this.single && this.possible[value];
	}

	this.removePossible = function(value, deferCheck) {
		var animate = this.possible[value] && !this.single && !this.swiping &&
			!this.row.puzzle.effectsSuppressed;
		this.possible[value] = false;
		this.possibilityElems[value].className =
			"possibility dead-possibility" + (animate ? " discarding" : "");
		if (!deferCheck)
			this.checkSingleton();
	}

	this.checkSingleton = function() {
		if (this.single)
			return;
		var count = 0;
		var last;
		for (var i = 0; i < this.possible.length; i++) {
			if (this.possible[i]) {
				count++;
				last = i;
			}
		}
		if (count == 1)
			this.choose(last);
	}

	this.pencil = function(value, discard) {
		this.row.puzzle.clearHint();
		this.row.puzzle.togglePencilMark(this, value, discard);
	}

	this.singleElem = document.createElement("div");
	this.singleElem.className = "single";
	this.singleElem.hidden = true;
	this.singleElem.addEventListener("pointerdown", ev => {
		var puzzle = this.row.puzzle;
		if ((ev.button !== undefined && ev.button != 0) || puzzle.proof)
			return;
		var identity = this;
		if (!this.single) {
			if (!puzzle.suppose || this.singleElem.hidden)
				return;
			var domains = puzzle.suppose.domains[puzzle.rows.indexOf(this.row)];
			var symbol = domains.findIndex(bits => bits == (1 << this.row.slots.indexOf(this)));
			identity = this.row.slots.find(slot => slot.value == symbol);
			if (!identity)
				return;
		}
		highlightCluesForSlots(puzzle, [identity]);
		this.singleElem.classList.add("clue-highlight-source");
		if (this.singleElem.setPointerCapture)
			this.singleElem.setPointerCapture(ev.pointerId);
	});
	var clearHighlight = () => {
		clearClueHighlights(this.row.puzzle);
		this.singleElem.classList.remove("clue-highlight-source");
	};
	this.singleElem.addEventListener("pointerup", clearHighlight);
	this.singleElem.addEventListener("pointercancel", clearHighlight);
	this.possibleElem = document.createElement("table");
	this.possibilityElems = [];

	// Lay the possibilities out as close to square as we can.
	var rows = Math.floor(Math.sqrt(this.symbols.length));
	var cols = Math.floor(this.symbols.length / rows);
	for (var i = 0; i < rows; i++) {
		var possibleRow = this.possibleElem.insertRow();
		var lo = i * cols;
		var hi = (i+1) * cols;
		if (hi > this.symbols.length)
			hi = this.symbols.length;
		for (var j = lo; j < hi; j++) {
			var recess = possibleRow.insertCell();
			recess.className = "tile-recess";
			var cell = this.possibilityElems[j] = document.createElement("div");
			recess.appendChild(cell);
			var symbol = document.createElement("span");
			symbol.className = "possibility-symbol";
			renderTileSymbol(symbol, this.symbols[j]);
			cell.appendChild(symbol);
			cell.className = "possibility";
			cell.addEventListener("animationend", function(ev) {
				if (ev.animationName == "tile-sink")
					ev.currentTarget.classList.remove("discarding");
			});
			bindTileActions(this.row.puzzle, cell, this, j);
		}
	}

	this.elem.appendChild(this.singleElem);
	this.elem.appendChild(this.possibleElem);
}

function clearClueSlot(slot) {
	slot.cancelCluePress?.();
	slot.cancelCluePress = null;
	slot.animateClueDismissal = null;
	slot.replaceChildren();
	slot.className = "clue";
	slot.onclick = null;
	slot.oncontextmenu = null;
	slot.onpointerdown = null;
	slot.onpointerup = null;
	slot.onpointercancel = null;
	slot.onpointermove = null;
	slot.onlostpointercapture = null;
}

function checkClueDisplay(clue, animate) {
	if (clue.chalkMark)
		clue.display.classList.add("chalk-dismissed");
	else
		clue.display.classList.remove("chalk-dismissed");
	clue.display.style.setProperty("--chalk-author", clue.chalkMark?.color || "");
	if (!clue.rendered) {
		clue.render();
		clue.rendered = true;
	}
	if (animate && clue.display.classList.contains("clue-hidden") == clue.active)
		clue.display.animateClueDismissal?.();
	if (clue.active)
		clue.display.classList.remove("clue-hidden");
	else
		clue.display.classList.add("clue-hidden");
}

function highlightCluesForSlots(puzzle, slots, selected) {
	for (var i = 0; i < puzzle.clues.length; i++) {
		var clue = puzzle.clues[i];
		if (!clue.display)
			continue;
		clue.display.classList.remove("clue-highlight-source",
			"clue-highlight-related");
		if (clue == selected)
			clue.display.classList.add("clue-highlight-source");
		else if (clueSlots(clue).some(function(slot) {
			return slots.indexOf(slot) >= 0;
		}))
			clue.display.classList.add("clue-highlight-related");
	}
}

function highlightRelatedClues(puzzle, selected) {
	highlightCluesForSlots(puzzle, clueSlots(selected), selected);
}

function clearClueHighlights(puzzle) {
	for (var i = 0; i < puzzle.clues.length; i++) {
		if (puzzle.clues[i].display)
			puzzle.clues[i].display.classList.remove(
				"clue-highlight-source", "clue-highlight-related");
	}
}

var clueTouchHighlightDelay = 80;

function renderClue(puzzle, clue, slot, type, elements, horizontal) {
	slot.cancelCluePress?.();
	slot.replaceChildren();
	var content = slot;
	if (horizontal) {
		content = document.createElement("div");
		content.className = "clue-content";
		slot.appendChild(content);
	}
	for (var i = 0; i < elements.length; i++) {
		var elem = document.createElement(type);
		var entry = elements[i];
		if (entry.slot) {
			elem.className = "tile " + entry.slot.row.familyClass;
			renderTileSymbol(elem, entry.slot.symbol());
		} else {
			elem.className = entry.className;
			elem.innerHTML = entry.html;
		}
		content.appendChild(elem);
	}
	var press = null;
	var highlightTimer = null;
	var pointerType = null;
	var dismissed = false;
	var swipeCover = null;
	var swipeAnimation = null;
	var originalChildren = null;
	function clearHighlightDelay() {
		clearTimeout(highlightTimer);
		highlightTimer = null;
	}
	function resetSwipe() {
		swipeAnimation?.cancel();
		swipeAnimation = null;
		if (originalChildren)
			slot.replaceChildren(...originalChildren);
		originalChildren = null;
		swipeCover = null;
		slot.classList.remove("clue-swiping");
	}
	function startCover(swipe) {
		swipe.size = Math.max(1, swipe.axis == "X" ? slot.clientWidth : slot.clientHeight);
		swipe.active = clue.active && !clue.chalkMark;
		originalChildren = Array.from(slot.children);
		swipeCover = document.createElement("div");
		swipeCover.className = "clue-swipe-cover";
		swipeCover.setAttribute("aria-hidden", "true");
		slot.appendChild(swipeCover);
		slot.classList.add("clue-swiping");
	}
	function coverPosition(swipe, offset) {
		/* Dismissal pulls a cover in; restoration pushes the existing cover out. */
		if (swipe.active)
			offset -= swipe.direction * swipe.size;
		return "translate" + swipe.axis + "(" + offset + "px)";
	}
	function finishSwipe(swipe, committed) {
		if (!swipe?.axis || !swipeCover)
			return;
		if (!swipeCover.animate || (typeof matchMedia == "function" &&
		    matchMedia("(prefers-reduced-motion: reduce)").matches)) {
			resetSwipe();
			return;
		}
		var end = committed ? swipe.direction * swipe.size : 0;
		swipeAnimation = swipeCover.animate([
			{ transform: coverPosition(swipe, swipe.offset) },
			{ transform: coverPosition(swipe, end) },
		], { duration: 160, easing: "ease-out", fill: "forwards" });
		swipeAnimation.onfinish = resetSwipe;
	}
	slot.animateClueDismissal = function() {
		if (puzzle.proof || puzzle.effectsSuppressed || swipeCover)
			return;
		resetSwipe();
		var swipe = { axis: horizontal ? "X" : "Y",
			direction: clue.active ? -1 : 1, offset: 0 };
		startCover(swipe);
		swipe.active = !clue.active;
		finishSwipe(swipe, true);
	};
	function dismiss(ev, chalk) {
		if (chalk === undefined)
			chalk = puzzle.tileActionForPointer(ev, true) == "pencil-remove";
		if (chalk)
			puzzle.requestChalkClue(clue);
		else
			puzzle.requestClueAction(clue, !clue.active);
	}
	slot.cancelCluePress = function() {
		clearHighlightDelay();
		if (press)
			clearClueHighlights(puzzle);
		press = null;
		resetSwipe();
	};
	slot.onclick = function(ev) {
		ev.preventDefault();
		/* Pointer-down already handles physical control-clicks. */
		if (ev.ctrlKey && !dismissed && pointerType != "touch")
			dismiss(ev);
	};
	slot.oncontextmenu = function(ev) {
		ev.preventDefault();
		/* A touch hold is for highlighting, even if it opens a menu. */
		if (ev.pointerType == "touch" || pointerType == "touch")
			return;
		if (!dismissed)
			dismiss(ev);
	};
	slot.onpointerdown = function(ev) {
		if (ev.isPrimary === false) {
			clearHighlightDelay();
			if (press)
				press.cancelled = true;
			return;
		}
		slot.cancelCluePress();
		pointerType = ev.pointerType;
		dismissed = false;
		if (puzzle.proof)
			return;
		if (pointerType != "touch" && (ev.button == 2 || ev.ctrlKey)) {
			ev.preventDefault();
			dismiss(ev);
			dismissed = true;
			return;
		}
		if (ev.button !== undefined && ev.button != 0)
			return;
		ev.preventDefault();
		press = {
			id: ev.pointerId,
			x: ev.clientX,
			y: ev.clientY,
			touch: pointerType == "touch",
			chalk: puzzle.tileActionForPointer(ev, true) == "pencil-remove",
			cancelled: false,
		};
		if (press.touch) {
			/* Let the start of a swipe suppress highlighting without timing a hold. */
			highlightTimer = setTimeout(function() {
				highlightTimer = null;
				if (press && !press.axis && !press.cancelled && !puzzle.proof)
					highlightRelatedClues(puzzle, clue);
			}, clueTouchHighlightDelay);
		} else {
			highlightRelatedClues(puzzle, clue);
		}
		if (slot.setPointerCapture)
			slot.setPointerCapture(ev.pointerId);
	};
	slot.onpointermove = function(ev) {
		if (!press || press.id != ev.pointerId || !press.touch || press.cancelled)
			return;
		var dx = ev.clientX - press.x;
		var dy = ev.clientY - press.y;
		if (!press.axis) {
			if (Math.max(Math.abs(dx), Math.abs(dy)) < 6)
				return;
			press.axis = Math.abs(dx) >= Math.abs(dy) ? "X" : "Y";
			clearHighlightDelay();
			clearClueHighlights(puzzle);
			startCover(press);
		}
		var distance = press.axis == "X" ? dx : dy;
		press.direction = distance < 0 ? -1 : 1;
		press.offset = Math.max(-press.size, Math.min(press.size, distance));
		swipeCover.style.transform = coverPosition(press, press.offset);
	};
	slot.onlostpointercapture = function() {
		if (press)
			slot.onpointercancel();
	};
	slot.onpointerup = function(ev) {
		if (!press || press.id != ev.pointerId)
			return;
		slot.onpointermove(ev);
		clearHighlightDelay();
		clearClueHighlights(puzzle);
		var swipe = press;
		press = null;
		var distance = swipe.axis == "X" ? ev.clientX - swipe.x : ev.clientY - swipe.y;
		var committed = swipe.touch && !swipe.cancelled && swipe.axis &&
			Math.abs(distance) >= 30;
		if (committed)
			dismiss(ev, swipe.chalk);
		finishSwipe(swipe, committed);
	};
	slot.onpointercancel = function() {
		clearHighlightDelay();
		finishSwipe(press, false);
		press = null;
		clearClueHighlights(puzzle);
	};
}

function OrderClue(puzzle) {
	this.lRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.rRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.lCol = randInt(0, this.lRow.slots.length - 1);
	this.rCol = randInt(this.lCol + 1, this.rRow.slots.length);
	this.displayType = "horizontal";

	this.constrain = function(domains, fullDomain) {
		var left = clueVariable(domains, this.lRow,
					this.lRow.slots[this.lCol]);
		var right = clueVariable(domains, this.rRow,
					 this.rRow.slots[this.rCol]);
		var leftDomain = left.domains[left.symbol];
		var rightDomain = right.domains[right.symbol];
		var leftAllowed = 0;
		var rightAllowed = 0;
		for (var l = 0; l < this.lRow.slots.length; l++) {
			for (var r = l + 1; r < this.rRow.slots.length; r++) {
				if (leftDomain & (1 << l) && rightDomain & (1 << r)) {
					leftAllowed |= 1 << l;
					rightAllowed |= 1 << r;
				}
			}
		}
		return restrictVariable(left, leftAllowed) |
			restrictVariable(right, rightAllowed);
	}

	this.render = function() {
		renderClue(puzzle, this, this.display, "span", [
			    { slot: this.lRow.slots[this.lCol] },
			    { className: "dots", html: "..." },
			    { slot: this.rRow.slots[this.rCol] }
		], true);
	}
}
OrderClue.weight = 5;

function Adjacent2Clue(puzzle) {
	this.lRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.rRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.lCol = randInt(0, this.lRow.slots.length - 1);
	this.rCol = this.lCol + 1;
	this.displayType = "horizontal";

	if (puzzleRandom() < 0.5) {
		var tmp = this.lCol;
		this.lCol = this.rCol;
		this.rCol = tmp;
	}

	this.constrain = function(domains, fullDomain) {
		var left = clueVariable(domains, this.lRow,
					this.lRow.slots[this.lCol]);
		var right = clueVariable(domains, this.rRow,
					 this.rRow.slots[this.rCol]);
		var leftDomain = left.domains[left.symbol];
		var rightDomain = right.domains[right.symbol];
		var leftAllowed = (rightDomain << 1) | (rightDomain >> 1);
		var rightAllowed = (leftDomain << 1) | (leftDomain >> 1);
		return restrictVariable(left, leftAllowed & fullDomain) |
			restrictVariable(right, rightAllowed & fullDomain);
	}

	this.render = function() {
		renderClue(puzzle, this, this.display, "span", [
			    { slot: this.lRow.slots[this.lCol] },
			    { className: "arrow", html: clueArrow },
			    { slot: this.rRow.slots[this.rCol] }
		], true);
	}
}
Adjacent2Clue.weight = 5;

function Adjacent3Clue(puzzle) {
	this.mRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.lRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.rRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.mCol = randInt(1, this.mRow.slots.length - 1);
	this.lCol = this.mCol - 1;
	this.rCol = this.mCol + 1;
	this.displayType = "horizontal";

	if (puzzleRandom() < 0.5) {
		var tmp = this.lCol;
		this.lCol = this.rCol;
		this.rCol = tmp;
	}

	this.constrain = function(domains, fullDomain) {
		var left = clueVariable(domains, this.lRow,
					this.lRow.slots[this.lCol]);
		var middle = clueVariable(domains, this.mRow,
					  this.mRow.slots[this.mCol]);
		var right = clueVariable(domains, this.rRow,
					 this.rRow.slots[this.rCol]);
		var leftDomain = left.domains[left.symbol];
		var middleDomain = middle.domains[middle.symbol];
		var rightDomain = right.domains[right.symbol];
		var leftAllowed = 0;
		var middleAllowed = 0;
		var rightAllowed = 0;
		for (var m = 1; m < this.mRow.slots.length - 1; m++) {
			for (var direction = -1; direction <= 1; direction += 2) {
				var l = m + direction;
				var r = m - direction;
				if (leftDomain & (1 << l) &&
				    middleDomain & (1 << m) &&
				    rightDomain & (1 << r)) {
					leftAllowed |= 1 << l;
					middleAllowed |= 1 << m;
					rightAllowed |= 1 << r;
				}
			}
		}
		var changed = restrictVariable(left, leftAllowed);
		changed |= restrictVariable(middle, middleAllowed);
		changed |= restrictVariable(right, rightAllowed);
		return changed;
	}

	this.render = function() {
		renderClue(puzzle, this, this.display, "span", [
			    { slot: this.lRow.slots[this.lCol] },
			    { slot: this.mRow.slots[this.mCol] },
			    { slot: this.rRow.slots[this.rCol] }
		], true);
	}
}
Adjacent3Clue.weight = 5;

function ColumnClue(puzzle) {
	this.tRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.col = randInt(0, this.tRow.slots.length);
	this.bRow = this.tRow;
	while (this.bRow == this.tRow)
		this.bRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.displayType = "vertical";

	this.constrain = function(domains, fullDomain) {
		var top = clueVariable(domains, this.tRow,
				       this.tRow.slots[this.col]);
		var bottom = clueVariable(domains, this.bRow,
					  this.bRow.slots[this.col]);
		var common = top.domains[top.symbol] &
			bottom.domains[bottom.symbol];
		return restrictVariable(top, common) |
			restrictVariable(bottom, common);
	}

	this.render = function() {
		renderClue(puzzle, this, this.display, "div", [
			    { slot: this.tRow.slots[this.col] },
			    { slot: this.bRow.slots[this.col] }
		]);
	}
}
ColumnClue.weight = 5;

function ExactClue(puzzle) {
	this.row = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.slot = this.row.slots[randInt(0, this.row.slots.length)];

	this.constrain = function(domains, fullDomain) {
		var variable = clueVariable(domains, this.row, this.slot);
		var pos = this.row.slots.indexOf(this.slot);
		return restrictVariable(variable, 1 << pos);
	}

	this.applyInitialState = function() {
		this.slot.choose(this.slot.value);
	}
}
ExactClue.weight = 1;
