import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";

const width = 960;
const height = 540;
const fps = 24;
const frames = 144;
const scenes = [
  ["01", "INSTRUMENT IDENTITY", "EXACT CHAIN / EXACT CONTRACT", "A RECORD BEGINS WITH ITS DEPLOYMENT"],
  ["02", "ISSUER OBSERVATION", "SOURCE / UNIT / TIME", "REFERENCES RETAIN THEIR PROVENANCE"],
  ["03", "VENUE ESTIMATE", "INPUT SIZE / ROUTE / EXPIRY", "A QUOTE IS CHECKED FOR ONE AMOUNT"],
  ["04", "ACTION POLICY", "DIRECTION / LIMIT / EVIDENCE", "A CHECK EXPLAINS ITS RESULT"],
];

function frameSvg(index) {
  const seconds = index / fps;
  const phase = seconds / 1.5;
  const sceneIndex = Math.min(Math.floor(phase), 3);
  const local = phase - sceneIndex;
  const label = scenes[sceneIndex];
  const fade = Math.min(1, local * 5, (1 - local) * 5 + .15);
  const y = 50 - Math.min(1, local * 4) * 22;
  const beam = 370 + (index / frames) * 500;
  const grid = Array.from({ length: 12 }, (_, item) => `<line x1="${item * 88 + 5}" y1="0" x2="${item * 88 + 5}" y2="540" stroke="#3b5b40" stroke-opacity=".28"/>`).join("");
  const horizontal = Array.from({ length: 8 }, (_, item) => `<line x1="0" y1="${item * 78 + 4}" x2="960" y2="${item * 78 + 4}" stroke="#3b5b40" stroke-opacity=".28"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 960 540"><defs><radialGradient id="halo"><stop stop-color="#294132"/><stop offset="1" stop-color="#101a16"/></radialGradient><linearGradient id="beam"><stop stop-color="#bceb82" stop-opacity="0"/><stop offset=".5" stop-color="#bceb82" stop-opacity=".75"/><stop offset="1" stop-color="#bceb82" stop-opacity="0"/></linearGradient></defs><rect width="960" height="540" fill="url(#halo)"/><g>${grid}${horizontal}</g><circle cx="666" cy="270" r="230" fill="none" stroke="#71896b" stroke-opacity=".35"/><circle cx="666" cy="270" r="155" fill="none" stroke="#bceb82" stroke-opacity=".36"/><circle cx="666" cy="270" r="84" fill="#14231a" stroke="#bceb82" stroke-opacity=".8"/><line x1="${beam}" y1="0" x2="${beam}" y2="540" stroke="url(#beam)" stroke-width="3"/><text x="42" y="44" fill="#bdd39a" font-family="Arial" font-size="12" letter-spacing="3">STOCKSCOPE / RESEARCH SEQUENCE</text><text x="866" y="44" fill="#849b88" font-family="Arial" font-size="12">${String(index).padStart(4, "0")}</text><g opacity="${Math.max(0, fade)}" transform="translate(0 ${y})"><rect x="440" y="156" width="445" height="234" rx="3" fill="#121d18" fill-opacity=".94" stroke="#799d69"/><rect x="440" y="156" width="445" height="37" fill="#203322"/><text x="460" y="181" fill="#bceb82" font-family="Arial" font-size="12" letter-spacing="2">EVIDENCE LAYER ${label[0]}</text><text x="462" y="245" fill="#ecf2e8" font-family="Arial" font-size="25" letter-spacing="1">${label[1]}</text><line x1="462" y1="266" x2="858" y2="266" stroke="#3b5b40"/><text x="462" y="301" fill="#bceb82" font-family="Arial" font-size="13" letter-spacing="1">${label[2]}</text><text x="462" y="342" fill="#9aafa0" font-family="Arial" font-size="11" letter-spacing="1">${label[3]}</text></g><text x="44" y="500" fill="#718875" font-family="Arial" font-size="11" letter-spacing="2">IDENTITY → SOURCE → ROUTE → POLICY</text><line x1="44" y1="512" x2="${44 + (index / frames) * 340}" y2="512" stroke="#bceb82" stroke-width="2"/></svg>`;
}

if (!ffmpegPath) throw new Error("ffmpeg binary unavailable");
const temporary = await mkdtemp(path.join(os.tmpdir(), "stockscope-film-"));
const output = path.resolve("public/media");
await mkdir(output, { recursive: true });
try {
  for (let index = 0; index < frames; index++) await sharp(Buffer.from(frameSvg(index))).png().toFile(path.join(temporary, `${String(index).padStart(4, "0")}.png`));
  await sharp(Buffer.from(frameSvg(18))).webp({ quality: 85 }).toFile(path.join(output, "stockscope-poster.webp"));
  await new Promise((resolve, reject) => {
    const process = spawn(ffmpegPath, ["-loglevel", "error", "-y", "-framerate", String(fps), "-i", path.join(temporary, "%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "25", "-movflags", "+faststart", "-an", path.join(output, "stockscope-film.mp4")], { stdio: "inherit" });
    process.on("error", reject);
    process.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });
  console.log("Generated abstract film and poster from first-party graphics.");
} finally {
  if (path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temporary).startsWith("stockscope-film-")) await rm(temporary, { recursive: true, force: true });
}
