var defaultSymbols = [
	["1", "2", "3", "4", "5", "6"],
	["A", "B", "C", "D", "E", "F"],
	["I", "II", "III", "IV", "V", "VI"],
	["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"],
	["△", "▽", "□", "◇", "⬠", "○"],
	["+", "‒", "÷", "x", "=", "√"],
];

var clueArrow = '<span aria-hidden="true">↔</span>';

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
	"You have mistaken falsehood for truth. The wisdom of the ancients eludes you...",
	"You have crowned a false answer as truth. The ancients turn away...",
	"You have embraced an illusion as truth. The oracle falls silent...",
	"Your judgment has fixed upon the false. The ancients are unconvinced...",
	"You have chosen the path of error. Wisdom recedes from your grasp...",
	"You have drawn certainty from deceiving signs. The lesson is lost...",
	"Your conclusion does not follow. The philosophers dismiss your proof...",
];

var falseEliminationMessages = [
	"You have cast aside a truth not yet understood. The wisdom of the ancients eludes you...",
	"You have banished a truth from consideration. The ancients turn away...",
	"You have rejected a truth before its hour. The oracle falls silent...",
	"Your judgment has condemned the possible. The ancients are unconvinced...",
	"You have closed a path that led to truth. Wisdom recedes from your grasp...",
	"You have severed a thread that belonged in the pattern. The Fates turn away...",
	"You have excluded what reason still permits. The philosophers dismiss your proof...",
];

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
	ev.preventDefault();
});

function Puzzle(board, hClues, vClues, messages, timer, symbols,
		options, optionsButton, help, helpButton, scores, scoresButton,
		about, logoButton) {
	symbols = symbols || defaultSymbols;

	this.messages = messages;
	this.timer = timer;
	this.hClues = hClues;
	this.vClues = vClues;
	this.options = options;
	this.optionsButton = optionsButton;
	this.help = help;
	this.helpButton = helpButton;
	this.scores = scores;
	this.scoresButton = scoresButton;
	this.about = about;
	this.logoButton = logoButton;
	this.slotTray = document.querySelector("#slot-tray");
	this.slotTrayOptions = document.querySelector("#slot-tray-options");
	this.slotTrayOptions.replaceChildren();
	this.slotTrayTiles = [];
	for (var i = 0; i < symbols[0].length; i++) {
		var tile = document.createElement("button");
		tile.type = "button";
		tile.addEventListener("click", function(puzzle, value) {
			return function() {
				puzzle.applySlotTrayAction(value);
			};
		}(this, i));
		this.slotTrayTiles.push(tile);
		this.slotTrayOptions.appendChild(tile);
	}
	this.boardActions = document.querySelector("#board-actions");
	this.mobileOrientation = document.querySelector("#mobile-orientation");
	this.expandedSlot = null;
	this.coarsePointer = typeof matchMedia != "undefined" &&
		matchMedia("(pointer: coarse)").matches;
	this.macOS = typeof navigator != "undefined" &&
		/^Mac/.test(navigator.platform);
	this.expandTileChoices = this.coarsePointer &&
		typeof innerWidth != "undefined" &&
		Math.min(innerWidth * 0.0208, innerHeight * 0.0345) < 20;
	this.dragTileChoices = false;
	this.showActionSelector = this.coarsePointer;
	this.slotTrayDrag = null;
	this.ignoreSlotClick = false;
	this.timerTimeout = null;
	this.timerStarted = null;
	this.timerElapsed = 0;
	this.messageTimeout = null;
	this.soundSamples = {
		place: new Audio("sound/place.opus"),
		discard: new Audio("sound/discard.opus"),
		clue: new Audio("sound/clue.opus"),
		mistake: new Audio("sound/mistake.opus"),
	};
	this.soundVolumes = {
		place: 1,
		discard: 0.55,
		clue: 1,
		mistake: 1,
	};
	this.soundVariations = {
		place: 0.045,
		discard: 0.1,
		clue: 0.055,
		mistake: 0,
	};
	/* Normalized offsets, scaled by each sound's variation above. */
	this.soundSequence = [0, 0.833, -0.5, 0.333, -1, -0.167, 0.667,
		-0.667, 0.167, 1, -0.333, 0.5, -0.833];
	this.soundSequencePositions = {};
	for (var name in this.soundSamples) {
		this.soundSamples[name].preload = "auto";
		this.soundSamples[name].preservesPitch = false;
	}
	this.gameOver = true;
	this.paused = false;
	this.resumeAfterModal = false;
	this.nextMilestone = 0;
	this.helpPage = 0;
	this.helpPages = [
		this.help.querySelector(".help-page-rules"),
		this.help.querySelector(".help-page-clues"),
		this.help.querySelector(".help-page-controls"),
	];
	this.showMilestones = true;
	this.pencilMarks = [];
	this.proof = null;
	this.pendingProof = null;
	this.explainButton = document.querySelector("#explain-button");
	this.explainButton.disabled = true;
	this.proofControls = document.querySelector("#proof-controls");
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

	this.clear = function() {
		this.gameOver = true;
		this.proof = null;
		this.pendingProof = null;
		this.explainButton.disabled = true;
		this.explainButton.classList.remove("active");
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

	this.newGame = function() {
		var seed = arguments.length ? parseSeed(arguments[0]) : randomSeed();
		if (seed === null)
			return false;
		this.seed = seed;
		this.options.querySelector("#game-seed").value = formatSeed(seed);
		this.gameOver = true;
		this.proof = null;
		this.pendingProof = null;
		this.explainButton.disabled = true;
		this.explainButton.classList.remove("active");
		this.explainButton.setAttribute("aria-pressed", "false");
		this.proofControls.hidden = true;
		document.body.classList.remove("proof-active");
		/* A seed may be started from the paused Options modal. */
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
		withPuzzleRandom(seed, function() {
			for (var i = 0; i < puzzle.rows.length; i++)
				puzzle.rows[i].newGame();
			puzzle.gameOver = false;
			puzzle.generateClues();
		});
		this.startTimer();
		this.say(randomChoice(startMessages));
		this.updateActionControls();
		return true;
	}

	this.playSeed = function() {
		var input = this.options.querySelector("#game-seed");
		if (!this.newGame(input.value)) {
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
		this.updateActionControls();
		this.playSound("win");
		this.stopTimer();
		this.recordOutcome("won");
		var highScore = this.recordHighScore(this.timerElapsed);
		this.timer.classList.add("won");
		this.messages.classList.add("won");
		this.say(randomChoice(winMessages));
		if (highScore) {
			this.highlightedScore = highScore;
			this.toggleScores();
		}
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
		this.gameOver = true;
		this.updateActionControls();
		this.playSound("mistake");
		this.stopTimer();
		this.recordOutcome("lost");
		this.timer.classList.add("lost");
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
		this.revealSolution();
		if (failedSlot) {
			this.pendingProof = {
				failedSlot: failedSlot,
				failedValue: failedValue,
			};
			this.explainButton.disabled = false;
		}
		if (failedSlot)
			failedSlot.possibilityElems[failedValue].classList.add(
				"failed-action");
		this.say(msg);
	}

	this.renderProofDomains = function(domains, placements, change) {
		for (var row = 0; row < this.rows.length; row++) {
			for (var col = 0; col < this.rows[row].slots.length; col++) {
				var slot = this.rows[row].slots[col];
				if (slot.single)
					continue;
				slot.displayProof(domains[row], col, placements[row],
					change && change.row == row ? change : null);
			}
		}
	}

	this.startProof = function(failedSlot, failedValue) {
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
		};
		this.proofControls.hidden = false;
		document.body.classList.add("proof-active");
		this.explainButton.disabled = false;
		this.explainButton.classList.add("active");
		this.explainButton.setAttribute("aria-pressed", "true");
		this.showProofPosition();
	}

	this.explainLoss = function() {
		if (this.proof) {
			this.closeProof();
			return;
		}
		if (!this.pendingProof)
			return;
		var request = this.pendingProof;
		this.pendingProof = null;
		this.startProof(request.failedSlot, request.failedValue);
	}

	this.closeProof = function() {
		if (!this.proof)
			return;
		var proof = this.proof;
		for (var i = 0; i < this.clues.length; i++)
			if (this.clues[i].display)
				this.clues[i].display.classList.remove("proof-current");
		this.pendingProof = {
			failedSlot: proof.failedSlot,
			failedValue: proof.failedValue,
		};
		this.proof = null;
		this.proofControls.hidden = true;
		document.body.classList.remove("proof-active");
		this.explainButton.classList.remove("active");
		this.explainButton.setAttribute("aria-pressed", "false");
		this.revealSolution();
		proof.failedSlot.possibilityElems[proof.failedValue].classList.add(
			"failed-action");
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
			deductionElem.textContent =
				"The board as it stood before the mistake.";
		} else {
			var step = this.proof.steps[position - 1];
			this.renderProofDomains(step.domains, step.placements, step);
			if (step.conclusion) {
				positionElem.textContent = "Conclusion";
			} else {
				positionElem.textContent = "Step " + position + " of " +
					this.proof.steps.length;
			}
			renderProofMessage(this, deductionElem, step.message,
				step.conclusion);
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

	this.clearPencilMarks = function() {
		this.pencilMarks = [];
		for (var i = 0; i < this.rows.length; i++)
			this.rows[i].clearPencilDisplay();
	}

	this.openSlotTray = function(slot) {
		if (this.gameOver || this.paused || slot.single)
			return;
		this.closeSlotTray();
		this.expandedSlot = slot;
		this.animateSlotTray = true;
		slot.elem.classList.add("expanded");
		this.slotTray.hidden = false;
		this.renderSlotTray();
	}

	this.closeSlotTray = function() {
		if (this.expandedSlot)
			this.expandedSlot.elem.classList.remove("expanded");
		this.expandedSlot = null;
		this.slotTray.hidden = true;
		this.slotTray.querySelector(".slot-tray-panel").classList.remove(
			"opening");
	}

	this.positionSlotTray = function() {
		var animate = this.animateSlotTray;
		this.animateSlotTray = false;
		if (!this.expandedSlot || typeof innerWidth == "undefined")
			return;
		var target = this.expandedSlot.elem;
		var panel = this.slotTray.querySelector(".slot-tray-panel");
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
		panel.style.position = "fixed";
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

	this.applyTileAction = function(slot, value, action) {
		if (action == "place")
			slot.choose(value, true);
		else if (action == "remove")
			slot.discard(value, true);
		else
			slot.pencil(value, action == "pencil-remove");
	}

	this.applySlotTrayAction = function(value) {
		var slot = this.expandedSlot;
		if (!slot)
			return;
		var action = this.getTileAction();
		this.closeSlotTray();
		this.applyTileAction(slot, value, action);
	}

	this.beginSlotTrayDrag = function(slot, ev) {
		if (!this.expandTileChoices || !this.dragTileChoices ||
		    (ev.button !== undefined && ev.button != 0))
			return;
		ev.preventDefault();
		this.openSlotTray(slot);
		if (this.expandedSlot != slot)
			return;
		this.ignoreSlotClick = true;
		this.slotTrayDrag = {
			pointerId: ev.pointerId,
			startX: ev.clientX,
			startY: ev.clientY,
			target: null,
		};
		if (ev.currentTarget.setPointerCapture)
			ev.currentTarget.setPointerCapture(ev.pointerId);
	}

	this.updateSlotTrayDrag = function(ev) {
		var drag = this.slotTrayDrag;
		if (!drag || drag.pointerId != ev.pointerId)
			return;
		ev.preventDefault();
		var dx = ev.clientX - drag.startX;
		var dy = ev.clientY - drag.startY;
		var target = null;
		if (dx * dx + dy * dy >= 64 && document.elementFromPoint) {
			var elem = document.elementFromPoint(ev.clientX, ev.clientY);
			for (var i = 0; i < this.slotTrayOptions.children.length; i++) {
				var tile = this.slotTrayOptions.children[i];
				if (elem == tile && !tile.disabled) {
					target = tile;
					break;
				}
			}
		}
		if (drag.target == target)
			return;
		if (drag.target)
			drag.target.classList.remove("drag-target");
		drag.target = target;
		if (target)
			target.classList.add("drag-target");
	}

	this.endSlotTrayDrag = function(ev, cancel) {
		var drag = this.slotTrayDrag;
		if (!drag || drag.pointerId != ev.pointerId)
			return;
		if (!cancel)
			this.updateSlotTrayDrag(ev);
		var target = drag.target;
		if (target)
			target.classList.remove("drag-target");
		this.slotTrayDrag = null;
		if (cancel) {
			this.closeSlotTray();
			return;
		}
		if (!target)
			return;
		for (var i = 0; i < this.slotTrayOptions.children.length; i++)
			if (this.slotTrayOptions.children[i] == target) {
				this.applySlotTrayAction(i);
				break;
			}
	}

	this.getTileAction = function() {
		var operation = this.boardActions.querySelector(
			"input[name=tile-operation]:checked").value;
		var mark = this.boardActions.querySelector(
			"input[name=tile-mark]:checked").value;
		if (mark == "inscribe")
			return operation;
		return operation == "place" ? "pencil-select" : "pencil-remove";
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
	}

	this.renderSlotTray = function() {
		var slot = this.expandedSlot;
		if (!slot)
			return;
		this.slotTray.querySelector(".slot-tray-panel").classList.remove(
			"pencil-conflict");
		if (slot.row.elem.classList.contains("pencil-conflict"))
			this.slotTray.querySelector(".slot-tray-panel").classList.add(
				"pencil-conflict");

		for (var value = 0; value < this.slotTrayTiles.length; value++) {
			var tile = this.slotTrayTiles[value];
			tile.className = "slot-tray-symbol " + slot.row.familyClass;
			if (!slot.possible[value]) {
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
			tile.textContent = slot.symbols[value];
			tile.setAttribute("aria-label", slot.symbols[value]);
		}
		this.positionSlotTray();
	}

	this.togglePencilMark = function(slot, value, discard) {
		if (this.gameOver || this.paused || slot.single ||
		    !slot.possible[value])
			return;
		var found = false;
		for (var i = this.pencilMarks.length - 1; i >= 0; i--) {
			var mark = this.pencilMarks[i];
			if (mark.slot != slot || mark.value != value)
				continue;
			if (mark.discard == discard)
				found = true;
			this.pencilMarks.splice(i, 1);
		}
		if (!found)
			this.pencilMarks.push({
				slot: slot,
				value: value,
				discard: discard,
			});
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
			checkClueDisplay(clue);
		}
	}

	this.renderPencilMarks = function(row) {
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
				puzzle.messages.classList.add("fading");
				puzzle.messageTimeout = setTimeout(function() {
					puzzle.messages.innerHTML = "";
					puzzle.messages.classList.remove("fading");
					puzzle.messageTimeout = null;
				}, 1000);
			}, 9000);
		}
	}

	this.updateTimer = function(elapsed) {
		this.timer.textContent = formatTime(elapsed);
	}

	this.recordHighScore = function(elapsed) {
		var score = { elapsed: elapsed, date: Date.now() };
		if (this.seed !== undefined)
			score.seed = this.seed;
		this.highScores.push(score);
		this.highScores.sort(function(a, b) {
			return a.elapsed - b.elapsed;
		});
		this.highScores = this.highScores.slice(0, 10);
		try {
			localStorage.setItem("highScores",
				JSON.stringify(this.highScores));
		} catch (e) {
			/* The scores still apply for the current page. */
		}
		return this.highScores.indexOf(score) >= 0 ? score : null;
	}

	this.recordOutcome = function(outcome) {
		this.gameStats[outcome]++;
		try {
			localStorage.setItem("gameStats",
				JSON.stringify(this.gameStats));
		} catch (e) {
			/* The totals still apply for the current page. */
		}
	}

	this.renderHighScores = function() {
		var list = this.scores.querySelector("ol");
		var empty = this.scores.querySelector(".scores-empty");
		var gamesSought = this.gameStats.won + this.gameStats.lost;
		this.scores.querySelector(".games-sought").textContent = gamesSought;
		this.scores.querySelector(".games-sought-unit").textContent =
			gamesSought == 1 ? "time" : "times";
		this.scores.querySelector(".games-won").textContent =
			this.gameStats.won;
		list.innerHTML = "";
		empty.hidden = this.highScores.length != 0;
		for (var i = 0; i < this.highScores.length; i++) {
			var item = document.createElement("li");
			if (this.highScores[i] == this.highlightedScore) {
				item.className = "score-new";
				item.setAttribute("aria-current", "true");
			}
			var hasSeed = this.highScores[i].seed !== undefined;
			var entry = document.createElement(hasSeed ? "button" : "span");
			entry.className = "score-entry";
			if (hasSeed) {
				entry.type = "button";
				entry.setAttribute("aria-expanded", "false");
			}
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
			if (hasSeed) {
				var seed = document.createElement("span");
				seed.className = "score-seed";
				seed.textContent = "Puzzle seed: " +
					formatSeed(this.highScores[i].seed);
				seed.hidden = true;
				entry.addEventListener("click", function(seed) {
					return function() {
						seed.hidden = !seed.hidden;
						this.setAttribute("aria-expanded",
							String(!seed.hidden));
					};
				}(seed));
				item.appendChild(seed);
			}
			list.appendChild(item);
		}
	}

	this.clearOutcome = function() {
		this.timer.classList.remove("won", "lost");
		this.messages.classList.remove("won", "lost");
	}

	this.startTimer = function() {
		this.timerStarted = Date.now() - this.timerElapsed;
		this.scheduleTimerUpdate();
	}

	this.scheduleTimerUpdate = function() {
		var puzzle = this;
		var elapsed = Date.now() - this.timerStarted;
		var delay = 1000 - elapsed % 1000;
		this.timerTimeout = setTimeout(function() {
			puzzle.updateTimer(Date.now() - puzzle.timerStarted);
			puzzle.scheduleTimerUpdate();
		}, delay);
	}

	this.stopTimer = function() {
		if (this.timerTimeout === null)
			return;
		this.timerElapsed = Date.now() - this.timerStarted;
		this.updateTimer(this.timerElapsed);
		clearTimeout(this.timerTimeout);
		this.timerTimeout = null;
		this.timerStarted = null;
	}

	this.generateClues = function() {
		this.hClues.classList.remove("solution");
		this.vClues.classList.remove("solution");
		this.clues = [];
		var types = [ExactClue, OrderClue, Adjacent2Clue,
			     Adjacent3Clue, ColumnClue];
		do {
			while (!this.sufficientClues()) {
				var type = weightedChoice(types);
				var clue = new type(this);
				this.clues.push(clue);
				if (clue.displayType)
					clue.active = true;
			}

			for (var i = this.clues.length - 1; i >= 0; i--) {
				var without = this.clues.slice();
				without.splice(i, 1);
				if (cluesSolve(this, without))
					this.clues = without;
			}

			this.clues = limitDisplayedClues(this.clues,
				"horizontal", this.hClueSlots.length);
			this.clues = limitDisplayedClues(this.clues,
				"vertical", this.vClueSlots.length);
		} while (!this.sufficientClues());

		for (var i = 0; i < this.hClueSlots.length; i++) {
			this.hClueSlots[i].innerHTML = "";
			this.hClueSlots[i].className = "clue";
			this.hClueSlots[i].onclick = null;
			this.hClueSlots[i].oncontextmenu = null;
		}
		for (var i = 0; i < this.vClueSlots.length; i++) {
			this.vClueSlots[i].innerHTML = "";
			this.vClueSlots[i].className = "clue";
			this.vClueSlots[i].onclick = null;
			this.vClueSlots[i].oncontextmenu = null;
		}

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

	this.sufficientClues = function() {
		return cluesSolve(this, this.clues);
	}

	this.getHClueSlot = function() { return this.hClueSlots[this.numHClues++]; }
	this.getVClueSlot = function() { return this.vClueSlots[this.numVClues++]; }

	this.toggleModal = function(modal, button, closeText) {
		if (modal.hidden) {
			this.resumeAfterModal = !this.gameOver &&
				this.timerTimeout !== null;
			var done = modal.querySelector(".modal-done");
			if (done)
				done.value = this.resumeAfterModal ?
					"Resume game" : closeText;
			this.paused = true;
			if (this.resumeAfterModal)
				this.stopTimer();
			modal.hidden = false;
		} else {
			modal.hidden = true;
			this.paused = false;
			if (this.resumeAfterModal && !this.gameOver)
				this.startTimer();
			this.resumeAfterModal = false;
		}
		button.setAttribute("aria-expanded", !modal.hidden);
	}

	this.toggleOptions = function() {
		if (this.options.hidden && this.seed !== undefined)
			this.options.querySelector("#game-seed").value =
				formatSeed(this.seed);
		this.toggleModal(this.options, this.optionsButton, "Close");
	}

	this.toggleHelp = function() {
		if (this.help.hidden)
			this.showHelpPage(0);
		this.toggleModal(this.help, this.helpButton);
	}

	this.showHelpPage = function(page) {
		this.helpPage = Math.max(0,
			Math.min(this.helpPages.length - 1, page));
		for (var i = 0; i < this.helpPages.length; i++)
			this.helpPages[i].hidden = this.helpPage != i;
	}

	this.turnHelpPage = function(direction) {
		this.showHelpPage(this.helpPage + direction);
		var selector = direction > 0 ?
			".help-page-previous" : ".help-page-next";
		this.helpPages[this.helpPage].querySelector(selector).focus();
	}

	this.toggleScores = function() {
		this.renderHighScores();
		this.toggleModal(this.scores, this.scoresButton,
			"Rejoin the mortal realm");
		if (this.scores.hidden)
			this.highlightedScore = null;
	}

	this.toggleAbout = function() {
		this.toggleModal(this.about, this.logoButton, "Close");
	}

	var puzzle = this;
	this.options.addEventListener("click", function(ev) {
		if (ev.target == puzzle.options)
			puzzle.toggleOptions();
	});
	this.help.addEventListener("click", function(ev) {
		if (ev.target == puzzle.help)
			puzzle.toggleHelp();
	});
	this.scores.addEventListener("click", function(ev) {
		if (ev.target == puzzle.scores)
			puzzle.toggleScores();
	});
	this.about.addEventListener("click", function(ev) {
		if (ev.target == puzzle.about)
			puzzle.toggleAbout();
	});
	this.slotTray.addEventListener("click", function(ev) {
		if (ev.target == puzzle.slotTray)
			puzzle.closeSlotTray();
	});
	document.addEventListener("fullscreenchange", function() {
		puzzle.updateFullscreenButton();
		puzzle.updateMobileOrientation();
	});
	document.addEventListener("keydown", function(ev) {
		if (!puzzle.proof || puzzle.paused || ev.altKey || ev.ctrlKey ||
		    ev.metaKey || ev.shiftKey)
			return;
		var direction;
		if (ev.key == "ArrowLeft")
			direction = -1;
		else if (ev.key == "ArrowRight")
			direction = 1;
		else
			return;
		ev.preventDefault();
		puzzle.moveProof(direction);
	});
	if (typeof window != "undefined")
		window.addEventListener("resize", function() {
			puzzle.updateMobileOrientation();
			puzzle.positionSlotTray();
		});

	this.setCursor = function(style) {
		if (["gear", "stylus", "native"].indexOf(style) < 0)
			style = "stylus";
		document.body.dataset.cursor = style;
		var input = this.options.querySelector(
				'input[value="' + style + '"]');
		input.checked = true;
		try {
			localStorage.setItem("cursor", style);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.setMilestones = function(show) {
		this.showMilestones = show;
		this.options.querySelector("#show-milestones").checked = show;
		try {
			localStorage.setItem("showMilestones", show);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.setAutoDismissClues = function(enabled) {
		this.autoDismissClues = enabled;
		this.options.querySelector("#auto-dismiss-clues").checked = enabled;
		if (enabled)
			this.dismissExhaustedClues();
		try {
			localStorage.setItem("autoDismissClues", enabled);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.setTimerVisible = function(show) {
		this.timer.hidden = !show;
		this.options.querySelector("#show-timer").checked = show;
		try {
			localStorage.setItem("showTimer", show);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.setSoundEffects = function(enabled) {
		this.soundEffects = enabled;
		this.options.querySelector("#sound-effects").checked = enabled;
		try {
			localStorage.setItem("soundEffects", enabled);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.setPlacementAnimation = function(style) {
		if (["settle", "grow", "flip", "skid"].indexOf(style) < 0)
			style = "settle";
		this.placementAnimation = style;
		document.body.dataset.placementAnimation = style;
		this.options.querySelector("#placement-" + style).checked = true;
		try {
			localStorage.setItem("placementAnimation", style);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.setStoneEffects = function(enabled) {
		document.body.dataset.stoneEffects = String(enabled);
		this.options.querySelector("#stone-effects").checked = enabled;
		try {
			localStorage.setItem("stoneEffects", enabled);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.setExpandTileChoices = function(enabled) {
		this.expandTileChoices = enabled;
		this.options.querySelector("#expand-tile-choices").checked = enabled;
		this.options.querySelector("#drag-tile-choices").disabled = !enabled;
		if (!enabled)
			this.closeSlotTray();
		try {
			localStorage.setItem("expandTileChoices", enabled);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.setDragTileChoices = function(enabled) {
		this.dragTileChoices = enabled;
		this.ignoreSlotClick = false;
		this.options.querySelector("#drag-tile-choices").checked = enabled;
		try {
			localStorage.setItem("dragTileChoices", enabled);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.setShowActionSelector = function(enabled) {
		this.showActionSelector = enabled;
		this.options.querySelector("#show-action-selector").checked = enabled;
		this.updateActionControls();
		try {
			localStorage.setItem("showActionSelector", enabled);
		} catch (e) {
			/* The choice still applies for the current page. */
		}
	}

	this.updateActionControls = function() {
		var show = this.showActionSelector && !this.gameOver;
		this.boardActions.hidden = !show;
		this.logoButton.hidden = show;
	}

	this.updateFullscreenButton = function() {
		var button = this.options.querySelector("#fullscreen-button");
		button.hidden = !document.fullscreenEnabled;
		button.value = document.fullscreenElement ?
			"Exit full screen" : "Enter full screen";
	}

	this.updateMobileOrientation = function() {
		var portrait = typeof innerWidth != "undefined" &&
			innerWidth < innerHeight && innerWidth <= 600;
		this.mobileOrientation.hidden = !portrait;
		if (!portrait)
			return;

		var canFullscreen = document.fullscreenEnabled &&
			document.documentElement.requestFullscreen;
		var fullscreen = !!document.fullscreenElement;
		var instruction = this.mobileOrientation.querySelector(
			".mobile-orientation-instruction");
		var button = this.mobileOrientation.querySelector("button");
		button.hidden = fullscreen || !canFullscreen;
		instruction.textContent = button.hidden ?
			"Rotate your device to continue." :
			"Enter full screen and turn your device to continue.";
	}

	this.enterMobileFullscreen = function() {
		var puzzle = this;
		var action;
		try {
			action = document.documentElement.requestFullscreen({
				navigationUI: "hide",
			});
		} catch (e) {
			this.updateMobileOrientation();
			return;
		}
		Promise.resolve(action).then(function() {
			if (typeof screen != "undefined" && screen.orientation &&
			    screen.orientation.lock)
				return screen.orientation.lock("landscape");
		}).catch(function() {
			/* The player can still rotate the device manually. */
		}).then(function() {
			puzzle.updateMobileOrientation();
		});
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

	this.playSampleSound = function(name) {
		var audio = this.soundSamples[name];
		if (!audio)
			return;
		for (var other in this.soundSamples) {
			this.soundSamples[other].pause();
			this.soundSamples[other].currentTime = 0;
		}
		audio.volume = this.soundVolumes[name];
		var variation = this.soundVariations[name];
		var position = this.soundSequencePositions[name] || 0;
		audio.playbackRate = 1 + variation * this.soundSequence[position];
		this.soundSequencePositions[name] =
			(position + 1) % this.soundSequence.length;
		var playback = audio.play();
		if (playback)
			playback.catch(function() {});
	}

	this.playSound = function(type) {
		if (!this.soundEffects)
			return;
		if (this.soundSamples[type]) {
			this.playSampleSound(type);
			return;
		}
		var AudioContext = window.AudioContext || window.webkitAudioContext;
		if (!AudioContext)
			return;
		if (!this.audioContext) {
			this.audioContext = new AudioContext();
		}
		var context = this.audioContext;
		if (context.state == "suspended")
			context.resume();
		var variation = 0.94 + Math.random() * 0.12;
		if (type == "win") {
			var notes = [587.33, 783.99, 659.25, 880,
				     783.99, 1046.5, 880, 1174.66,
				     1046.5, 1318.51, 1174.66, 1567.98];
			var delays = [0, 0.09, 0.17, 0.26, 0.34, 0.43,
				      0.52, 0.62, 0.73, 0.85, 0.98, 1.12];
			for (var i = 0; i < notes.length; i++)
				playChime(context, notes[i] * variation, delays[i],
					i == notes.length - 1 ? 0.035 : 0.025);
		}
	}

	var cursor = "stylus";
	var showMilestones = true;
	var autoDismissClues = true;
	var showTimer = true;
	var soundEffects = true;
	var placementAnimation = "settle";
	var stoneEffects = true;
	var expandTileChoices = this.expandTileChoices;
	var dragTileChoices = this.dragTileChoices;
	var showActionSelector = this.showActionSelector;
	try {
		cursor = localStorage.getItem("cursor") || cursor;
		var storedMilestones = localStorage.getItem("showMilestones");
		var storedAutoDismissClues = localStorage.getItem(
			"autoDismissClues");
		var storedTimer = localStorage.getItem("showTimer");
		var storedSoundEffects = localStorage.getItem("soundEffects");
		var storedPlacementAnimation = localStorage.getItem(
			"placementAnimation");
		var storedStoneEffects = localStorage.getItem("stoneEffects");
		var storedExpandTileChoices = localStorage.getItem(
			"expandTileChoices");
		var storedDragTileChoices = localStorage.getItem(
			"dragTileChoices");
		var storedShowActionSelector = localStorage.getItem(
			"showActionSelector");
		var oldSelectionActionMenu = localStorage.getItem(
			"selectionActionMenu");
		if (storedMilestones !== null)
			showMilestones = storedMilestones == "true";
		if (storedAutoDismissClues !== null)
			autoDismissClues = storedAutoDismissClues == "true";
		if (storedTimer !== null)
			showTimer = storedTimer == "true";
		if (storedSoundEffects !== null)
			soundEffects = storedSoundEffects == "true";
		if (storedPlacementAnimation !== null)
			placementAnimation = storedPlacementAnimation;
		if (storedStoneEffects !== null)
			stoneEffects = storedStoneEffects == "true";
		if (storedExpandTileChoices !== null)
			expandTileChoices = storedExpandTileChoices == "true";
		else if (oldSelectionActionMenu !== null)
			expandTileChoices = oldSelectionActionMenu == "true";
		if (storedDragTileChoices !== null)
			dragTileChoices = storedDragTileChoices == "true";
		if (storedShowActionSelector !== null)
			showActionSelector = storedShowActionSelector == "true";
	} catch (e) {
		/* Storage may be unavailable for local files. */
	}
	this.highScores = loadHighScores();
	this.gameStats = loadGameStats();
	this.setCursor(cursor);
	this.setMilestones(showMilestones);
	this.setAutoDismissClues(autoDismissClues);
	this.setTimerVisible(showTimer);
	this.setSoundEffects(soundEffects);
	this.setPlacementAnimation(placementAnimation);
	this.setStoneEffects(stoneEffects);
	this.setExpandTileChoices(expandTileChoices);
	this.setDragTileChoices(dragTileChoices);
	this.setShowActionSelector(showActionSelector);
	this.updateFullscreenButton();
	this.updateMobileOrientation();

	this.clear();
}

function formatTime(elapsed) {
	var totalSeconds = Math.floor(elapsed / 1000);
	var minutes = Math.floor(totalSeconds / 60);
	var seconds = totalSeconds % 60;
	return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
}

function formatScoreDate(timestamp) {
	if (timestamp === null)
		return "Earlier";
	var date = new Date(timestamp);
	var month = date.toLocaleDateString(undefined, { month: "long" });
	return date.getDate() + " " + month + " " +
		date.getFullYear() + " CE";
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

function loadHighScores() {
	var scores = [];
	try {
		scores = JSON.parse(localStorage.getItem("highScores") || "[]");
	} catch (e) {
		return [];
	}
	if (!Array.isArray(scores))
		return [];
	scores = scores.map(function(score) {
		if (Number.isFinite(score) && score >= 0)
			return { elapsed: score, date: null };
		if (!score || !Number.isFinite(score.elapsed) || score.elapsed < 0)
			return null;
		if (!Number.isFinite(score.date) || score.date < 0)
			score.date = null;
		if (!Number.isInteger(score.seed) || score.seed < 0 ||
		    score.seed > 0xffffffff)
			delete score.seed;
		return score;
	}).filter(function(score) { return score !== null; });
	return scores.sort(function(a, b) {
		return a.elapsed - b.elapsed;
	}).slice(0, 10);
}

function loadGameStats() {
	var stats;
	try {
		stats = JSON.parse(localStorage.getItem("gameStats") || "{}");
	} catch (e) {
		return { won: 0, lost: 0 };
	}
	if (!stats || !Number.isSafeInteger(stats.won) || stats.won < 0 ||
	    !Number.isSafeInteger(stats.lost) || stats.lost < 0)
		return { won: 0, lost: 0 };
	return { won: stats.won, lost: stats.lost };
}

function playChime(context, frequency, delay, volume) {
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
		oscillator.connect(gain).connect(context.destination);
		oscillator.start(start);
		oscillator.stop(start + durations[i]);
	}
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

function cluesAllow(puzzle, clues, domains) {
	var numRows = puzzle.rows.length;
	var rowSize = puzzle.rows[0].slots.length;
	var fullDomain = (1 << rowSize) - 1;

	var changed;
	do {
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

function proofSymbolReference(puzzle, row, symbol) {
	return "\ue000" + row + ":" + symbol + "\ue001";
}

function proofMessageText(puzzle, message) {
	return message.replace(/\ue000(\d+):(\d+)\ue001/g,
		function(match, row, symbol) {
			return puzzle.rows[row].slots[0].symbols[symbol];
		});
}

function renderProofMessage(puzzle, elem, message, qed) {
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
		tile.textContent = puzzle.rows[row].slots[0].symbols[symbol];
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
	{ id: "adjacent2.not-adjacent",
	  message: "{subject} cannot be in {positions} because {other} is not adjacent." },
	{ id: "adjacent3.middle.outer-not-adjacent",
	  message: "{subject} cannot be in {positions} because {outer} must be adjacent." },
	{ id: "adjacent3.middle.placement",
	  message: "{subject} must be in the {position} position because that is the only place where {left} and {right} can fit on opposite sides of it." },
	{ id: "adjacent3.middle.no-neighbor",
	  message: "{subject} cannot be in the {position} position because neither {left} nor {right} can be in the {neighbor} position." },
	{ id: "adjacent3.middle.remove-edges",
	  message: "{subject} cannot be on either edge because it is between two symbols." },
	{ id: "adjacent3.outer.middle-not-adjacent",
	  message: "{subject} cannot be in {positions} because {middle} must be adjacent." },
	{ id: "adjacent3.outer.no-orientation",
	  message: "{subject} cannot be in the {position} position because {middle} and {other} cannot fit beside it in either orientation." },
	{ id: "adjacent3.outer.other-not-two-away",
	  message: "{subject} cannot be in {positions} because {other} must be two positions away." },
	{ id: "clue.placement",
	  message: "{subject} must be in the {position} position." },
	{ id: "column.other-not-position",
	  message: "{subject} cannot be in {positions} because {other} is not." },
	{ id: "conclusion.placement",
	  message: "{subject} must be in the {position} position because it is the only remaining option." },
	{ id: "conclusion.remove-position",
	  message: "{subject} cannot be in the {position} position." },
	{ id: "order.other-not-beyond",
	  message: "{subject} cannot be in {positions} because {other} must be to its {otherDirection}." },
	{ id: "row.only-candidate",
	  message: "{subject} must be in the {position} position because it is the only remaining option." },
	{ id: "row.only-position",
	  message: "{subject} must be in the {position} position because it has been eliminated everywhere else." },
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
	var row = step.row;
	var symbol = step.symbol;
	var name = proofSymbolReference(puzzle, row, symbol);
	var removed = before & ~after;
	var rowSize = puzzle.rows[row].slots.length;
	var fullDomain = (1 << rowSize) - 1;
	if (countBits(after) == 1) {
		var col = 0;
		while (!(after & (1 << col)))
			col++;
		return identifiedDeduction(step, "clue.placement", {
			subject: name,
			position: ordinalName(col),
		});
	}
	if (removed == ((1 << 0) | (1 << (rowSize - 1))))
		return identifiedDeduction(step, "clue.remove-edges", {
			subject: name,
		});
	if (countBits(removed) == 1) {
		var col = 0;
		while (!(removed & (1 << col)))
			col++;
		return identifiedDeduction(step, "clue.remove-position", {
			subject: name,
			position: ordinalName(col),
		});
	}
	if (after != fullDomain)
		return identifiedDeduction(step, "clue.narrow-positions", {
			subject: name,
		});
	return identifiedDeduction(step, "clue.fewer-positions", {
		subject: name,
	});
}

function adjacent3DeductionMessage(puzzle, step, before, after, domains) {
	var clue = step.clue;
	var row = step.row;
	var symbol = step.symbol;
	var removed = before & ~after;
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
		if (countBits(after) == 1) {
			var col = 0;
			while (!(after & (1 << col)))
				col++;
			return identifiedDeduction(step,
				"adjacent3.middle.placement", {
					subject: name,
					position: ordinalName(col),
					left: leftName,
					right: rightName,
				});
		}
		if (removed == edges)
			return identifiedDeduction(step,
				"adjacent3.middle.remove-edges", { subject: name });
		if (countBits(removed) == 1) {
			var col = 0;
			while (!(removed & (1 << col)))
				col++;
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
	if (countBits(removed) > 1) {
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
			if (domains[middleRow][middleSymbol] & adjacent)
				middleCannotFit = false;
			if (domains[otherRow][otherSymbol] & twoAway)
				otherCannotFit = false;
		}
		if (otherCannotFit)
			return identifiedDeduction(step,
				"adjacent3.outer.other-not-two-away", {
					subject: name,
					positions: positionList(removed),
					other: otherName,
				});
		if (middleCannotFit)
			return identifiedDeduction(step,
				"adjacent3.outer.middle-not-adjacent", {
					subject: name,
					positions: positionList(removed),
					middle: middleName,
				});
	}

	if (countBits(removed) == 1) {
		var col = 0;
		while (!(removed & (1 << col)))
			col++;
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
	if (countBits(after) == 1)
		return deductionMessage(puzzle, step, before, after);
	var leftRow = puzzle.rows.indexOf(clue.lRow);
	var leftSymbol = clue.lRow.slots[clue.lCol].value;
	var rightRow = puzzle.rows.indexOf(clue.rRow);
	var rightSymbol = clue.rRow.slots[clue.rCol].value;
	var otherRow = step.row == leftRow && step.symbol == leftSymbol ?
		rightRow : leftRow;
	var otherSymbol = step.row == leftRow && step.symbol == leftSymbol ?
		rightSymbol : leftSymbol;
	return identifiedDeduction(step, "adjacent2.not-adjacent", {
		subject: proofSymbolReference(puzzle, step.row, step.symbol),
		positions: positionList(removed),
		other: proofSymbolReference(puzzle, otherRow, otherSymbol),
	});
}

function orderDeductionMessage(puzzle, step, before, after) {
	var removed = before & ~after;
	if (countBits(after) == 1)
		return deductionMessage(puzzle, step, before, after);
	var leftRow = puzzle.rows.indexOf(step.clue.lRow);
	var leftSymbol = step.clue.lRow.slots[step.clue.lCol].value;
	var isLeft = step.row == leftRow && step.symbol == leftSymbol;
	var subject = proofSymbolReference(puzzle, step.row, step.symbol);
	var otherRow = isLeft ? puzzle.rows.indexOf(step.clue.rRow) : leftRow;
	var otherSymbol = isLeft ? step.clue.rRow.slots[step.clue.rCol].value :
		leftSymbol;
	return identifiedDeduction(step, "order.other-not-beyond", {
		subject: subject,
		positions: positionList(removed),
		other: proofSymbolReference(puzzle, otherRow, otherSymbol),
		otherDirection: isLeft ? "right" : "left",
	});
}

function columnDeductionMessage(puzzle, step, before, after) {
	var removed = before & ~after;
	if (countBits(after) == 1)
		return deductionMessage(puzzle, step, before, after);
	var clue = step.clue;
	var topRow = puzzle.rows.indexOf(clue.tRow);
	var topSymbol = clue.tRow.slots[clue.col].value;
	var otherRow = step.row == topRow && step.symbol == topSymbol ?
		puzzle.rows.indexOf(clue.bRow) : topRow;
	var otherSymbol = step.row == topRow && step.symbol == topSymbol ?
		clue.bRow.slots[clue.col].value : topSymbol;
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
		return "the " + positions[0] + " position";
	if (positions.length == 2)
		return "the " + positions[0] + " and " + positions[1] +
			" positions";
	return "the " + positions.slice(0, -1).join(", ") + ", and " +
		positions[positions.length - 1] + " positions";
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
	var middleCannotFit = true;
	var otherCannotFit = true;
	for (var col = 0; col < domains[step.row].length; col++) {
		if (!(removed & (1 << col)))
			continue;
		var adjacent = 0;
		var twoAway = 0;
		if (col > 0)
			adjacent |= 1 << (col - 1);
		if (col + 1 < domains[step.row].length)
			adjacent |= 1 << (col + 1);
		if (col > 1)
			twoAway |= 1 << (col - 2);
		if (col + 2 < domains[step.row].length)
			twoAway |= 1 << (col + 2);
		if (domains[middleRow][middleSymbol] & adjacent)
			middleCannotFit = false;
		if (domains[otherRow][otherSymbol] & twoAway)
			otherCannotFit = false;
	}
	return middleCannotFit || otherCannotFit;
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
			var domain = domains[row][symbol];
			if (domain && !(domain & (domain - 1)) &&
			    !(placements[row] & (1 << symbol))) {
				var col = 0;
				while (!(domain & (1 << col)))
					col++;
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

function clueProofStep(puzzle, clue, domains) {
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
		var after = domains[row][symbol] & trial[row][symbol];
		if (after == domains[row][symbol])
			continue;
		var middleRow = clue.mRow ? puzzle.rows.indexOf(clue.mRow) : -1;
		var middleSymbol = clue.mRow ?
			clue.mRow.slots[clue.mCol].value : -1;
		var edges = 1 | (1 << (domains[row].length - 1));
		var removedEdges = domains[row][symbol] & ~after & edges;
		if (row == middleRow && symbol == middleSymbol &&
		    removedEdges == edges)
			after = domains[row][symbol] & ~removedEdges;
		else
			after = proofStepDomain(domains[row][symbol], after,
				domains[row].length);
		return {
			clues: clue.display ? [clue] : [],
			clue: clue,
			rule: "clue",
			placement: countBits(after) == 1,
			row: row,
			symbol: symbol,
			removed: domains[row][symbol] & ~after,
		};
	}
	return null;
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
		if ((row != middleRow || symbol != middleSymbol) &&
		    trial[middleRow][middleSymbol] !=
		    domains[middleRow][middleSymbol])
			return false;
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
	var anchored = before & ~after & step.removed;
	if (step.clue.constructor == Adjacent3Clue && countBits(anchored) > 1) {
		var edges = 1 | (1 << (domains[step.row].length - 1));
		if (anchored != edges && !adjacent3OuterHasCommonCause(puzzle,
			    step, anchored, domains))
			anchored &= -anchored;
	}
	if (countBits(after) != 1 && anchored)
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
	refreshed.placement = countBits(after) == 1;
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

function drainForcedProofSteps(domains, placements, output) {
	var step;
	while ((step = nextForcedProofStep(domains, placements))) {
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
		if (!proofStepSupported(puzzle, steps[i], current, placements))
			return null;
		var step = refreshProofStep(puzzle, steps[i], current);
		if (!step)
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
		var bestScore = -1;
		for (var i = 0; i < remaining.length; i++) {
			var step = remaining[i];
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
				bestScore = score;
			}
		}
		if (best === null)
			return steps;
		var step = remaining.splice(best, 1)[0];
		step = refreshProofStep(puzzle, step, current);
		if (!step)
			return steps;
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
			" position.";
	return name + " cannot be in the " + ordinalName(col) +
		" position.";
}

function directFailedProofStep(puzzle, domains, failedSlot, failedValue) {
	var row = puzzle.rows.indexOf(failedSlot.row);
	var col = failedSlot.row.slots.indexOf(failedSlot);
	var bit = 1 << col;
	if (!(domains[row][failedValue] & bit))
		return null;
	var fullDomain = (1 << domains[row].length) - 1;
	for (var i = 0; i < puzzle.clues.length; i++) {
		var clue = puzzle.clues[i];
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

function buildProofSteps(puzzle, base, basePlacements,
			 failedSlot, failedValue) {
	var current = copyDomains(base);
	var placements = basePlacements.slice();
	var steps = [];
	while (true) {
		var step = nextForcedProofStep(current, placements);
		if (!step && proofConcluded(puzzle, current,
					    failedSlot, failedValue))
			break;
		if (!step)
			step = nextClueProofStep(puzzle, puzzle.clues, current);
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
	for (var i = 0; i < steps.length; i++) {
		var step = refreshProofStep(puzzle, steps[i], current);
		if (!step)
			return [];
		var before = current[step.row][step.symbol];
		applyProofStep(current, placements, step);
		step.domain = current[step.row][step.symbol];
		step.domains = copyDomains(current);
		step.placements = placements.slice();
		step.message = proofDeductionMessage(puzzle, step, before,
			step.domain, current);
		replay.push(step);
		drainForcedProofSteps(current, placements,
			function(forced, forcedBefore) {
				forced.domain = current[forced.row][forced.symbol];
				forced.domains = copyDomains(current);
				forced.placements = placements.slice();
				forced.message = forcedProofMessage(puzzle, forced,
					forcedBefore);
				replay.push(forced);
			});
	}
	steps = replay;
	if (!proofConcluded(puzzle, current, failedSlot, failedValue)) {
		var step = directFailedProofStep(puzzle, current,
			failedSlot, failedValue);
		if (!step)
			return [];
		var before = current[step.row][step.symbol];
		applyProofStep(current, placements, step);
		step.domain = current[step.row][step.symbol];
		step.domains = copyDomains(current);
		step.placements = placements.slice();
		step.message = proofDeductionMessage(puzzle, step, before,
			step.domain, current);
		steps.push(step);
	}
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
			this.slots[i].singleElem.textContent = symbols[i];
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
					elem.className +=
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

function Slot(row, symbols, display) {
	this.row = row;
	this.symbols = symbols;
	this.elem = display;
	this.elem.className = "slot " + row.familyClass;

	this.say = function(msg) { this.row.puzzle.say(msg) };

	this.newGame = function(value) {
		this.value = value;
		this.singleElem.textContent = this.symbols[value];
		this.possible = [];
		for (var i = 0; i < this.symbols.length; i++)
			this.possible.push(true);
		this.displayPossible();
	}

	this.symbol = function() {
		return this.symbols[this.value];
	}

	this.displaySingle = function(source) {
		var sourceRect;
		var style = this.row.puzzle.placementAnimation;
		if (source && (style == "grow" || style == "skid") &&
		    source.getBoundingClientRect)
			sourceRect = source.getBoundingClientRect();
		this.singleElem.classList.remove("placing");
		this.singleElem.hidden = false;
		this.possibleElem.hidden = true;
		if (source) {
			if (style == "grow" || style == "skid") {
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
			}
			this.singleElem.classList.add("placing");
		}
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
		this.singleElem.classList.remove("placing");
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
			this.singleElem.textContent = this.symbols[placed];
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
		for (var i = 0; i < this.possibilityElems.length; i++)
			this.possibilityElems[i].className = this.possible[i] ?
				"possibility" : "possibility dead-possibility";
	}

	this.choose = function(value, playerAction) {
		if (this.row.puzzle.gameOver || this.row.puzzle.paused)
			return;
		if (this.value == value) {
			if (playerAction || this.row.puzzle.placeSoundPending)
				this.row.puzzle.playSound("place");
			this.row.puzzle.placeSoundPending = false;
			this.displaySingle(this.possibilityElems[value]);
			this.row.removePossible(value);
			this.row.puzzle.reconcilePencilMarks(this.row);
			this.row.puzzle.checkWin();
			if (playerAction)
				this.row.puzzle.dismissExhaustedClues();
		} else {
			var clues = this.row.puzzle.findContradictingClues(
				this, value, false);
			this.row.puzzle.lose(
				randomChoice(falsePlacementMessages), clues, this, value);
		}
	}

	this.discard = function(value, playerAction) {
		if (this.single || this.row.puzzle.gameOver ||
		    this.row.puzzle.paused)
			return;
		if (this.value == value) {
			var clues = this.row.puzzle.findContradictingClues(
				this, value, true);
			this.row.puzzle.lose(
				randomChoice(falseEliminationMessages), clues, this, value);
		} else {
			if (playerAction) {
				this.row.puzzle.playSound("discard");
				this.row.puzzle.placeSoundPending = true;
			}
			this.removePossible(value);
			this.row.checkSingleton(value);
			this.row.puzzle.reconcilePencilMarks(this.row);
			this.row.puzzle.placeSoundPending = false;
			if (playerAction)
				this.row.puzzle.dismissExhaustedClues();
		}
	}

	this.isPossible = function(value) {
		return !this.single && this.possible[value];
	}

	this.removePossible = function(value, deferCheck) {
		this.possible[value] = false;
		this.possibilityElems[value].className =
			"possibility dead-possibility";
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
		this.row.puzzle.togglePencilMark(this, value, discard);
	}

	this.singleElem = document.createElement("div");
	this.singleElem.className = "single";
	this.singleElem.hidden = true;
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
			var cell = this.possibilityElems[j] =
				possibleRow.insertCell();
			cell.innerHTML = this.symbols[j];
			cell.className = "possibility";
			cell.addEventListener('pointerdown',
				function(s) { return function(ev) {
					s.row.puzzle.beginSlotTrayDrag(s, ev);
				}}(this));
			cell.addEventListener('pointermove',
				function(s) { return function(ev) {
					s.row.puzzle.updateSlotTrayDrag(ev);
				}}(this));
			cell.addEventListener('pointerup',
				function(s) { return function(ev) {
					s.row.puzzle.endSlotTrayDrag(ev, false);
				}}(this));
			cell.addEventListener('pointercancel',
				function(s) { return function(ev) {
					s.row.puzzle.endSlotTrayDrag(ev, true);
				}}(this));
			cell.addEventListener('click',
				function(s, j) { return function(ev) {
					if (s.row.puzzle.ignoreSlotClick) {
						s.row.puzzle.ignoreSlotClick = false;
						return;
					}
					if (s.row.puzzle.expandTileChoices)
						s.row.puzzle.openSlotTray(s);
					else if (s.row.puzzle.showActionSelector)
						s.row.puzzle.applyTileAction(s, j,
							s.row.puzzle.getTileAction());
					else if (ev.ctrlKey || ev.altKey || ev.shiftKey)
						s.pencil(j, false);
					else
						s.choose(j, true);
				}}(this, j));
			cell.addEventListener('contextmenu',
				function(s, j) { return function(ev) {
					ev.preventDefault();
					if (ev.altKey || ev.shiftKey ||
					    (ev.ctrlKey && !s.row.puzzle.macOS))
						s.pencil(j, true);
					else
						s.discard(j, true);
				}}(this, j));
		}
	}

	this.elem.appendChild(this.singleElem);
	this.elem.appendChild(this.possibleElem);
}

function checkClueDisplay(clue) {
	if (!clue.rendered) {
		clue.render();
		clue.rendered = true;
	}
	if (clue.active)
		clue.display.classList.remove("clue-hidden");
	else
		clue.display.classList.add("clue-hidden");
}

function renderClue(puzzle, clue, slot, type, elements, horizontal) {
	slot.innerHTML = "";
	var content = slot;
	if (horizontal) {
		content = document.createElement("div");
		content.className = "clue-content";
		slot.appendChild(content);
	}
	for (var i = 0; i < elements.length; i++) {
		var elem = document.createElement(type);
		elem.className = elements[i][0];
		elem.innerHTML = elements[i][1];
		content.appendChild(elem);
	}
	if (!clue.listener) {
		clue.listener = function(ev) {
			ev.preventDefault();
			if (puzzle.proof)
				return;
			if (clue.active)
				puzzle.playSound("clue");
			clue.active = !clue.active;
			checkClueDisplay(clue);
		};
	}
	slot.onclick = clue.listener;
	slot.oncontextmenu = clue.listener;
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
			    ["tile " + this.lRow.familyClass,
			     this.lRow.slots[this.lCol].symbol()],
			    ["dots", "..."],
			    ["tile " + this.rRow.familyClass,
			     this.rRow.slots[this.rCol].symbol()]
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
			    ["tile " + this.lRow.familyClass,
			     this.lRow.slots[this.lCol].symbol()],
			    ["arrow", clueArrow],
			    ["tile " + this.rRow.familyClass,
			     this.rRow.slots[this.rCol].symbol()]
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
			    ["tile " + this.lRow.familyClass,
			     this.lRow.slots[this.lCol].symbol()],
			    ["tile " + this.mRow.familyClass,
			     this.mRow.slots[this.mCol].symbol()],
			    ["tile " + this.rRow.familyClass,
			     this.rRow.slots[this.rCol].symbol()]
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
			    ["tile " + this.tRow.familyClass,
			     this.tRow.slots[this.col].symbol()],
			    ["tile " + this.bRow.familyClass,
			     this.bRow.slots[this.col].symbol()]
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
