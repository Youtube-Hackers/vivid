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

export async function getCaptionTracks(client, videoId) {
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
