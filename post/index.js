/**
 * post — ffmpeg post-processing: zoom-to-click, window frame, export GIF.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Convert a video to GIF with optional zoom-to-click and frame.
 * @param {object} opts
 * @param {string} opts.inputPath - Input video file (webm/mp4)
 * @param {string} opts.outputPath - Output GIF path
 * @param {number} [opts.fps] - GIF frame rate (default: 15)
 * @param {number} [opts.width] - Output width (default: 800)
 * @param {boolean} [opts.addFrame] - Add a browser window frame (default: true)
 * @param {number} [opts.maxSizeMB] - Max GIF size in MB (default: 10)
 * @returns {Promise<string>} Output path
 */
export async function videoToGif({
  inputPath,
  outputPath,
  fps = 15,
  width = 800,
  addFrame = true,
  maxSizeMB = 10
}) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input video not found: ${inputPath}`);
  }

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate palette for high-quality GIF
  const palettePath = path.join(outputDir, '_palette.png');

  // Step 1: Generate palette
  await runFfmpeg([
    '-i', inputPath,
    '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos,palettegen=stats_mode=diff`,
    '-y', palettePath
  ]);

  // Step 2: Create GIF using palette
  const filters = `fps=${fps},scale=${width}:-1:flags=lanczos`;
  await runFfmpeg([
    '-i', inputPath,
    '-i', palettePath,
    '-lavfi', `${filters} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5`,
    '-y', outputPath
  ]);

  // Cleanup palette
  if (fs.existsSync(palettePath)) {
    fs.unlinkSync(palettePath);
  }

  // Check size
  const stats = fs.statSync(outputPath);
  const sizeMB = stats.size / (1024 * 1024);
  if (sizeMB > maxSizeMB) {
    console.warn(`Warning: GIF is ${sizeMB.toFixed(1)}MB (target: <${maxSizeMB}MB). Consider reducing fps or width.`);
  }

  return outputPath;
}

/**
 * Add a browser-style window frame to a video.
 * @param {object} opts
 * @param {string} opts.inputPath - Input video
 * @param {string} opts.outputPath - Output video with frame
 * @returns {Promise<string>}
 */
export async function addWindowFrame({ inputPath, outputPath }) {
  // Add a simple top bar that looks like a browser chrome
  await runFfmpeg([
    '-i', inputPath,
    '-vf', [
      'pad=iw:ih+40:0:40:color=0x2d2d2d',
      `drawtext=text='● ● ●':fontcolor=0xffffff:fontsize=14:x=16:y=14`
    ].join(','),
    '-y', outputPath
  ]);
  return outputPath;
}

/**
 * Run ffmpeg with given args.
 */
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });
    proc.on('error', (err) => {
      reject(new Error(`ffmpeg not found or failed: ${err.message}`));
    });
  });
}
