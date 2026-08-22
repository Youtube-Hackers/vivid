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

import { searchVideos, proxyImageUrl } from '../api.js';
import { escapeHtml, navigate } from '../router.js';
import { videoCard } from './home.js';

export async function renderSearch(app, params) {
  const query = params.search_query || params.q || '';
  if (!query) {
    app.innerHTML = '<div class="error-msg">No search query provided</div>';
    return;
  }

  const filters = {
    sort_by: params.sort_by || '',
    type: params.type || '',
    date: params.date || '',
    duration: params.duration || '',
  };
  document.title = `${query} - Vivid`;
  const data = await searchVideos(query, filters);

  if (data.error) {
    app.innerHTML = `<div class="error-msg">${escapeHtml(data.error)}</div>`;
    return;
  }

  const results = data.results || [];
  let continuationToken = data.continuationToken || '';

  app.innerHTML = `
    <h1 class="page-title">
      Search: "${escapeHtml(query)}"
      <span class="page-subtitle">${data.estimatedResults ? ` ${escapeHtml(data.estimatedResults)} results` : ''}</span>
    </h1>
    <button id="toggle-filters-btn" style="margin-bottom:1rem;background:var(--bg-card);border:1px solid var(--border-color);color:var(--text-main);padding:4px 12px;border-radius:16px;">Toggle Filters</button>
    <div id="filters-container" style="display:none;">
      ${renderFilters(query, filters)}
    </div>
    <div id="results-container">
      ${results.length === 0 ? '<p style="color:var(--text-muted);padding:2rem;text-align:center">No results found</p>' : ''}
      <div class="video-list" id="results-list">
        ${results.map(r => renderResult(r)).join('')}
      </div>
    </div>
    ${continuationToken ? '<button class="load-more" id="load-more-search">Load more</button>' : ''}
  `;

  const toggleBtn = document.getElementById('toggle-filters-btn');
  const filtersContainer = document.getElementById('filters-container');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      filtersContainer.style.display = filtersContainer.style.display === 'none' ? 'block' : 'none';
    });
  }

  app.querySelectorAll('.filter-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const f = {};
      app.querySelectorAll('.filter-select').forEach(s => {
        if (s.value) f[s.name] = s.value;
      });
      let hash = `/results?search_query=${encodeURIComponent(query)}`;
      for (const [k, v] of Object.entries(f)) hash += `&${k}=${v}`;
      navigate(hash);
    });
  });

  const loadMoreBtn = document.getElementById('load-more-search');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', async () => {
      if (!continuationToken) return;
      loadMoreBtn.textContent = 'Loading...';
      try {
        const more = await searchVideos(query, filters, continuationToken);
        const list = document.getElementById('results-list');
        for (const r of more.results || []) {
          list.insertAdjacentHTML('beforeend', renderResult(r));
        }
        continuationToken = more.continuationToken || '';
        if (!continuationToken) loadMoreBtn.remove();
        else loadMoreBtn.textContent = 'Load more';
      } catch (e) {
        loadMoreBtn.textContent = 'Error, retry';
      }
    });
  }
}

function renderFilters(query, current) {
  return `
    <div class="search-filters">
      <div class="filter-group">
        <label>Sort:</label>
        <select class="filter-select" name="sort_by">
          <option value="">Relevance</option>
          <option value="date" ${current.sort_by === 'date' ? 'selected' : ''}>Date</option>
          <option value="views" ${current.sort_by === 'views' ? 'selected' : ''}>Views</option>
          <option value="rating" ${current.sort_by === 'rating' ? 'selected' : ''}>Rating</option>
        </select>
      </div>
      <div class="filter-group">
        <label>Type:</label>
        <select class="filter-select" name="type">
          <option value="">All</option>
          <option value="video" ${current.type === 'video' ? 'selected' : ''}>Video</option>
          <option value="channel" ${current.type === 'channel' ? 'selected' : ''}>Channel</option>
          <option value="playlist" ${current.type === 'playlist' ? 'selected' : ''}>Playlist</option>
        </select>
      </div>
      <div class="filter-group">
        <label>Date:</label>
        <select class="filter-select" name="date">
          <option value="">Any time</option>
          <option value="hour" ${current.date === 'hour' ? 'selected' : ''}>Last hour</option>
          <option value="today" ${current.date === 'today' ? 'selected' : ''}>Today</option>
          <option value="week" ${current.date === 'week' ? 'selected' : ''}>This week</option>
          <option value="month" ${current.date === 'month' ? 'selected' : ''}>This month</option>
          <option value="year" ${current.date === 'year' ? 'selected' : ''}>This year</option>
        </select>
      </div>
      <div class="filter-group">
        <label>Duration:</label>
        <select class="filter-select" name="duration">
          <option value="">Any</option>
          <option value="short" ${current.duration === 'short' ? 'selected' : ''}>Short (&lt;4m)</option>
          <option value="medium" ${current.duration === 'medium' ? 'selected' : ''}>Medium (4-20m)</option>
          <option value="long" ${current.duration === 'long' ? 'selected' : ''}>Long (&gt;20m)</option>
        </select>
      </div>
    </div>
  `;
}

function renderResult(item) {
  if (!item) return '';
  if (item.type === 'channel') return renderChannelResult(item);
  if (item.type === 'playlist') return renderPlaylistResult(item);
  return renderVideoResult(item);
}

function renderVideoResult(v) {
  const href = v.url || (v.videoId ? `/watch?v=${v.videoId}` : '#');
  return `
    <a href="#${href}" class="video-list-item">
      <div class="video-list-thumb">
        <img src="${proxyImageUrl(v.thumbnailUrl || '')}" alt="" loading="lazy">
        ${v.duration ? `<span class="video-card-duration">${escapeHtml(v.duration)}</span>` : ''}
      </div>
      <div class="video-list-info">
        <div class="video-list-title">${escapeHtml(v.title || '')}</div>
        <div class="video-list-meta">
          ${v.author ? `<span>${escapeHtml(v.author)}</span>` : ''}
          ${v.views ? `<span>${escapeHtml(v.views)}</span>` : ''}
          ${v.publishDate ? `<span>${escapeHtml(v.publishDate)}</span>` : ''}
        </div>
      </div>
    </a>
  `;
}

function renderChannelResult(ch) {
  const href = ch.id ? `/channel/${ch.id}` : '#';
  return `
    <a href="#${href}" class="channel-card">
      <div class="channel-card-avatar">
        <img src="${proxyImageUrl(ch.iconUrl || '')}" alt="" loading="lazy">
      </div>
      <div>
        <div class="channel-card-name">${escapeHtml(ch.name || '')}</div>
        <div class="channel-card-meta">${[ch.subscribers, ch.videoCount].filter(Boolean).map(escapeHtml).join(' • ')}</div>
      </div>
    </a>
  `;
}

function renderPlaylistResult(pl) {
  const href = pl.url || '#';
  return `
    <a href="#${href}" class="video-list-item">
      <div class="video-list-thumb">
        <img src="${proxyImageUrl(pl.thumbnailUrl || '')}" alt="" loading="lazy">
        <span class="video-card-duration">▶ ${escapeHtml(pl.videoCount || '')}</span>
      </div>
      <div class="video-list-info">
        <div class="video-list-title">${escapeHtml(pl.title || '')}</div>
        <div class="video-list-meta"><span>Playlist</span></div>
      </div>
    </a>
  `;
}
