// Instala a IA local de transcrição (whisper.cpp + modelo). Roda uma vez:
//   node scripts/setup-ia.mjs [modelo]     (padrão: small)
// O app também instala sozinho na primeira transcrição; este script só adianta o download.
import path from "node:path";
import { downloadWhisperModel, installWhisperCpp } from "@remotion/install-whisper-cpp";

const DATA_DIR = process.env.MOTION_STUDIO_DATA ?? path.join(process.cwd(), "data");
const VERSION = "1.5.5";
const model = process.argv[2] ?? "small";
const to = path.join(DATA_DIR, "tools", `whisper-${VERSION}`);

console.log(`Instalando whisper.cpp ${VERSION} em ${to}…`);
await installWhisperCpp({ version: VERSION, to, printOutput: true });
console.log(`Baixando modelo "${model}"…`);
let last = -1;
await downloadWhisperModel({
  model,
  folder: to,
  printOutput: false,
  onProgress: (downloaded, total) => {
    const pct = Math.floor((downloaded / total) * 100);
    if (pct !== last && pct % 10 === 0) console.log(`  ${pct}%`);
    last = pct;
  },
});
console.log("IA local pronta.");
