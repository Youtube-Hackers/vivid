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

const STREAM_CLIENT_CHAIN = [
  { key: 'VISIONOS_1_03', fetch: (client, videoId) => client.visionOsPlayer(videoId, false) },
  { key: 'VISIONOS_1_02', fetch: (client, videoId) => client.visionOsPlayer(videoId, true) },
  { key: 'ANDROID_REEL', fetch: (client, videoId) => client.reelPlayer(videoId) },
];

function isUsableStreamingData(data) {
  const status = data?.playabilityStatus?.status || '';
  if (status !== 'OK') return false;
  const sd = data?.streamingData;
  if (!sd) return false;
  const hasFormats = (sd.formats && sd.formats.length) || (sd.adaptiveFormats && sd.adaptiveFormats.length);
  return !!(hasFormats || sd.hlsManifestUrl);
}

export async function getStreamUrls(client, videoId) {
  const result = {
    videoId,
    playabilityStatus: '',
    playabilityReason: '',
    isPlayable: false,
    isLivestream: false,
    duration: 0,
    audioStreams: [],
    videoStreams: [],
    combinedStreams: [],
    cpn: '',
    error: '',
    usedClient: '',
  };

  let data = null;
  let lastError = '';

  for (const attempt of STREAM_CLIENT_CHAIN) {
    try {
      const raw = await attempt.fetch(client, videoId);
      if (isUsableStreamingData(raw)) {
        data = raw;
        result.usedClient = attempt.key;
        break;
      }
      data = data || raw;
      lastError = raw?.playabilityStatus?.reason || raw?.playabilityStatus?.status || 'no usable streaming data';
    } catch (e) {
      lastError = e.message;
    }
  }

  if (!data) {
    result.error = lastError || 'All clients (VISIONOS, VISIONOS_1_02, ANDROID_REEL) failed';
    return result;
  }

  try {
    result.cpn = data.cpn || '';
    result.playabilityStatus = data?.playabilityStatus?.status || '';
    result.playabilityReason = data?.playabilityStatus?.reason || '';
    result.isPlayable = result.playabilityStatus === 'OK';

    if (!result.isPlayable) {
      result.error = `Video not playable: ${result.playabilityReason || result.playabilityStatus}`;
      return result;
    }

    const streamingData = data?.streamingData;
    if (!streamingData) {
      result.error = 'No streaming data available';
      return result;
    }

    const allFormats = [
      ...(streamingData.formats || []),
      ...(streamingData.adaptiveFormats || []),
    ];

    for (const format of allFormats) {
      const url = format.url ? decodeURIComponent(format.url) : '';
      if (!url) continue;

      const mimeType = format.mimeType || '';
      const itag = format.itag || 0;
      const bitrate = format.bitrate || 0;
      const contentLength = format.contentLength || '';
      const quality = format.quality || '';
      const qualityLabel = format.qualityLabel || '';
      const width = format.width || 0;
      const height = format.height || 0;
      const fps = format.fps || 0;

      if (format.targetDurationSec) {
        result.isLivestream = true;
      }

      if (format.approxDurationMs) {
        result.duration = parseInt(format.approxDurationMs, 10);
      }

      if (format.type === 'FORMAT_STREAM_TYPE_OTF') continue;

      const streamInfo = {
        url: url + (result.cpn ? `&cpn=${result.cpn}` : ''),
        itag,
        mimeType,
        bitrate,
        contentLength,
        quality,
        qualityLabel,
      };

      if (mimeType.startsWith('audio/')) {
        streamInfo.audioQuality = format.audioQuality || '';
        streamInfo.audioSampleRate = format.audioSampleRate || '';
        streamInfo.audioChannels = format.audioChannels || 0;
        if (format.audioTrack) {
          streamInfo.audioTrackId = format.audioTrack.audioTrackId || '';
          let dn = format.audioTrack.displayName || '';
          if (dn.includes('(')) dn = dn.split('(')[0].trim();
          streamInfo.displayName = dn;
          if (format.audioTrack.audioIsDefault === true) {
            streamInfo.isDefault = true;
          }
          if (streamInfo.audioTrackId.toLowerCase().includes('original') ||
            streamInfo.displayName.toLowerCase().includes('original')) {
            streamInfo.isOriginal = true;
            }
        }
        result.audioStreams.push(streamInfo);
      } else if (mimeType.startsWith('video/')) {
        streamInfo.width = width;
        streamInfo.height = height;
        streamInfo.fps = fps;

        if (format.audioQuality || (width && height && itag === 18)) {
          result.combinedStreams.push(streamInfo);
        } else {
          result.videoStreams.push(streamInfo);
        }
      }
    }

    if (streamingData.hlsManifestUrl) {
      result.hlsManifestUrl = streamingData.hlsManifestUrl;
      result.isLivestream = true;
    }
    if (streamingData.dashManifestUrl) {
      result.dashManifestUrl = streamingData.dashManifestUrl;
    }

    result.audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    result.videoStreams.sort((a, b) => (b.height || 0) - (a.height || 0));
    result.bestAudio = result.audioStreams.find(s => s.mimeType.includes('mp4a'))
      || result.audioStreams[0] || null;

    result.bestVideo = result.videoStreams.find(s => s.mimeType.includes('avc1'))
      || result.videoStreams[0] || null;

    result.qualityMap = {};
    const resolutions = [144, 240, 360, 480, 720, 1080, 1440, 2160];
    for (const stream of result.videoStreams) {
      if (stream.mimeType.includes('avc1')) {
        const closest = resolutions.reduce((prev, curr) =>
          Math.abs(curr - stream.height) < Math.abs(prev - stream.height) ? curr : prev
        );
        if (!result.qualityMap[closest] || stream.bitrate > result.qualityMap[closest].bitrate) {
          result.qualityMap[closest] = stream;
        }
      }
    }

  } catch (e) {
    result.error = e.message;
  }

  return result;
}

export async function getBestAudioUrl(client, videoId) {
  const streams = await getStreamUrls(client, videoId);
  if (streams.error) throw new Error(streams.error);
  if (!streams.bestAudio) throw new Error('No audio streams available');
  return streams.bestAudio.url;
}

export async function getCombinedStreamUrl(client, videoId) {
  const streams = await getStreamUrls(client, videoId);
  if (streams.error) throw new Error(streams.error);
  if (streams.combinedStreams.length) return streams.combinedStreams[0].url;
  throw new Error('No combined streams available');
}

export default { getStreamUrls, getBestAudioUrl, getCombinedStreamUrl };
