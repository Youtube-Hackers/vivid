/*
 * Vivid - A privacy focused alternative YouTube frontend inspired by Invidious and Nitter
 * Copyright (C) 2026  TheErrorExe, zUnpaid
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const COOKIES_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'cookies.txt');
const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map();
let available = null;

const ytDlpBinary = () => process.env['YT-DLP-PATH'] || process.env.YT_DLP_PATH || 'yt-dlp';

export const forceYtDlp = () => ['true', '1'].includes(String(process.env['FORCE-YT-DLP'] ?? process.env.FORCE_YT_DLP).toLowerCase());

export async function isYtDlpAvailable() {
  if (available !== null) return available;
  try {
    await execFileAsync(ytDlpBinary(), ['--version']);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export function getYtDlpInfo(videoId) {
  const cached = cache.get(videoId);
  if (cached && Date.now() - cached.time < CACHE_TTL) return cached.promise;

  for (const [id, entry] of cache) {
    if (Date.now() - entry.time >= CACHE_TTL) cache.delete(id);
  }

  const args = ['-J', '--no-warnings', '--no-playlist', '--skip-download'];
  if (fs.existsSync(COOKIES_FILE)) args.push('--cookies', COOKIES_FILE);
  args.push(`https://www.youtube.com/watch?v=${videoId}`);

  const promise = execFileAsync(ytDlpBinary(), args, { maxBuffer: 1024 * 1024 * 64 })
    .then(({ stdout }) => JSON.parse(stdout));
  promise.catch(() => cache.delete(videoId));
  cache.set(videoId, { promise, time: Date.now() });
  return promise;
}
