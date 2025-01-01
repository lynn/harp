import { Button } from "./Button";
import { KalimbaContext, SettingsContext } from "./global";
import { useContext, useEffect } from "preact/hooks";
import { Settings } from "./Settings";
import { chords } from "./chord";

export function App() {
	const settings = useContext(SettingsContext);
	const kalimba = useContext(KalimbaContext);
	const sharps = settings.sharps.value;

	useEffect(() => {
		document.body.addEventListener("keydown", (e) => {
			kalimba.keyDown(e);
		});
		document.body.addEventListener("keyup", (e) => {
			kalimba.keyUp(e);
		});
	}, [kalimba]);

	const db = sharps > 1 ? "C♯" : "D♭";
	const ab = sharps > 2 ? "G♯" : "A♭";
	const eb = sharps > 3 ? "D♯" : "E♭";
	const bb = sharps > 4 ? "A♯" : "B♭";
	const gb = sharps > 0 ? "F♯" : "G♭";

	const horizontalChords = kalimba.displayLayout.value === "keyboard";

	return (
		<div
			className="flex flex-col bg-pink h-full items-start justify-between gap-4 select-none max-h-svh"
			style={{
				filter: `hue-rotate(${settings.hue.value}deg)`,
			}}
			onPointerUp={(e) => kalimba.pointerUp(e.pointerId)}
			onPointerLeave={(e) => kalimba.pointerUp(e.pointerId)}
		>
			<Settings />
			<div className="flex w-full h-full justify-between">
				{kalimba.displayLayout.value === "steno" ? (
					<div className="left-4 right-4 bottom-2 flex flex-row items-end justify-between w-full p-4">
						<div className="grid grid-cols-6 grid-rows-4 gap-1">
							<Button bass={true} label={ab} targetName="ab" />
							<Button bass={true} label={bb} targetName="bb" />
							<Button bass={true} label={"C"} targetName="c" />
							<Button bass={true} label={"D"} targetName="d" />
							<Button bass={true} label={"E"} targetName="e" />
							<Button bass={true} label={"*"} targetName="split-last" />
							<Button bass={true} label={db} targetName="db" />
							<Button bass={true} label={eb} targetName="eb" />
							<Button bass={true} label={"F"} targetName="f" />
							<Button bass={true} label={"G"} targetName="g" />
							<Button bass={true} label={"A"} targetName="a" />
							<Button bass={true} label={"*"} targetName="split-last" />
							<div className="col-span-6" />
							<div className="col-span-4" />
							<Button bass={true} label={"B"} targetName="b" />
							<Button bass={true} label={gb} targetName="gb" />
						</div>
						<input
							type="range"
							className="h-[24em]"
							style="writing-mode: vertical-lr; direction: rtl;"
							min={-12}
							max={12}
							value={settings.lowestBassNote.value}
							onInput={(e) => {
								settings.lowestBassNote.value = Number(e.currentTarget.value);
							}}
						/>
						<div className="grid grid-cols-6 grid-rows-4 gap-1">
							<Button bass={true} label={"*"} targetName="split-last" />
							<Button bass={false} label={"4"} targetName={"s-5"} />
							<Button bass={false} label={"5"} targetName={"s-7"} />
							<Button bass={false} label={"6"} targetName={"s-9"} />
							<Button bass={false} label={"7"} targetName={"s-11"} />
							<Button bass={false} label={"♯8"} targetName={"s-1"} />
							<Button bass={true} label={"*"} targetName="split-last" />
							<Button bass={false} label={"♭7"} targetName={"s-10"} />
							<Button bass={false} label={"1"} targetName={"s-0"} />
							<Button bass={false} label={"2"} targetName={"s-2"} />
							<Button bass={false} label={"3"} targetName={"s-4"} />
							<Button bass={false} label={"♯4"} targetName={"s-6"} />
							<div className="col-span-6" />
							<Button bass={false} label={"♭3"} targetName={"s-3"} />
							<Button bass={false} label={"♭6"} targetName={"s-8"} />
						</div>
					</div>
				) : (
					<>
						<div className="absolute max-h-[32em] h-full left-4 bottom-2 pt-4 grid grid-cols-3 grid-rows-5 gap-1">
							<div className="col-span-3" />
							<Button bass={true} label={db} targetName="db" />
							<Button bass={true} label={"F"} targetName="f" />
							<Button bass={true} label={"A"} targetName="a" />
							<Button bass={true} label={ab} targetName="ab" />
							<Button bass={true} label={"C"} targetName="c" />
							<Button bass={true} label={"E"} targetName="e" />
							<Button bass={true} label={eb} targetName="eb" />
							<Button bass={true} label={"G"} targetName="g" />
							<Button bass={true} label={"B"} targetName="b" />
							<Button bass={true} label={bb} targetName="bb" />
							<Button bass={true} label={"D"} targetName="d" />
							<Button bass={true} label={gb} targetName="gb" />
						</div>
						<div
							className={`absolute max-h-[32em] h-full right-4 bottom-2 pt-4 ${
								horizontalChords
									? "grid grid-flow-col grid-rows-5 grid-cols-5 gap-1"
									: "grid grid-cols-3 grid-rows-5 gap-1"
							}`}
						>
							{horizontalChords && <div className="col-span-5 row-span-2" />}
							{chords.map((chord) => (
								<Button
									bass={false}
									label={chord.name}
									targetName={chord.name}
									key={chord.name}
								/>
							))}
						</div>
					</>
				)}
			</div>
		</div>
	);
}
