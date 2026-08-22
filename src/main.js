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


import { route, handleRoute, navigate } from './router.js';
import { renderHome } from './pages/home.js';
import { renderSearch } from './pages/search.js';
import { renderWatch } from './pages/watch.js';
import { renderChannel } from './pages/channel.js';
import { renderPlaylist } from './pages/playlist.js';
import { getSearchSuggestions } from './api.js';

route('/', renderHome);
route('/results', renderSearch);
route('/watch', renderWatch);
route('/channel/:id', renderChannel);
route('/playlist', renderPlaylist);


window.addEventListener('hashchange', handleRoute);
window.addEventListener('DOMContentLoaded', () => {
  
  const saved = localStorage.getItem('vivid-theme');
  if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next === 'dark' ? '' : 'light');
    localStorage.setItem('vivid-theme', next);
  });

  
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  
  const suggestBox = document.createElement('div');
  suggestBox.className = 'search-suggestions';
  suggestBox.style.cssText = 'display:none; position:absolute; top:100%; left:0; right:0; background:var(--bg-main, #121212); border:1px solid var(--border-color); border-radius:4px; z-index:100; max-height:300px; overflow-y:auto; box-shadow:0 4px 6px rgba(0,0,0,0.5); opacity:1;';
  searchForm.style.position = 'relative';
  searchForm.appendChild(suggestBox);

  let suggestTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(suggestTimeout);
    suggestTimeout = setTimeout(async () => {
      const q = e.target.value.trim();
      if (!q) { suggestBox.style.display = 'none'; return; }
      try {
        const data = await getSearchSuggestions(q);
        if (!data.suggestions?.length) { suggestBox.style.display = 'none'; return; }
        suggestBox.innerHTML = data.suggestions.map(s => 
          `<div class="suggestion-item" data-q="${s.replace(/"/g, '&quot;')}" style="padding:8px 12px; cursor:pointer; border-bottom:1px solid var(--border-color);">${s}</div>`
        ).join('');
        suggestBox.style.display = 'block';
      } catch(er) {}
    }, 200);
  });

  suggestBox.addEventListener('click', (e) => {
    if (e.target.classList.contains('suggestion-item')) {
      searchInput.value = e.target.dataset.q;
      suggestBox.style.display = 'none';
      searchForm.dispatchEvent(new Event('submit'));
    }
  });

  document.addEventListener('click', (e) => {
    if (!searchForm.contains(e.target)) suggestBox.style.display = 'none';
  });

  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    suggestBox.style.display = 'none';
    const query = searchInput.value.trim();
    if (query) {
      navigate(`/results?search_query=${encodeURIComponent(query)}`);
    }
  });

  
  document.getElementById('logo-link').addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/');
  });

  
  document.getElementById('nav-home').addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/');
  });

  handleRoute();
});
