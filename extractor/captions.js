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

import { getTextFromObject } from './utils.js';
import fetch from 'node-fetch';
import { getProxyAgent } from './proxyManager.js';
import { forceYtDlp, isYtDlpAvailable, getYtDlpInfo } from './ytdlp.js';

async function getCaptionTracksViaInnertube(client, videoId) {
  const result = { baseLanguages: [], translationLanguages: [], error: '' };
  try {
    let data = await client.player(videoId, false);
    let captions = data?.captions?.playerCaptionsTracklistRenderer;
    
    if (!captions) {
      const { ANDROID } = await import('./constants.js');
      data = await client.player(videoId, true, ANDROID);
      captions = data?.captions?.playerCaptionsTracklistRenderer;
    }

    if (!captions) return result;

    for (const track of captions.captionTracks || []) {
      result.baseLanguages.push({
        name: getTextFromObject(track.name) || '',
        languageCode: track.languageCode || '',
        baseUrl: track.baseUrl || '',
        isTranslatable: track.isTranslatable || false,
      });
    }
    for (const lang of captions.translationLanguages || []) {
      result.translationLanguages.push({
        name: getTextFromObject(lang.languageName) || '',
        languageCode: lang.languageCode || '',
      });
    }
  } catch (e) { result.error = e.message; }
  return result;
}

async function getCaptionTracksViaYtdlp(videoId) {
  const result = { baseLanguages: [], translationLanguages: [], error: '' };
  const info = await getYtDlpInfo(videoId);
  const pickUrl = (formats) => (formats.find(f => f.ext === 'json3') || formats[0])?.url || '';

  for (const [code, formats] of Object.entries(info.subtitles || {})) {
    if (code === 'live_chat') continue;
    result.baseLanguages.push({
      name: formats[0]?.name || code,
      languageCode: code,
      baseUrl: pickUrl(formats),
      isTranslatable: false,
    });
  }

  for (const [code, formats] of Object.entries(info.automatic_captions || {})) {
    const name = formats[0]?.name || code;
    if (!code.endsWith('-orig')) {
      result.translationLanguages.push({ name, languageCode: code });
      continue;
    }
    const languageCode = code.replace(/-orig$/, '');
    if (result.baseLanguages.some(t => t.languageCode === languageCode)) continue;
    result.baseLanguages.push({ name, languageCode, baseUrl: pickUrl(formats), isTranslatable: true });
  }

  return result;
}

export async function getCaptionTracks(client, videoId) {
  if (forceYtDlp()) {
    try {
      return await getCaptionTracksViaYtdlp(videoId);
    } catch (e) {
      return { baseLanguages: [], translationLanguages: [], error: `yt-dlp failed (FORCE-YT-DLP is enabled): ${e.message}` };
    }
  }

  const result = await getCaptionTracksViaInnertube(client, videoId);
  if (result.baseLanguages.length || !(await isYtDlpAvailable())) return result;

  try {
    return await getCaptionTracksViaYtdlp(videoId);
  } catch {
    return result;
  }
}

export async function getCaptionContent(baseUrl, translationLang = '') {
  try {
    const captionUrl = new URL(baseUrl);
    if (translationLang) captionUrl.searchParams.set('tlang', translationLang);
    captionUrl.searchParams.set('fmt', 'json3');
    captionUrl.searchParams.set('xorb', '2');
    captionUrl.searchParams.set('xobt', '3');
    captionUrl.searchParams.set('xovt', '3');
    
    const url = captionUrl.toString();
    const fetchArgs = {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36' }
    };
    const agent = getProxyAgent();
    if (agent) fetchArgs.agent = agent;
    const res = await fetch(url, fetchArgs);
    if (!res.ok) throw new Error(`Failed to fetch captions: ${res.status}`);
    const data = await res.json();
    const captions = [];
    for (const event of data.events || []) {
      if (!event.segs) continue;
      captions.push({
        startTime: (event.tStartMs || 0) / 1000,
        endTime: ((event.tStartMs || 0) + (event.dDurationMs || 0)) / 1000,
        content: (event.segs || []).map(s => s.utf8 || '').join(''),
      });
    }
    return { captions, error: '' };
  } catch (e) { return { captions: [], error: e.message }; }
}

export default { getCaptionTracks, getCaptionContent };
