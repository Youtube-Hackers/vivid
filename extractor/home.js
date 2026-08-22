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

import fetch from 'node-fetch';
import { getProxyAgent } from './proxyManager.js';

export async function getTrending(client) {
  const result = {
    videos: [],
    continuationToken: '',
    error: '',
  };

  const url = "https://www.youtube.com/youtubei/v1/browse";

  const payload = {
    context: {
      client: {
        clientName: "ANDROID",
        clientVersion: "21.12.525",
        osName: "Android",
        osVersion: "14",
        androidSdkVersion: 34,
        hl: "de",
        gl: "DE",
        utcOffsetMinutes: 60
      },
      user: {
        lockedSafetyMode: false
      }
    },
    browseId: "FEhype_leaderboard"
  };

  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "com.google.android.youtube/19.51.37 (Linux; U; Android 14; de_DE; Quest 3) gzip",
    "X-Goog-Api-Format-Version": "2",
    "Origin": "https://www.youtube.com"
  };

  try {
    const fetchArgs = {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: headers
    };
    const agent = getProxyAgent();
    if (agent) fetchArgs.agent = agent;

    const response = await fetch(url, fetchArgs);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    const tabs = data?.contents?.singleColumnBrowseResultsRenderer?.tabs ||
    data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];

    for (const tab of tabs) {
      const sections = tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      for (const section of sections) {

        if (section.itemSectionRenderer) {
          for (const item of section.itemSectionRenderer.contents || []) {

            if (item.elementRenderer) {
              const element = item.elementRenderer?.newElement?.type?.componentType;
              const compact = element?.model?.compactVideoModel?.compactVideoData;
              if (compact) {
                const video = parseCompactVideoModel(compact, item.elementRenderer);
                if (video) result.videos.push(video);
              }
            }

            if (item.compactVideoRenderer) {
              result.videos.push(parseClassic(item.compactVideoRenderer));
            }
          }
        }
      }
    }

  } catch (e) {
    result.error = `[Hype] ${e.message}`;
  }

  return result;
}

function parseCompactVideoModel(compact, elementRenderer) {
  const videoId = compact?.onTap?.innertubeCommand?.watchEndpoint?.videoId;
  if (!videoId) return null;

  const metadata = compact.videoData?.metadata || {};
  const thumbnail = compact.videoData?.thumbnail || {};

  const video = {
    type: 'video',
    videoId: videoId,
    url: `/watch?v=${videoId}`,
    title: metadata.title || '',
    duration: thumbnail.timestampText || '',
    author: metadata.byline || '',
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    views: '',
    publishDate: '',
  };

  const accessText = compact.accessibilityText || elementRenderer?.accessibilityText || '';
  if (accessText) {
    const parts = accessText.split(' - ');
    if (parts.length >= 6) {
      video.views = parts[4];
      video.publishDate = parts[5];
    }
  }

  return video;
}

function parseClassic(v) {
  return {
    type: 'video',
    videoId: v.videoId,
    url: `/watch?v=${v.videoId}`,
    title: v.title?.runs?.[0]?.text || v.title?.simpleText || '',
    duration: v.lengthText?.simpleText || '',
    author: v.shortBylineText?.runs?.[0]?.text || '',
    thumbnailUrl: v.thumbnail?.thumbnails?.[0]?.url || '',
    views: v.viewCountText?.simpleText || '',
    publishDate: v.publishedTimeText?.simpleText || '',
  };
}

export default { getTrending };
