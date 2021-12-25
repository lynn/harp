const $ = (x) => document.querySelector(x);
const $$ = (x) => document.querySelectorAll(x);

const AudioContext = window.AudioContext || window.webkitAudioContext;
const ctx = new AudioContext();
const mix = ctx.createGain();
mix.connect(ctx.destination);
mix.gain.value = 1.0;
const pointers = new Map();
let currentBass = 220.0;
// let frozenBass = 220.0;
let sampleBuffers = [];
let strumSetting = 0.04;

let bassGain = 1.0;
let chordGain = 1.0;

let lastFreqs = undefined;
let lastVoicing = undefined;

function subSemitones() {
  // If the last voicing contains b5 or #5, drop a tritone; otherwise, drop a fourth.
  return lastVoicing && lastVoicing.some((v) => v % 12 === 6 || v % 12 === 8)
    ? 6
    : 5;
}

let instruments = {
  Guitar: {
    samples: [{ name: "guitar.wav", freq: 110 }],
  },
  Kalimba: {
    samples: [{ name: "kalimba.wav", freq: 220 }],
  },
  Rhodes: {
    samples: [
      { name: "rhodes-low.mp3", freq: 110 },
      { name: "rhodes-high.mp3", freq: 329 },
    ],
  },
};

function loadInstrument(instrument) {
  sampleBuffers.length = 0;
  instrument.samples.map((s, i) => {
    fetch("instruments/" + s.name).then(async (r) => {
      const blob = await r.blob();
      const ab = await blob.arrayBuffer();
      ctx.decodeAudioData(ab, (buffer) => {
        sampleBuffers[i] = { buffer, freq: s.freq };
      });
    });
  });
}

loadInstrument(instruments["Guitar"]);

function getTuningSemitones() {
  return $("#tuning").value / 100;
}

function chordFreq(semitones) {
  let k = currentBass * 2 ** (semitones / 12);
  if (k < 250) k *= 2;
  if (k > 650) k /= 2;
  return k;
}

function bassFreq(semitones) {
  const st = semitones + getTuningSemitones();
  const base = Number($("#base").value);
  const wrapped = ((st + 1200 - base) % 12) + base;
  console.log("bass", getTuningSemitones(), st, base, wrapped);
  return 110 * 2 ** (wrapped / 12);
}

function noteNameToSemitone(note) {
  return (
    "A BC D EF G ".indexOf(note.charAt(0)) + /♯|#/.test(note) - /♭|b/.test(note)
  );
}

function makeOsc(freq, gainValue, delay) {
  const osc = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = gainValue;
  let closestBuffer = sampleBuffers[0];
  let closestDifference = 9e99;
  for (const b of sampleBuffers) {
    const difference = Math.abs(freq - b.freq);
    if (difference < closestDifference) {
      closestBuffer = b;
      closestDifference = difference;
    }
  }

  const osc1 = ctx.createOscillator();
  osc1.frequency.value = 0;
  var vgain = ctx.createGain();
  vgain.gain.value = 20;
  osc1.connect(vgain);
  vgain.connect(osc.detune);
  // vgain.connect(gain.gain);
  osc1.start(ctx.currentTime);

  osc.buffer = closestBuffer.buffer;
  osc.connect(gain);
  osc.gainNode = gain;
  gain.connect(mix);
  osc.playbackRate.value = freq / closestBuffer.freq;
  osc.autokalimbaSampleBaseFreq = closestBuffer.freq;
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

  for (const name of Object.keys(instruments)) {
    const option = document.createElement("option");
    option.value = name;
    option.innerText = name;
    $("#select-instrument").appendChild(option);
  }
  $("#select-instrument").onchange = (e) => {
    loadInstrument(instruments[e.target.value]);
  };
  $("#bass-gain").onchange = (e) => {
    bassGain = e.target.value;
  };
  $("#chord-gain").onchange = (e) => {
    chordGain = e.target.value;
  };
  $("#strum").onchange = (e) => {
    strumSetting = e.target.value;
  };
  $("#hue").oninput = $("#hue").onchange = (e) => {
    document.body.style.filter = `hue-rotate(${e.target.value}deg)`;
  };
  $("#tuning").oninput = $("#tuning").onchange = (e) => {
    const n = e.target.value;
    $("#tuning-value").innerText = `${n > 0 ? "+" : ""}${n}¢`;
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

      let freq = bassFreq(noteNameToSemitone(note));
      let isSub = false;
      currentBass = freq;

      if ($("#split-keys").checked) {
        isSub = e.clientY > rect.top + rect.height * 0.65;
        e.target.style.background = isSub
          ? "linear-gradient(to bottom, var(--button) 65%, var(--active) 65%)"
          : "linear-gradient(to bottom, var(--active) 65%, var(--button-split) 65%)";
        if (isSub) {
          freq = bassFreq(noteNameToSemitone(note) - subSemitones());
        }
      } else {
        e.target.style.background = "#f80";
      }

      pointers.set(e.pointerId, {
        centerX: centerX,
        centerY: centerY,
        note: e.target.innerText,
        target: e.target,
        isBass: true,
        rootSemitone: noteNameToSemitone(note),
        isSub,
        oscs: [makeOsc(freq, 0.5 * bassGain, 0)],
      });

      // Correct chord voicing to this new bass note
      for (const v of pointers.values()) {
        if (v.voicing) {
          for (let i = 0; i < v.voicing.length; i++) {
            v.oscs[i].playbackRate.value =
              chordFreq(v.voicing[i]) / v.oscs[i].autokalimbaSampleBaseFreq;
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
    const attr = b.attributes["data-chord"].value;
    const voicing = attr.split(" ").map(Number);
    b.addEventListener("pointerdown", (e) => {
      e.target.style.background = "#f80";
      const rect = e.target.getBoundingClientRect();

      let freqs;
      if (attr === "up") {
        freqs = lastFreqs;
        freqs.push(freqs.shift() * 2);
        console.log(lastFreqs, freqs);
        lastFreqs = freqs;
      } else {
        freqs = voicing.map((f) => chordFreq(f)).sort((a, b) => a - b);
        lastVoicing = voicing;
        lastFreqs = freqs;
      }

      pointers.set(e.pointerId, {
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        note: e.target.innerText,
        target: e.target,
        isBass: false,
        voicing: lastVoicing,
        oscs: freqs.map((freq, i) => {
          const n = freqs.length;
          const style = $("#select-strum-style").value;
          const tinyRandom = 1 + (Math.random() - 0.5) * 0.23;
          const delay =
            style === "random"
              ? strumSetting * Math.random()
              : style === "up"
              ? ((strumSetting * i) / n) * tinyRandom
              : style === "down"
              ? ((strumSetting * (n - 1 - i)) / n) * tinyRandom
              : 0;
          return makeOsc(freq, 0.2 * chordGain, delay);
        }),
      });

      // Correct bass sub to this new chord voicing
      for (const v of pointers.values()) {
        if (v.isBass && v.isSub) {
          for (let i = 0; i < v.oscs.length; i++) {
            v.oscs[i].playbackRate.value =
              bassFreq(v.rootSemitone - subSemitones()) /
              v.oscs[i].autokalimbaSampleBaseFreq;
          }
        }
      }
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

  $$("input, select").forEach((el) => {
    // Don't remember the settings toggle itself.
    if (el.id === "settings") return;
    const key = "autokalimba-" + el.id;
    const value = window.localStorage.getItem(key);
    if (value !== null && value !== undefined) {
      el.value = value;
      if (el.onchange) el.onchange({ target: el });
    }
    el.addEventListener("change", (e) => {
      window.localStorage.setItem(key, String(e.target.value));
    });
  });
});
