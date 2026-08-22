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

import { proxyImageUrl } from '../api.js';
import { escapeHtml } from '../router.js';

export async function renderPlaylist(app, params) {
  const listId = params.list;
  if (!listId) {
    app.innerHTML = '<div class="error-msg">No playlist ID provided</div>';
    return;
  }

  app.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  let data;
  try {
    const res = await fetch(`/api/v1/playlists/${listId}`);
    data = await res.json();
    document.title = data.title ? `${data.title} - Vivid` : 'Playlist - Vivid';

  } catch(e) {
    app.innerHTML = `<div class="error-msg">${escapeHtml(e.message)}</div>`;
    return;
  }

  if (data.error) {
    app.innerHTML = `<div class="error-msg">${escapeHtml(data.error)}</div>`;
    return;
  }

  const videos = data.videos || [];
  const firstVideo = videos[0];

  app.innerHTML = `
    <div class="playlist-page">
      <div class="playlist-hero">
        <div class="playlist-cover">
          ${firstVideo?.thumbnailUrl
            ? `<img src="${proxyImageUrl(firstVideo.thumbnailUrl)}" alt="">`
            : `<div class="playlist-cover-placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
                  <path d="M4 6h16M4 10h16M4 14h8M4 18h8M15 14l5 3-5 3V14z"/>
                </svg>
               </div>`
          }
          <div class="playlist-cover-overlay"></div>
        </div>
        <div class="playlist-hero-info">
          <div class="playlist-label">Playlist</div>
          <h1 class="playlist-title">${escapeHtml(data.title || 'Playlist')}</h1>
          ${data.authorName ? `<div class="playlist-author">${escapeHtml(data.authorName)}</div>` : ''}
          <div class="playlist-meta">
            ${data.videoCount ? `<span>${data.videoCount} videos</span>` : ''}
            ${data.viewCount ? `<span>${escapeHtml(data.viewCount)} views</span>` : ''}
          </div>
          ${firstVideo ? `
            <a href="#/watch?v=${firstVideo.videoId || firstVideo.id}&list=${listId}" class="playlist-play-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
              Play all
            </a>
          ` : ''}
        </div>
      </div>

      <div class="playlist-track-list">
        ${videos.map((v, i) => renderPlaylistTrack(v, i, listId)).join('')}
        ${videos.length === 0 ? '<p style="color:var(--text-muted);padding:2rem;text-align:center;">No videos in this playlist</p>' : ''}
      </div>
    </div>
  `;
}
function renderPlaylistTrack(v, i, listId) {
  const videoId = v.videoId || v.id;
  if (!videoId) return '';
  return `
    <a href="#/watch?v=${videoId}&list=${listId}" class="playlist-track">
      <span class="playlist-track-num">${i + 1}</span>
      <div class="playlist-track-thumb">
        <img src="${proxyImageUrl(v.thumbnailUrl || '')}" alt="" loading="lazy">
        ${v.duration ? `<span class="video-card-duration">${escapeHtml(v.duration)}</span>` : ''}
      </div>
      <div class="playlist-track-info">
        <div class="playlist-track-title">${escapeHtml(v.title || '')}</div>
        <div class="playlist-track-meta">${escapeHtml(v.author || v.authorName || '')}</div>
      </div>
    </a>
  `;
}
