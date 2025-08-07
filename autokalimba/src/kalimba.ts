import { type Signal, signal } from "@preact/signals";
import {
	type Instrument,
	instruments,
	OscillatorInstrument,
	SampleInstrument,
	type SampleInstrumentDescription,
} from "./instrument";
import type { Note, Sample } from "./note";
import type { Settings } from "./global";
import { chords } from "./chord";
import { StenoKeyboard } from "./steno";

interface TargetDescription {
	type: "bass" | "bass-split" | "split-last" | "chord";
	semitones: number[];
}

interface Target {
	description: TargetDescription;
	active: Signal<boolean>;
	/**
	 * Notes currently playing from this target.
	 */
	notes: Note[];
}

const noteNames: string[] = "a bb b c db d eb e f gb g ab".split(" ");

const bassTargetDescriptions: [string, TargetDescription][] = noteNames.flatMap(
	(name, i) => [
		[name, { type: "bass", semitones: [i] }],
		[`${name}-split`, { type: "bass-split", semitones: [i] }],
	],
);

const chordTargetDescriptions: [string, TargetDescription][] = chords.map(
	(chord) => [chord.name, { type: "chord", semitones: chord.semitones }],
);

const scaleDegreeTargetDescriptions: [string, TargetDescription][] = Array.from(
	{ length: 12 },
	(_, i) => [`s-${i}`, { type: "chord", semitones: [i] }],
);

const targetDescriptions: [string, TargetDescription][] = [
	...bassTargetDescriptions,
	...chordTargetDescriptions,
	...scaleDegreeTargetDescriptions,
	["split-last", { type: "split-last", semitones: [] }],
];

type TargetName = string;

const qwerty: Record<string, TargetName> = {
	"2": "db",
	"3": "f",
	"4": "a",
	w: "ab",
	e: "c",
	r: "e",
	s: "eb",
	d: "g",
	f: "b",
	x: "bb",
	c: "d",
	v: "gb",
	y: "Δ9",
	u: "m9",
	i: "7s",
	o: "7♭9",
	p: "13s",
	h: "Δ",
	j: "m7",
	k: "7",
	l: "7♯5",
	";": "13",
	n: "6",
	m: "m6",
	",": "ø",
	".": "dim",
	"/": "II/",
};

type DisplayLayout = "touch" | "keyboard" | "steno";

/**
 * The autokalimba.
 *
 * The basic architecture is that multiple "inputs" (such as a button on the
 * page, or a keyboard key) can activate a "target" (such as the E♭ bass note or
 * the maj7 chord).
 *
 * Each target then has an `active` signal, which tells buttons to light up, and
 * associated `notes`, which can be controlled in "aftertouch" by wiggling the
 * pointer that activated the target.
 */
export class Kalimba {
	/**
	 * A map from `pointerId` (pointers pressing buttons on the autokalimba) to
	 * target names they are activating.
	 */
	private pointers: Map<number, TargetName> = new Map();

	/**
	 * A map from key names to target names, e.g. `"y": "Δ9"`
	 */
	readonly keyboardLayout: Record<string, TargetName> = qwerty;

	/**
	 * Which layout to use for displaying the buttons.
	 */
	readonly displayLayout: Signal<DisplayLayout> = signal("touch");

	/**
	 * Map from target names to target state.
	 */
	private targets: Map<TargetName, Target> = new Map(
		targetDescriptions.map(([name, description]) => [
			name,
			{ description, active: signal(false), notes: [] },
		]),
	);

	/**
	 * AudioNode into which all autokalimba audio is mixed.
	 */
	private mix: AudioNode;

	private instrument: Instrument = new OscillatorInstrument({
		attack: 0.2,
		decay: 1.2,
		echoes: [
			{ minDelay: 0.5, maxDelay: 1.0, pitchFactor: 1, volumeFactor: 0.3 },
			{ minDelay: 1.0, maxDelay: 2.0, pitchFactor: 2, volumeFactor: 0.1 },
		],
	});

	/**
	 * Semitone offset (from A) of the last bass key played.
	 */
	private bassSemitones = 0;

	/**
	 * Semitone offsets (from `bassSemitones`) for the last chord key played.
	 */
	private chordSemitones: number[] = [];

	readonly stenoKeyboard: StenoKeyboard;

	constructor(
		private ctx: AudioContext,
		private settings: Settings,
	) {
		this.mix = ctx.createGain();
		// Default values except threshold and knee
		const compressor = new DynamicsCompressorNode(ctx, {
			threshold: -20,
			knee: 20,
			ratio: 12,
			attack: 0.003,
			release: 0.25,
		});
		this.mix.connect(compressor);
		compressor.connect(ctx.destination);
		this.loadInstrument(instruments.Rhodes);

		this.stenoKeyboard = new StenoKeyboard(
			this.pointerDown.bind(this),
			this.pointerUp.bind(this),
		);
	}

	/**
	 * Load all the samples for the given instrument. When the promise resolves,
	 * the kalimba is ready to be played.
	 */
	async loadInstrument(
		description: SampleInstrumentDescription,
	): Promise<void> {
		const sampleBuffers: Sample[] = [];
		await Promise.all(
			description.samples.map(async (sample, i) => {
				const response = await fetch(`instruments/${sample.name}`);
				const blob = await response.blob();
				const arrayBuffer = await blob.arrayBuffer();
				this.ctx.decodeAudioData(arrayBuffer, (buffer) => {
					sampleBuffers[i] = {
						buffer,
						frequency: sample.frequency,
						only: sample.only,
					};
				});
			}),
		);

		const instrument = new SampleInstrument(description, sampleBuffers);
		this.instrument = instrument;
	}

	private noteDelay(baseDelay: number): number {
		const strumStyle = this.settings.strumStyle.value;
		if (strumStyle === undefined) {
			return 0;
		}

		const strumDelay = this.settings.strumDelay.value;
		if (strumStyle === "random") {
			return strumDelay * baseDelay * Math.random();
		}

		const factor = strumStyle === "up" ? baseDelay : 1 - baseDelay;
		const slightlyRandom = 1 + (Math.random() - 0.5) * 0.23;
		return strumDelay * factor * slightlyRandom;
	}

	private chordFrequency(semitones: number): number {
		const frequency = 220 * 2 ** ((this.bassSemitones + semitones) / 12);
		return this.instrument.remapFrequency(frequency);
	}

	private adjustChordNotes() {
		for (const target of this.targets.values()) {
			if (target.description.type === "chord" && target.notes.length) {
				target.description.semitones.map((semitones, i) => {
					target.notes[i].setFrequency(this.chordFrequency(semitones));
				});
			}
		}
	}

	private adjustBassNotes() {
		for (const target of this.targets.values()) {
			if (target.description.type === "bass-split" && target.notes.length) {
				target.description.semitones.map((semitones, i) => {
					target.notes[i].setFrequency(
						this.bassFrequency(semitones, "bass-split"),
					);
				});
			}
		}
	}

	private splitBassOffset(): number {
		return this.chordSemitones.some((x) => x % 12 === 6 || x % 12 === 8)
			? -6
			: -5;
	}

	private bassFrequency(
		rootSemitones: number,
		type: "bass" | "bass-split",
	): number {
		const splitOffset = type === "bass-split" ? this.splitBassOffset() : 0;
		const goalSemitones = rootSemitones + splitOffset;
		const lowest = this.settings.lowestBassNote.value;
		const offset = (goalSemitones - lowest) % 12;
		const realSemitones = lowest + ((offset + 12) % 12);
		return 220 * 2 ** (realSemitones / 12);
	}

	private playBassNote(semitones: number, type: "bass" | "bass-split"): Note {
		this.bassSemitones = semitones;
		this.adjustChordNotes();
		const frequency = this.bassFrequency(semitones, type);
		const note = this.instrument.makeNote(this.ctx, frequency, true);
		note.start(frequency, 0.5, 0, this.mix);
		return note;
	}

	private playChordNote(semitones: number, delay: number): Note {
		const frequency = this.chordFrequency(semitones);
		const note = this.instrument.makeNote(this.ctx, frequency, false);
		note.start(frequency, 0.2, delay, this.mix);
		return note;
	}

	private playChord(semitones: number[]): Note[] {
		this.chordSemitones = semitones;
		this.adjustBassNotes();
		return semitones.map((st, i) =>
			this.playChordNote(st, this.noteDelay(i / semitones.length)),
		);
	}

	/**
	 * Initiate playback for the given target. Return whether initiation was
	 * successful (i.e. a target by this name exists and was not yet active).
	 */
	private startTarget(targetName: string): boolean {
		const target = this.targets.get(targetName);
		if (!target || target.active.value) {
			console.warn("Unknown target:", targetName);
			return false;
		}

		const { type, semitones } = target.description;
		const notes =
			type === "split-last"
				? [this.playBassNote(this.bassSemitones, "bass-split")]
				: type === "bass" || type === "bass-split"
					? [this.playBassNote(semitones[0], type)]
					: this.playChord(semitones);
		target.active.value = true;
		target.notes = notes;
		return true;
	}

	/**
	 * Stop all notes sounding from the given target.
	 */
	private stopTarget(targetName: string) {
		const target = this.targets.get(targetName);
		if (!target) return;

		for (const note of target.notes) {
			note.stop();
		}
		target.active.value = false;
	}

	/**
	 * Is the given target being activated? (This decides whether to light up a
	 * button, so that the buttons still light up when you use the keyboard.)
	 */
	isActive(targetName: string): boolean {
		const target = this.targets.get(targetName);
		return target ? target.active.value : false;
	}

	/**
	 * Called when a pointer hits a target on the autokalimba.
	 */
	pointerDown(
		pointerId: number,
		targetName: string,
		displayLayout: DisplayLayout = "touch",
	) {
		if (this.startTarget(targetName)) {
			this.displayLayout.value = displayLayout;
			this.pointers.set(pointerId, targetName);
		}
	}

	/**
	 * Called when a pointer is released.
	 */
	pointerUp(pointerId: number) {
		const targetName = this.pointers.get(pointerId);
		this.pointers.delete(pointerId);
		if (!targetName) return;
		this.stopTarget(targetName);
	}

	private keysHeld: Set<string> = new Set();

	/**
	 * Called when a key on the keyboard is pressed.
	 */
	keyDown(e: KeyboardEvent) {
		if (e.repeat) return;
		if (this.stenoKeyboard.isConnected()) return;
		if (this.keysHeld.has(e.key)) return;

		const targetName = this.keyboardLayout[e.key];

		if (targetName) {
			e.preventDefault();
			if (this.startTarget(targetName)) {
				this.displayLayout.value = "keyboard";
				this.keysHeld.add(e.key);
			}
		}
	}

	/**
	 * Called when a key on the keyboard is released.
	 */
	keyUp(e: KeyboardEvent) {
		if (!this.keysHeld.delete(e.key)) return;
		const targetName = this.keyboardLayout[e.key];

		if (targetName) {
			e.preventDefault();
			this.stopTarget(targetName);
		}
	}
}
