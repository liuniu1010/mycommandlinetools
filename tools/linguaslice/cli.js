#!/usr/bin/env node
"use strict";

const { File } = require("buffer");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const ENV_FILE = path.join(ROOT, ".env");
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;
const GENERATED_FILE_NAMES = new Set([
  "index.html",
  "segments.json",
  "transcript.txt",
  "transcription.json",
]);

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return;
  const lines = fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseOptions(args) {
  const options = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      options._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    i += 1;
  }
  return options;
}

function validateOptions(options) {
  const supported = new Set([
    "_",
    "output",
    "language",
    "padding",
    "bitrate",
    "transcript-json",
    "force",
  ]);
  const unknown = Object.keys(options).find((key) => !supported.has(key));
  if (unknown) throw new Error(`Unknown option: --${unknown}`);
}

function numberOption(value, fallback, name) {
  if (value == null) return fallback;
  if (value === true) throw new Error(`--${name} requires a value.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`--${name} must be zero or greater.`);
  }
  return parsed;
}

function requiredOptionValue(value, name) {
  if (value === true) throw new Error(`--${name} requires a value.`);
  return value;
}

function run(command, args, { capture = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
    });
    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolvePromise(stdout.trim());
        return;
      }
      const detail = stderr ? `: ${stderr.trim()}` : "";
      reject(new Error(`${command} exited with code ${code}${detail}`));
    });
  });
}

function commandExists(command) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, ["-version"], { stdio: "ignore" });
    child.once("error", () => resolvePromise(false));
    child.once("exit", (code) => resolvePromise(code === 0));
  });
}

async function audioDuration(input) {
  const output = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=nw=1:nk=1",
    input,
  ], { capture: true });
  const duration = Number(output);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("FFprobe could not determine the audio duration.");
  }
  return duration;
}

async function transcribe(input, temporaryDirectory, language) {
  loadEnv();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(`Missing OPENAI_API_KEY in ${ENV_FILE}. Set it or use --transcript-json.`);
  }

  const uploadPath = path.join(temporaryDirectory, "transcription-input.mp3");
  console.log("Preparing audio for transcription...");
  await run("ffmpeg", [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "48k",
    uploadPath,
  ]);

  const uploadStat = await fs.promises.stat(uploadPath);
  if (uploadStat.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      "The compressed transcription copy is larger than 25 MB. Split the source recording first.",
    );
  }

  const audio = await fs.promises.readFile(uploadPath);
  const form = new FormData();
  form.append("file", new File([audio], path.basename(uploadPath), { type: "audio/mpeg" }));
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  if (language) form.append("language", language);

  console.log("Transcribing audio with word timestamps...");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const responseText = await response.text();
  let body;
  try {
    body = JSON.parse(responseText);
  } catch {
    body = { raw: responseText };
  }
  if (!response.ok) {
    const message = body && body.error && body.error.message
      ? body.error.message
      : `OpenAI API returned HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

function lexicalTokens(text) {
  return String(text).match(WORD_PATTERN) || [];
}

function normalizeToken(token) {
  return token.toLocaleLowerCase().replaceAll("’", "'");
}

function buildSentences(transcription, language) {
  if (!transcription || typeof transcription.text !== "string") {
    throw new Error("The transcription response does not contain text.");
  }
  if (!Array.isArray(transcription.words) || transcription.words.length === 0) {
    throw new Error("The transcription response does not contain word timestamps.");
  }

  const timedTokens = transcription.words.flatMap((entry) => {
    const start = Number(entry.start);
    const end = Number(entry.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
      throw new Error("The transcription contains an invalid word timestamp.");
    }
    return lexicalTokens(entry.word).map((token) => ({
      token,
      normalized: normalizeToken(token),
      start,
      end,
    }));
  });

  const segmentedText = [
    ...new Intl.Segmenter(language, { granularity: "sentence" }).segment(transcription.text),
  ]
    .map(({ segment }) => segment.trim())
    .filter((text) => lexicalTokens(text).length > 0);

  if (segmentedText.length === 0 || timedTokens.length === 0) {
    throw new Error("No spoken sentences were found in the transcription.");
  }

  const sentenceTokens = segmentedText.flatMap((text, sentenceIndex) =>
    lexicalTokens(text).map((token) => ({
      sentenceIndex,
      token,
      normalized: normalizeToken(token),
    })),
  );

  if (sentenceTokens.length !== timedTokens.length) {
    throw new Error(
      `Could not align transcript punctuation with timestamps: ${sentenceTokens.length} ` +
      `transcript words versus ${timedTokens.length} timestamped words.`,
    );
  }

  const mismatches = sentenceTokens.reduce(
    (count, token, index) => count + Number(token.normalized !== timedTokens[index].normalized),
    0,
  );
  const mismatchRatio = mismatches / sentenceTokens.length;
  if (mismatchRatio > 0.08) {
    throw new Error(
      `Could not reliably align transcript punctuation with timestamps ` +
      `(${Math.round(mismatchRatio * 100)}% of words differ).`,
    );
  }

  let timedIndex = 0;
  return segmentedText.map((text) => {
    const wordCount = lexicalTokens(text).length;
    const firstWord = timedTokens[timedIndex];
    const lastWord = timedTokens[timedIndex + wordCount - 1];
    timedIndex += wordCount;
    return {
      text,
      spokenStart: firstWord.start,
      spokenEnd: lastWord.end,
    };
  });
}

function addClipBoundaries(sentences, duration, padding) {
  return sentences.map((sentence, index) => {
    const previous = sentences[index - 1];
    const next = sentences[index + 1];
    const availableBefore = previous
      ? Math.max(0, sentence.spokenStart - previous.spokenEnd) / 2
      : sentence.spokenStart;
    const availableAfter = next
      ? Math.max(0, next.spokenStart - sentence.spokenEnd) / 2
      : Math.max(0, duration - sentence.spokenEnd);
    const start = Math.max(0, sentence.spokenStart - Math.min(padding, availableBefore));
    const end = Math.min(duration, sentence.spokenEnd + Math.min(padding, availableAfter));
    if (end <= start) throw new Error(`Sentence ${index + 1} has invalid audio boundaries.`);
    return {
      number: index + 1,
      text: sentence.text,
      start,
      end,
      duration: end - start,
    };
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clipFilename(number, total) {
  const width = Math.max(3, String(total).length);
  return `sentence_${String(number).padStart(width, "0")}.mp3`;
}

function createHtml(title, clips) {
  const rows = clips.map((clip) => {
    const filename = clipFilename(clip.number, clips.length);
    return `      <div class="sentence" data-audio="${escapeHtml(filename)}">
        <span class="number">${String(clip.number).padStart(3, "0")}</span>
        <span class="text">${escapeHtml(clip.text)}</span>
        <button type="button" aria-label="Play sentence ${clip.number}">Play</button>
      </div>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { max-width: 960px; margin: 0 auto; padding: 24px 16px 48px; background: Canvas; color: CanvasText; }
    h1 { margin: 0 0 8px; font-size: 1.6rem; }
    .help { margin: 0 0 20px; color: GrayText; }
    #sentences { display: grid; gap: 8px; }
    .sentence { display: flex; align-items: center; gap: 14px; min-height: 44px; padding: 8px 10px;
      border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 8px; }
    .sentence.playing { border-color: #1677ff; background: color-mix(in srgb, #1677ff 10%, Canvas); }
    .number { color: GrayText; font-variant-numeric: tabular-nums; }
    .text { flex: 1; line-height: 1.4; }
    button { min-width: 76px; padding: 8px 14px; border: 0; border-radius: 6px; background: #1677ff;
      color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #0958d9; }
    button:focus-visible { outline: 3px solid color-mix(in srgb, #1677ff 40%, transparent); outline-offset: 2px; }
    @media (max-width: 540px) { .sentence { align-items: flex-start; } button { min-width: 64px; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="help">Click Play to hear one sentence. Selecting another sentence stops the current one.</p>
  <main id="sentences" aria-label="Sentence audio clips">
${rows}
  </main>
  <audio id="player" preload="none"></audio>
  <script>
    const player = document.querySelector("#player");
    let activeRow = null;
    function reset() {
      if (!activeRow) return;
      activeRow.classList.remove("playing");
      activeRow.querySelector("button").textContent = "Play";
      activeRow = null;
    }
    document.querySelector("#sentences").addEventListener("click", async (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const row = button.closest(".sentence");
      reset();
      activeRow = row;
      row.classList.add("playing");
      button.textContent = "Playing…";
      player.src = row.dataset.audio;
      try { await player.play(); } catch { reset(); }
    });
    player.addEventListener("ended", reset);
    player.addEventListener("error", reset);
  </script>
</body>
</html>
`;
}

async function prepareOutput(output, force) {
  await fs.promises.mkdir(output, { recursive: true });
  const entries = await fs.promises.readdir(output);
  const generated = entries.filter((name) =>
    /^sentence_\d+\.mp3$/.test(name) || GENERATED_FILE_NAMES.has(name),
  );
  if (generated.length > 0 && !force) {
    throw new Error(
      `Output folder already contains generated files: ${output}\nUse --force to replace them.`,
    );
  }
  if (force) {
    await Promise.all(generated.map((name) =>
      fs.promises.rm(path.join(output, name), { force: true }),
    ));
  }
}

async function readTranscription(file) {
  try {
    return JSON.parse(await fs.promises.readFile(file, "utf8"));
  } catch (err) {
    if (err instanceof SyntaxError) throw new Error(`Invalid transcription JSON: ${file}`);
    throw err;
  }
}

async function create(args) {
  const options = parseOptions(args);
  validateOptions(options);
  if (options._.length !== 1) {
    throw new Error("Usage: node tools/linguaslice/cli.js create <input.mp3> [options]");
  }
  if (options.force != null && options.force !== true) {
    throw new Error("--force does not accept a value.");
  }

  const input = path.resolve(options._[0]);
  const language = requiredOptionValue(options.language, "language") || "en";
  const padding = numberOption(options.padding, 0.2, "padding");
  const bitrate = requiredOptionValue(options.bitrate, "bitrate") || "128k";
  const outputOption = requiredOptionValue(options.output, "output");
  const transcriptOption = requiredOptionValue(options["transcript-json"], "transcript-json");
  if (!/^\d+k$/.test(bitrate)) throw new Error("--bitrate must look like 128k or 192k.");
  if (path.extname(input).toLowerCase() !== ".mp3") {
    throw new Error("The input file must have an .mp3 extension.");
  }
  await fs.promises.access(input, fs.constants.R_OK);
  if (!(await commandExists("ffmpeg")) || !(await commandExists("ffprobe"))) {
    throw new Error("FFmpeg and FFprobe must both be installed and available on PATH.");
  }

  const inputParts = path.parse(input);
  const output = path.resolve(
    outputOption || path.join(inputParts.dir, `${inputParts.name}_sentences`),
  );
  await prepareOutput(output, Boolean(options.force));
  const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "linguaslice-"));

  try {
    const duration = await audioDuration(input);
    const transcription = transcriptOption
      ? await readTranscription(path.resolve(transcriptOption))
      : await transcribe(input, temporaryDirectory, language);
    const sentences = buildSentences(transcription, language);
    const clips = addClipBoundaries(sentences, duration, padding);
    console.log(`Found ${clips.length} sentences. Creating MP3 clips...`);

    for (const clip of clips) {
      const filename = clipFilename(clip.number, clips.length);
      process.stdout.write(`  ${filename}\r`);
      await run("ffmpeg", [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        clip.start.toFixed(3),
        "-i",
        input,
        "-t",
        clip.duration.toFixed(3),
        "-map_metadata",
        "-1",
        "-metadata",
        `title=${clip.text}`,
        "-codec:a",
        "libmp3lame",
        "-b:a",
        bitrate,
        path.join(output, filename),
      ]);
    }
    process.stdout.write("\n");

    const title = `${inputParts.name} — LinguaSlice`;
    await Promise.all([
      fs.promises.writeFile(path.join(output, "index.html"), createHtml(title, clips), "utf8"),
      fs.promises.writeFile(
        path.join(output, "segments.json"),
        `${JSON.stringify(clips, null, 2)}\n`,
        "utf8",
      ),
      fs.promises.writeFile(
        path.join(output, "transcript.txt"),
        `${clips.map((clip) => clip.text).join("\n")}\n`,
        "utf8",
      ),
      fs.promises.writeFile(
        path.join(output, "transcription.json"),
        `${JSON.stringify(transcription, null, 2)}\n`,
        "utf8",
      ),
    ]);
    console.log(`Done: ${path.join(output, "index.html")}`);
  } finally {
    await fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function help() {
  console.log(`
LinguaSlice turns a spoken MP3 into sentence clips and an interactive HTML player.

Usage:
  node tools/linguaslice/cli.js create <input.mp3> [options]
  node tools/linguaslice/cli.js help

Options:
  --output <folder>         Output folder (default: <name>_sentences)
  --language <code>        Spoken language code (default: en)
  --padding <seconds>      Silence retained around each sentence (default: 0.2)
  --bitrate <rate>         Output MP3 bitrate (default: 128k)
  --transcript-json <file> Reuse a saved OpenAI verbose_json response
  --force                  Replace LinguaSlice-generated files in the output folder

Environment:
  OPENAI_API_KEY is required unless --transcript-json is supplied.

Examples:
  node tools/linguaslice/cli.js create lesson.mp3
  node tools/linguaslice/cli.js create lesson.mp3 --output downloads/lesson-player
  node tools/linguaslice/cli.js create lesson.mp3 --transcript-json transcription.json
`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    help();
    return;
  }
  if (command === "create") return create(args);
  throw new Error(`Unknown command: ${command}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
