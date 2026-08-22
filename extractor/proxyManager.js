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

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SocksProxyAgent } from 'socks-proxy-agent';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROXIES_FILE = path.resolve(__dirname, '..', 'proxies.txt');

let cachedAgents = [];
let cachedMtimeMs = -1;
let cursor = 0;
let warnedInvalid = new Set();

function isSocksUrl(line) {
  return /^socks[45]?:\/\//i.test(line);
}
function loadProxies() {
  let stat;
  try {
    stat = fs.statSync(PROXIES_FILE);
  } catch {
    cachedAgents = [];
    cachedMtimeMs = -1;
    return cachedAgents;
  }
  if (stat.mtimeMs === cachedMtimeMs) {
    return cachedAgents;
  }
  let lines = [];
  try {
    const raw = fs.readFileSync(PROXIES_FILE, 'utf8');
    lines = raw
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));
  } catch (e) {
    lines = [];
  }
  const agents = [];
  for (const line of lines) {
    if (!isSocksUrl(line)) {
      continue;
    }
    try {
      const proxyUrl = /^socks5:\/\//i.test(line) ? line.replace(/^socks5:\/\//i, 'socks5h://') : line;
      const agent = new SocksProxyAgent(proxyUrl, { timeout: 10000 });
      agents.push(agent);
    } catch (e) {
    }
  }
  cachedAgents = agents;
  cachedMtimeMs = stat.mtimeMs;
  cursor = 0;
  return cachedAgents;
}

export function hasProxies() {
  return loadProxies().length > 0;
}

export function getProxyAgent() {
  const agents = loadProxies();
  if (agents.length === 0) return null;
  const agent = agents[cursor % agents.length];
  cursor = (cursor + 1) % agents.length;
  return agent;
}

export function reloadProxies() {
  cachedMtimeMs = -1;
  return loadProxies();
}

export default { hasProxies, getProxyAgent, reloadProxies };
