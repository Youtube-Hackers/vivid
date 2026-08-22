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
const router = Router();

router.get('/:id', async (req, res) => {
  try {
    const result = await req.extractor.getCaptionTracks(req.params.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/:lang', async (req, res) => {
  try {
    const { lang } = req.params;
    const { tlang } = req.query;
    const tracks = await req.extractor.getCaptionTracks(req.params.id);
    const track = tracks.baseLanguages.find(t => t.languageCode === lang);
    if (!track) return res.status(404).json({ error: `No caption track for language: ${lang}` });
    const result = await req.extractor.getCaptionContent(track.baseUrl, tlang || '');
    
    let vtt = 'WEBVTT\n\n';
    function fmtMs(seconds) {
      const date = new Date(seconds * 1000);
      const hh = String(date.getUTCHours()).padStart(2, '0');
      const mm = String(date.getUTCMinutes()).padStart(2, '0');
      const ss = String(date.getUTCSeconds()).padStart(2, '0');
      const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
      return `${hh}:${mm}:${ss}.${ms}`;
    }
    for (const cap of result.captions || []) {
      vtt += `${fmtMs(cap.startTime)} --> ${fmtMs(cap.endTime)}\n${cap.content}\n\n`;
    }
    res.set('Content-Type', 'text/vtt');
    res.send(vtt);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
