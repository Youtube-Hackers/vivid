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

import { Router } from 'express';
import fetch from 'node-fetch';
import { getProxyAgent } from '../../extractor/proxyManager.js';
const router = Router();
const CHUNK_SIZE = 4 * 1024 * 1024;

router.get('/stream', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url parameter' });
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    const host = parsedUrl.hostname;
    const isAllowed = host === 'googlevideo.com' || host.endsWith('.googlevideo.com');
    if (!isAllowed) {
      return res.status(403).json({ error: 'Domain not allowed' });
    }

    const reqHeaders = { 'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'identity' };
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      const start = Number(range[1]);
      const end = Math.min(range[2] ? Number(range[2]) : Infinity, start + CHUNK_SIZE - 1);
      reqHeaders.Range = `bytes=${start}-${end}`;
    }

    const controller = new AbortController();
    res.on('close', () => controller.abort());

    const fetchArgs = { headers: reqHeaders, signal: controller.signal };
    const agent = getProxyAgent();
    if (agent) fetchArgs.agent = agent;

    const response = await fetch(url, fetchArgs);

    if (!response.ok) return res.status(response.status).json({ error: 'Upstream error' });

    const headersToForward = ['content-type', 'content-length', 'accept-ranges', 'content-range'];
    for (const h of headersToForward) {
      if (response.headers.get(h)) res.set(h, response.headers.get(h));
    }
    if (!response.headers.get('accept-ranges')) res.set('accept-ranges', 'bytes');
    res.status(response.status);

    response.body.on('error', () => res.destroy());
    response.body.pipe(res);
  } catch (e) {
    if (e.name === 'AbortError') return;
    res.status(500).json({ error: e.message });
  }
});

router.get('/image', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url parameter' });

    const allowed = ['i.ytimg.com', 'yt3.ggpht.com', 'yt3.googleusercontent.com', 'lh3.googleusercontent.com'];
    const parsed = new URL(url);
    if (!allowed.some(d => parsed.hostname.endsWith(d))) {
      return res.status(403).json({ error: 'Domain not allowed' });
    }

    const fetchArgs = {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    };
    const agent = getProxyAgent();
    if (agent) fetchArgs.agent = agent;

    const response = await fetch(url, fetchArgs);

    if (!response.ok) return res.status(response.status).end();

    const contentType = response.headers.get('content-type');
    if (contentType) res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');

    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
