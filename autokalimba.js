const $ = (x) => document.querySelector(x);
const $$ = (x) => document.querySelectorAll(x);

const AudioContext = window.AudioContext || window.webkitAudioContext;
const ctx = new AudioContext();
const mix = ctx.createGain();
mix.connect(ctx.destination);
mix.gain.value = 1.4;
const pointers = new Map();
const pi = Math.PI;
let currentBass = 220.0;
// let frozenBass = 220.0;
let sampleBuf = undefined;
let strumSetting = 0.04;

let sampleBaseFreq = 110;

function loadInstrument(path) {
  sampleBaseFreq = /kalimba/.test(path) ? 220 : 110;
  fetch(path).then(async (r) => {
    const blob = await r.blob();
    const ab = await blob.arrayBuffer();
    ctx.decodeAudioData(ab, (buf) => {
      sampleBuf = buf;
    });
  });
}

loadInstrument("./guitar.wav");

function chordFreq(semitones) {
  let k = currentBass * 2 ** (semitones / 12);
  if (k < 250) k *= 2;
  if (k > 650) k /= 2;
  return k;
}

function semitoneToFrequency(st) {
  const base = Number($("#base").value);
  const j = ((st + 1200 - base) % 12) + base;
  return 220 * 2 ** (j / 12);
}

function noteNameToSemitone(note) {
  return (
    "A BC D EF G ".indexOf(note.charAt(0)) + /♯|#/.test(note) - /♭|b/.test(note)
  );
}

function noteNameToFrequency(note) {
  return semitoneToFrequency(noteNameToSemitone(note));
}

function makeOsc(freq, gainValue, delay) {
  const osc = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = gainValue;
  osc.buffer = sampleBuf;
  osc.connect(gain);
  osc.gainNode = gain;
  gain.connect(mix);
  // osc.frequency.value = freq;
  osc.playbackRate.value = freq / sampleBaseFreq;
  osc.start(ctx.currentTime + delay);
  return osc;
}

window.addEventListener("DOMContentLoaded", (event) => {
  if (/harp/.test(window.location.href)) $(".refresh-link").remove();

  const fullscreenButton = $(".fullscreen-button");
  if (document.fullscreenEnabled) {
    fullscreenButton.addEventListener("click", () => {
      document.body
        .requestFullscreen()
        .then(() => screen.orientation.lock("landscape"));
    });
  } else {
    fullscreenButton.style.display = "none";
  }

  $("#select-instrument").onchange = (e) => {
    loadInstrument(`./${e.target.value}.wav`);
  };
  $("#gain").onchange = (e) => {
    mix.gain.value = e.target.value;
  };
  $("#strum").onchange = (e) => {
    strumSetting = e.target.value;
  };
  const bass = $(".bass");
  const bassButtons = [...$$(".bass-button")];

  for (const b of bassButtons) {
    // Prevent selecting them with long taps:
    b.addEventListener("touchstart", (e) => {
      e.preventDefault();
    });
    b.addEventListener("pointerdown", (e) => {
      if (!e.target.className.includes("button")) return;
      const rect = e.target.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const note = e.target.innerText;

      // let isFrozen = $("#freeze").checked;
      let freq = noteNameToFrequency(note);
      // if (!isFrozen) frozenBass = freq;
      currentBass = freq;
      // if (isFrozen) freq = frozenBass;

      if ($("#split-keys").checked) {
        const fourthLower = e.clientY > rect.top + rect.height * 0.65;
        e.target.style.background = fourthLower
          ? "linear-gradient(to bottom, #a99 65%, #f80 65%)"
          : "linear-gradient(to bottom, #f80 65%, #777 65%)";
        if (fourthLower)
          freq = semitoneToFrequency(noteNameToSemitone(note) - 5);
      } else {
        e.target.style.background = "#f80";
      }

      pointers.set(e.pointerId, {
        centerX: centerX,
        centerY: centerY,
        note: e.target.innerText,
        target: e.target,
        oscs: [makeOsc(freq / 2, 0.6, 0)],
      });

      for (const v of pointers.values()) {
        if (v.voicing) {
          for (let i = 0; i < v.voicing.length; i++) {
            // v.oscs[i].frequency.value = chordFreq(v.voicing[i]);
            v.oscs[i].playbackRate.value =
              chordFreq(v.voicing[i]) / sampleBaseFreq;
          }
        }
      }
    });
  }

  bass.addEventListener("pointermove", (e) => {
    // const p = pointers.get(e.pointerId);
  });
  function stop(pointerId) {
    const p = pointers.get(pointerId);
    if (!p) return;
    for (const osc of p.oscs) {
      osc.gainNode.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
      osc.stop(ctx.currentTime + 0.2);
    }
    p.target.style.background = "";
    pointers.delete(pointerId);
  }
  bass.addEventListener("pointerup", (e) => stop(e.pointerId));
  bass.addEventListener(
    "pointerleave",
    (e) => e.target.className.includes("button") || stop(e.pointerId)
  );

  const chordButtons = [...$$(".chord-button")];
  for (const b of chordButtons) {
    const voicing = b.attributes["data-chord"].value.split(" ");
    b.addEventListener("pointerdown", (e) => {
      e.target.style.background = "#f80";
      const rect = e.target.getBoundingClientRect();
      const freqs = voicing.map((f) => chordFreq(f)).sort((a, b) => a - b);
      pointers.set(e.pointerId, {
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        note: e.target.innerText,
        target: e.target,
        voicing: voicing,
        oscs: freqs.map((freq, i) => {
          const n = freqs.length;
          const style = $("#select-strum-style").value;
          const delay =
            style === "random"
              ? strumSetting * Math.random()
              : style === "up"
              ? (strumSetting * i) / n
              : style === "down"
              ? (strumSetting * (n - 1 - i)) / n
              : 0;
          return makeOsc(freq, 0.2, delay);
        }),
      });
    });
    b.addEventListener("pointermove", (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const detune = e.clientY - p.centerY;
      for (const osc of p.oscs) {
        osc.detune.value = detune * -0.5;
      }
    });
    b.addEventListener("pointerup", (e) => stop(e.pointerId));
    b.addEventListener("pointerleave", (e) => stop(e.pointerId));
    b.addEventListener("touchstart", (e) => {
      e.preventDefault();
    });
  }

  // const bassKb = "1qaz2wsx3edc";
  const bassKb = "2wsx3edc4rfv";
  const chordKb = "yuiophjkl;nm,./";
  document.addEventListener("keydown", (e) => {
    const i = bassKb.indexOf(e.key);
    if (e.repeat) return;
    if (i >= 0) {
      const target = bassButtons[i];
      target.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 999 + i,
          isPrimary: true,
        })
      );
    }
    const j = chordKb.indexOf(e.key);
    if (j >= 0) {
      const target = chordButtons[j];
      target.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 1999 + j,
          isPrimary: true,
        })
      );
    }
  });
  document.addEventListener("keyup", (e) => {
    const i = bassKb.indexOf(e.key);
    if (i >= 0) {
      stop(999 + i);
    }
    const j = chordKb.indexOf(e.key);
    if (j >= 0) {
      stop(1999 + j);
    }
  });
});
