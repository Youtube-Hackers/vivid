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
import { MWEB, ANDROID, ANDROID_REEL, VISIONOS, VISIONOS_1_02, WEB, getInnertubeApiUrl, API_URL, MOBILE_API_URL, DEFAULT_LANG, DEFAULT_COUNTRY, LANG_TO_COUNTRY } from './constants.js';
import { getProxyAgent } from './proxyManager.js';

class InnerTubeClient {
  constructor(options = {}) {
    this.language = options.language || DEFAULT_LANG;
    this.country = options.country || LANG_TO_COUNTRY[options.language] || DEFAULT_COUNTRY;
    this.visitorData = null;
  }

  setLanguage(langCode) {
    this.language = langCode;
    const mapping = {
      'en': 'US',
      'ja': 'JP',
      'de': 'DE',
      'fr': 'FR',
      'it': 'IT',
      'es': 'MX'
    };
    this.country = mapping[langCode] || 'US';
  }

  _makeContext(client) {
    const ctx = {
      client: {
        hl: this.language,
        gl: this.country,
        clientName: client.clientName,
        clientVersion: client.clientVersion,
      }
    };

    if (client.osName) ctx.client.osName = client.osName;
    if (client.osVersion) ctx.client.osVersion = client.osVersion;
    if (client.androidSdkVersion) ctx.client.androidSdkVersion = String(client.androidSdkVersion);
    if (client.platform) ctx.client.platform = client.platform;
    if (this.visitorData) ctx.client.visitorData = this.visitorData;

    return ctx;
  }

  _headers(client) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept-Language': `${this.language};q=0.9`,
      'User-Agent': client.userAgent,
    };

    if (client.clientName === 'WEB' || client.clientName === 'MWEB') {
      headers['X-YouTube-Client-Name'] = client.clientId;
      headers['X-YouTube-Client-Version'] = client.clientVersion;
    }

    if (client.clientName === 'VISIONOS' || client.clientName === 'ANDROID') {
      headers['X-Goog-Api-Format-Version'] = '2';
      headers['X-Youtube-Client-Name'] = client.clientName;
      headers['X-Youtube-Client-Version'] = client.clientVersion;
    }

    if (this.visitorData) {
      headers['X-Goog-Visitor-Id'] = this.visitorData;
    }

    return headers;
  }

  async _post(url, body, client = MWEB, extraHeaders = {}, agent = undefined) {
    const headers = { ...this._headers(client), ...extraHeaders };
    const fetchArgs = {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    };
    const useAgent = agent !== undefined ? agent : getProxyAgent();
    if (useAgent) {
      fetchArgs.agent = useAgent;
    }
    const res = await fetch(url, fetchArgs);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`InnerTube POST ${url}: ${res.status} - ${text.substring(0, 200)}`);
    }

    const result = await res.json();
    
    const vd = result?.responseContext?.visitorData;
    if (vd) {
      this.visitorData = vd;
    }

    return result;
  }

  async _get(url, extraHeaders = {}) {
    const headers = {
      'Accept-Language': `${this.language};q=0.9`,
      'User-Agent': MWEB.userAgent,
      ...extraHeaders,
    };

    const fetchArgs = { headers };
    const agent = getProxyAgent();
    if (agent) fetchArgs.agent = agent;

    const res = await fetch(url, fetchArgs);

    if (!res.ok) {
      throw new Error(`InnerTube GET ${url}: ${res.status}`);
    }

    return res;
  }

  async fetchVisitorData() {
    try {
      const fetchArgs = {
        headers: {
          'Origin': 'https://www.youtube.com',
          'Referer': 'https://www.youtube.com/',
        }
      };
      const agent = getProxyAgent();
      if (agent) fetchArgs.agent = agent;
      const res = await fetch('https://www.youtube.com/sw.js_data', fetchArgs);
      const text = await res.text();
      const cleaned = text.replace(/^\)\]\}'\n/, '');
      const json = JSON.parse(cleaned);
      const visitorData = json?.[0]?.[2]?.[0]?.[0]?.[13];
      if (visitorData) {
        this.visitorData = visitorData;
      }
      return visitorData || null;
    } catch (e) {
      console.error('[InnerTube] Failed to fetch visitor data:', e.message);
      return null;
    }
  }

  async search(query, params = null, continuation = null) {
    const body = {
      context: this._makeContext(MWEB),
      query,
    };
    if (params) body.params = params;
    if (continuation) body.continuation = continuation;

    return this._post(getInnertubeApiUrl('search'), body, MWEB);
  }

  async searchContinuation(continuationToken) {
    const body = {
      context: this._makeContext(MWEB),
      continuation: continuationToken,
    };
    return this._post(getInnertubeApiUrl('search'), body, MWEB);
  }

  async liveChat(continuation) {
    const body = {
      context: this._makeContext(MWEB),
      continuation,
    };
    return this._post(getInnertubeApiUrl('live_chat/get_live_chat'), body, MWEB);
  }

  async browse(browseId, params = null, continuation = null) {
    const body = {
      context: this._makeContext(MWEB),
    };
    if (browseId) body.browseId = browseId;
    if (params) body.params = params;
    if (continuation) body.continuation = continuation;

    return this._post(getInnertubeApiUrl('browse'), body, MWEB);
  }
  async browseAndroid(browseId, params = null, continuation = null) {
    const body = {
      context: this._makeContext(ANDROID),
    };
    if (browseId) body.browseId = browseId;
    if (params) body.params = params;
    if (continuation) body.continuation = continuation;

    return this._post("https://youtubei.googleapis.com/youtubei/v1/browse", body, ANDROID);
  }
  async browseWeb(browseId, params = null, continuation = null) {
    const body = {
      context: this._makeContext(WEB),
    };
    if (browseId) body.browseId = browseId;
    if (params) body.params = params;
    if (continuation) body.continuation = continuation;

    return this._post(getInnertubeApiUrl('browse'), body, WEB);
  }

  async next(videoId, playlistId = null) {
    const body = {
      context: this._makeContext(MWEB),
      videoId,
    };
    if (playlistId) body.playlistId = playlistId;

    return this._post(getInnertubeApiUrl('next'), body, MWEB);
  }

  async nextContinuation(continuationToken) {
    const body = {
      context: this._makeContext(MWEB),
      continuation: continuationToken,
    };
    return this._post(getInnertubeApiUrl('next'), body, MWEB);
  }

  async player(videoId, includePlaybackContext = true, client = MWEB) {
    const body = {
      context: this._makeContext(client),
      videoId,
    };
    if (includePlaybackContext) {
      body.playbackContext = {
        contentPlaybackContext: {
          signatureTimestamp: '0',
        }
      };
    }
    const url = client.apiUrl === MOBILE_API_URL ? getInnertubeApiUrl('player') : `https://www.youtube.com/youtubei/v1/player`;
    return this._post(url, body, client);
  }

  async visionOsPlayer(videoId, useSecondaryVersion = false) {
    const client = useSecondaryVersion ? VISIONOS_1_02 : VISIONOS;

    if (!this.visitorData) {
      await this.fetchVisitorData();
    }

    const ctx = this._makeContext(client);
    ctx.client.originalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    ctx.request = { useSsl: true };
    ctx.user = { enableSafetyMode: false, lockedSafetyMode: false };

    const body = {
      videoId,
      context: ctx,
      contentCheckOk: true,
      racyCheckOk: true,
      playbackContext: {
        contentPlaybackContext: {
          html5Preference: 'HTML5_PREF_WANTS',
        },
      },
    };

    const url = `https://www.youtube.com/youtubei/v1/player`;
    return this._post(url, body, client);
  }

  async reelPlayer(videoId) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let cpn = '';
    for (let i = 0; i < 16; i++) cpn += chars.charAt(Math.floor(Math.random() * chars.length));

    if (!this.visitorData) {
      await this.fetchVisitorData();
    }

    const body = {
      context: this._makeContext(ANDROID_REEL),
      playerRequest: {
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      },
      disablePlayerResponse: false,
      cpn,
    };

    const endpoint = 'reel/reel_item_watch?fields=playerResponse.streamingData,playerResponse.playabilityStatus';
    const url = `${API_URL}${endpoint}&prettyPrint=false`;

    const result = await this._post(url, body, ANDROID_REEL);
    return { ...(result.playerResponse || result), cpn };
  }

  async getCommentsLegacy(continuationToken) {
    const url = `https://m.youtube.com/watch_comment?action_get_comments=1&pbj=1&ctoken=${encodeURIComponent(continuationToken)}`;
    const res = await this._get(url, {
      'X-YouTube-Client-Version': '2.20210714.00.00',
      'X-YouTube-Client-Name': '2',
    });
    return res.json();
  }

  async getPage(url) {
    const res = await this._get(url);
    return res.text();
  }

  async getDesktopPage(url) {
    const fetchArgs = {
      headers: {
        'User-Agent': WEB.userAgent,
        'Accept-Language': `${this.language};q=0.9`,
      },
    };
    const agent = getProxyAgent();
    if (agent) fetchArgs.agent = agent;
    const res = await fetch(url, fetchArgs);
    if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
    return res.text();
  }

  async browseAndroid(browseId) {
    const body = {
      context: this._makeContext(MWEB),
      browseId,
    };
    return this._post(getInnertubeApiUrl('browse'), body, MWEB);
  }
}

export default InnerTubeClient;
