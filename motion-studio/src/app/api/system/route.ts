import { handle, json } from "@/server/http";
import { run } from "@/server/media";
import { DATA_DIR, binPath } from "@/server/paths";

export async function GET() {
  return handle(async () => {
    let ffmpeg = "indisponível";
    try {
      const { stdout } = await run("ffmpeg", ["-version"]);
      ffmpeg = stdout.toString().split("\n")[0];
    } catch {}
    return json({ ffmpeg, ffmpegPath: binPath("ffmpeg"), dataDir: DATA_DIR, node: process.version, platform: process.platform });
  });
}
