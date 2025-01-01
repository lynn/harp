import { signal, type Signal } from "@preact/signals";

const ploverHid = { usagePage: 0xff50, usage: 0x4c56 };

const stenoTargets = [
	"eb", // S
	"c", // T
	"f", // K
	"d", // P
	"g", // W
	"e", // H
	"a", // R
	"b", // A
	"gb", // O
	"split-last", // *
	"s-3", // -E
	"s-8", // -U
	"s-5", // -F
	"s-10", // -R
	"s-7", // -P
	"s-0", // -B
	"s-9", // -L
	"s-2", // -G
	"s-11", // -T
	"s-4", // -S
	"s-1", // -D
	"s-6", // -Z
	"bb", // #
	"ab", // ^
	"db", // +
];

// const stenoAlphabet = "STKPWHRAO*EUFRPBLGTSDZ#";

export class StenoKeyboard {
	private device: Signal<HIDDevice | null> = signal(null);

	constructor(
		private pointerDown: (
			pointerId: number,
			targetName: string,
			displayLayout: "steno",
		) => void,
		private pointerUp: (pointerId: number) => void,
	) {}

	private keyDown(bit: number) {
		this.pointerDown(bit, stenoTargets[bit], "steno");
	}

	private keyUp(bit: number) {
		this.pointerUp(bit);
	}

	private last = 0;

	processInputReport(report: HIDInputReportEvent) {
		const bits = report.data.getUint32(0);
		console.log(bits.toString(2));
		for (let i = 0; i < 32; i++) {
			const is = (bits >> (31 - i)) & 1;
			const was = (this.last >> (31 - i)) & 1;
			if (is && !was) {
				this.keyDown(i);
			} else if (was && !is) {
				this.keyUp(i);
			}
		}
		this.last = bits;
	}

	async connect() {
		if (this.device.value) {
			this.device.value.oninputreport = null;
			await this.device.value.close();
		}
		const devices = await navigator.hid.requestDevice({ filters: [ploverHid] });
		this.device.value = devices[0];
		if (this.device) {
			await this.device.value.open();
			this.device.value.oninputreport = (report) =>
				this.processInputReport(report);
		}
	}

	isConnected(): boolean {
		return !!this.device.value;
	}
}
