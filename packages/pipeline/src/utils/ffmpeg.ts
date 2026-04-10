import { execFile } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs/promises";

const exec = promisify(execFile);

interface AssemblyOptions {
  clips: Array<{ path: string; duration: number }>;
  outputDir: string;
  musicPath: string | null;
  transitionDuration: number;
  overlay: {
    address: string;
    price: string;
    details: string; // "4 BD | 3 BA"
    agent: string;
    brokerage: string | null;
  };
}

export async function assembleVideo(opts: AssemblyOptions): Promise<{
  horizontalPath: string;
  verticalPath: string;
}> {
  await fs.mkdir(opts.outputDir, { recursive: true });

  const concatListPath = path.join(opts.outputDir, "concat.txt");
  const rawPath = path.join(opts.outputDir, "raw_concat.mp4");
  const withTransitionsPath = path.join(opts.outputDir, "with_transitions.mp4");
  const withAudioPath = path.join(opts.outputDir, "with_audio.mp4");
  const horizontalPath = path.join(opts.outputDir, "final_horizontal.mp4");
  const verticalPath = path.join(opts.outputDir, "final_vertical.mp4");

  // Step 1: Normalize all clips to consistent format
  const normalizedPaths: string[] = [];
  for (let i = 0; i < opts.clips.length; i++) {
    const normPath = path.join(opts.outputDir, `norm_${i}.mp4`);
    await exec("ffmpeg", [
      "-i", opts.clips[i].path,
      "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1",
      "-r", "30",
      "-c:v", "libx264",
      "-preset", "fast",
      "-pix_fmt", "yuv420p",
      "-an",
      "-y",
      normPath,
    ]);
    normalizedPaths.push(normPath);
  }

  // Step 2: Build xfade filter chain for crossfade transitions
  if (normalizedPaths.length === 1) {
    await fs.copyFile(normalizedPaths[0], withTransitionsPath);
  } else {
    const td = opts.transitionDuration;
    const filterParts: string[] = [];
    let prevLabel = "[0:v]";
    let runningOffset = opts.clips[0].duration - td;

    for (let i = 1; i < normalizedPaths.length; i++) {
      const outLabel = i === normalizedPaths.length - 1 ? "[outv]" : `[v${i}]`;
      filterParts.push(
        `${prevLabel}[${i}:v]xfade=transition=fade:duration=${td}:offset=${runningOffset.toFixed(2)}${outLabel}`
      );
      prevLabel = outLabel;
      if (i < normalizedPaths.length - 1) {
        runningOffset += opts.clips[i].duration - td;
      }
    }

    const inputs = normalizedPaths.flatMap((p) => ["-i", p]);
    await exec("ffmpeg", [
      ...inputs,
      "-filter_complex", filterParts.join(";"),
      "-map", "[outv]",
      "-c:v", "libx264",
      "-preset", "fast",
      "-pix_fmt", "yuv420p",
      "-y",
      withTransitionsPath,
    ]);
  }

  // Step 3: Add audio track (if provided)
  const videoBeforeOverlay = opts.musicPath
    ? withAudioPath
    : withTransitionsPath;

  if (opts.musicPath) {
    // Get video duration for audio fade
    const { stdout } = await exec("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      withTransitionsPath,
    ]);
    const videoDuration = parseFloat(JSON.parse(stdout).format.duration);
    const fadeStart = Math.max(0, videoDuration - 2);

    await exec("ffmpeg", [
      "-i", withTransitionsPath,
      "-i", opts.musicPath,
      "-filter_complex",
      `[1:a]afade=t=in:d=0.5,afade=t=out:st=${fadeStart.toFixed(1)}:d=2[a]`,
      "-map", "0:v",
      "-map", "[a]",
      "-shortest",
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "192k",
      "-y",
      withAudioPath,
    ]);
  }

  // Step 4: Add text overlays (opening and closing cards)
  const { stdout: durOut } = await exec("ffprobe", [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    videoBeforeOverlay,
  ]);
  const totalDuration = parseFloat(JSON.parse(durOut).format.duration);
  const closingStart = totalDuration - 4;

  const priceFormatted = opts.overlay.price;
  const closingLine = opts.overlay.brokerage
    ? `${opts.overlay.agent} | ${opts.overlay.brokerage}`
    : opts.overlay.agent;

  // Use drawtext for overlays
  const drawFilters = [
    // Opening: address (first 2.5 seconds)
    `drawtext=text='${escapeFFmpegText(opts.overlay.address)}':fontsize=48:fontcolor=white:borderw=2:bordercolor=black@0.6:x=(w-tw)/2:y=h-140:enable='between(t,0.5,2.5)'`,
    // Closing: price + details
    `drawtext=text='${escapeFFmpegText(priceFormatted)} | ${escapeFFmpegText(opts.overlay.details)}':fontsize=42:fontcolor=white:borderw=2:bordercolor=black@0.6:x=(w-tw)/2:y=h-160:enable='between(t,${closingStart},${totalDuration})'`,
    // Closing: agent line
    `drawtext=text='${escapeFFmpegText(closingLine)}':fontsize=32:fontcolor=white:borderw=2:bordercolor=black@0.6:x=(w-tw)/2:y=h-110:enable='between(t,${closingStart},${totalDuration})'`,
  ];

  await exec("ffmpeg", [
    "-i", videoBeforeOverlay,
    "-vf", drawFilters.join(","),
    "-c:v", "libx264",
    "-preset", "fast",
    "-pix_fmt", "yuv420p",
    "-c:a", "copy",
    "-y",
    horizontalPath,
  ]);

  // Step 5: Create 9:16 vertical version (center crop)
  await exec("ffmpeg", [
    "-i", horizontalPath,
    "-vf", "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920",
    "-c:v", "libx264",
    "-preset", "fast",
    "-pix_fmt", "yuv420p",
    "-c:a", "copy",
    "-y",
    verticalPath,
  ]);

  // Clean up intermediate files
  const intermediates = [
    ...normalizedPaths,
    concatListPath,
    rawPath,
    withTransitionsPath,
    withAudioPath,
  ];
  for (const f of intermediates) {
    await fs.unlink(f).catch(() => {});
  }

  return { horizontalPath, verticalPath };
}

function escapeFFmpegText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "'\\''")
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}
