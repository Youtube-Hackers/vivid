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

import { getVideo, getStreams, getComments, getCommentReplies, getCaptions, getLiveChat, proxyImageUrl, proxyStreamUrl } from '../api.js';
import { escapeHtml } from '../router.js';

let vjsPlayer = null;
let audioTrackPlayer = null;
let audioSyncInterval = null;
let chatInterval = null;
let sponsorSegments = [];

const ICONS = {
  thumbUp: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>`,
  thumbDown: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg>`,
  comment: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
  pin: `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>`,
  heart: `<svg width="11" height="11" viewBox="0 0 24 24" fill="#f00"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>`,
  next: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 15,12 5,21"/><rect x="17" y="3" width="2" height="18"/></svg>`,
  listPlay: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
};

function linkifyText(text) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const escapedUrl = part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);word-break:break-all;">${escapedUrl}</a>`;
    }
    return part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  }).join('');
}

function linkifyComment(text) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const escapedUrl = part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);word-break:break-all;">${escapedUrl}</a>`;
    }
    const escaped = part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escaped.replace(/(@[A-Za-z0-9_\-\.]+)/g, handle => {
      const channelId = handle.slice(1);
      return `<a href="#/channel/${encodeURIComponent(channelId)}" style="color:var(--accent);">${handle}</a>`;
    });
  }).join('');
}

export async function renderWatch(app, params) {
  const videoId = params.v;
  const listId = params.list || null;

  if (!videoId) {
    app.innerHTML = '<div class="error-msg">No video ID provided</div>';
    return;
  }

  if (vjsPlayer) { vjsPlayer.dispose(); vjsPlayer = null; }
  if (chatInterval) { clearInterval(chatInterval); chatInterval = null; }

  app.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  const [detail, streams, captionsData, sponsorRes] = await Promise.allSettled([
    getVideo(videoId, listId),
    getStreams(videoId),
    getCaptions(videoId),
    fetch(`https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}`)
  ]);

  const detailObj = detail.status === 'fulfilled' ? detail.value : {};
  const streamsObj = streams.status === 'fulfilled' ? streams.value : {};
  const capsObj = captionsData.status === 'fulfilled' ? captionsData.value : null;

  sponsorSegments = [];
  if (sponsorRes.status === 'fulfilled' && sponsorRes.value.ok) {
    try { sponsorSegments = await sponsorRes.value.json(); } catch(e) {}
  }

  if (detailObj.error && !detailObj.title) {
    app.innerHTML = `<div class="error-msg">${escapeHtml(detailObj.error)}</div>`;
    return;
  }
  if (streamsObj.error) {
    app.innerHTML = `<div class="error-msg">Stream Error: ${escapeHtml(streamsObj.error)}</div>`;
    return;
  }
  if (detailObj.title) {
    document.title = `${detailObj.title} - Vivid`;
  }
  const qualities = [];
  if (streamsObj.combinedStreams?.length) {
    qualities.push({ label: '360p', url: streamsObj.combinedStreams[0].url, type: 'combined' });
  }
  if (streamsObj.qualityMap) {
    for (const [res, stream] of Object.entries(streamsObj.qualityMap).sort((a,b)=>b[0]-a[0])) {
      qualities.push({ label: `${res}p`, url: stream.url, audioUrl: streamsObj.bestAudio?.url, type: 'adaptive' });
    }
  }

  const audioOptions = streamsObj.audioStreams || [];
  let initialAudioIdx = audioOptions.findIndex(a => a.isOriginal);
  if (initialAudioIdx === -1) initialAudioIdx = 0;

  let initialQ = qualities.find(q => q.label === '720p') || qualities.find(q => q.label === '360p') || qualities[0];

  const playlist = detailObj.playlist || null;
  const playlistVideos = playlist?.videos || [];
  const currentIdx = playlist?.selectedIndex ?? -1;

  const sidebarVideos = listId && playlistVideos.length > 0
    ? playlistVideos
    : (detailObj.suggestions || []).filter(s => s.type === 'video');

  const nextVideos = listId && playlistVideos.length > 0
    ? playlistVideos.slice(currentIdx + 1)
    : sidebarVideos;

  const sidebarTitle = listId && playlist
    ? `${escapeHtml(playlist.title || 'Playlist')} · ${currentIdx + 1}/${playlist.totalVideos || playlistVideos.length}`
    : 'Up next';

  app.innerHTML = `
    <div class="watch-layout">
      <div class="watch-primary">
        <div class="watch-player-wrapper" style="position:relative;">
          <video id="vjs-video" class="video-js vjs-default-skin vjs-big-play-centered" controls preload="auto" width="100%" height="auto"></video>
        </div>

        ${detailObj.isLivestream ? `
          <div class="live-chat-panel" style="margin-top:1rem;background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;display:flex;flex-direction:column;height:400px;">
            <div style="background:var(--bg-tertiary);padding:8px 12px;font-weight:600;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
              <span>Live Chat</span><span style="color:#f00;font-size:0.75rem;">● LIVE</span>
            </div>
            <div id="live-chat-messages" style="flex:1;overflow-y:auto;padding:8px;font-size:0.85rem;display:flex;flex-direction:column;gap:6px;">
              <div style="color:var(--text-muted);text-align:center;margin-top:20px;">Waiting for messages...</div>
            </div>
          </div>
        ` : ''}

        <div class="watch-info">
          <h1 class="watch-title">${escapeHtml(detailObj.title || '')}</h1>
          <div class="watch-meta">
            ${detailObj.views ? `<span>${escapeHtml(detailObj.views)}</span>` : ''}
            ${detailObj.publishDate ? `<span>${escapeHtml(detailObj.publishDate)}</span>` : ''}
          </div>
          <div class="watch-likes">
            <span class="watch-like-btn">${ICONS.thumbUp}<span>${escapeHtml(String(detailObj.likes || '0'))}</span></span>
            <span class="watch-like-btn">${ICONS.thumbDown}<span>${escapeHtml(String(detailObj.dislikes || '0'))}</span></span>
          </div>
          ${detailObj.author?.id ? `
            <div class="watch-channel">
              <a href="#/channel/${detailObj.author.id}" class="watch-channel-avatar">
                <img src="${proxyImageUrl(detailObj.author.iconUrl || '')}" alt="">
              </a>
              <div>
                <a href="#/channel/${detailObj.author.id}" class="watch-channel-name">${escapeHtml(detailObj.author.name || '')}</a>
                ${detailObj.author.subscribers ? `<div class="watch-channel-subs">${escapeHtml(detailObj.author.subscribers)}</div>` : ''}
              </div>
            </div>
          ` : ''}
          ${detailObj.description ? `
            <div class="watch-description" id="watch-description">
              <div class="watch-description-body">${linkifyText(detailObj.description)}</div>
              <button class="watch-desc-toggle" id="desc-toggle">Show more</button>
            </div>
          ` : ''}
        </div>

        <div class="comments-section" id="comments-section">
          <h3>Comments</h3>
          <div id="comments-list"></div>
          ${!detailObj.comments?.disabled ? '<button class="load-more" id="load-comments">Load comments</button>' : '<p style="color:var(--text-muted)">Disabled</p>'}
        </div>
      </div>

      <div class="suggestions-sidebar">
        <div class="sidebar-header">
          ${listId && playlist ? `
            <a href="#/playlist?list=${listId}" class="sidebar-playlist-link">
              ${ICONS.listPlay} View full playlist
            </a>
          ` : ''}
          <div class="sidebar-title">${sidebarTitle}</div>
        </div>
        <div class="sidebar-list">
          ${sidebarVideos.map((s, i) => renderSuggestion(s, listId, i, currentIdx)).join('')}
        </div>
      </div>
    </div>
  `;

  const descBox = document.getElementById('watch-description');
  const descToggle = document.getElementById('desc-toggle');
  if (descBox && descToggle) {
    descToggle.addEventListener('click', () => {
      descBox.classList.toggle('expanded');
      descToggle.textContent = descBox.classList.contains('expanded') ? 'Show less' : 'Show more';
    });
  }

  audioTrackPlayer = document.createElement('audio');

  vjsPlayer = videojs('vjs-video', {
    fluid: true,
    playbackRates: [0.25, 0.5, 1, 1.25, 1.5, 2],
    controlBar: {
      currentTimeDisplay: true,
      timeDivider: true,
      durationDisplay: true,
      remainingTimeDisplay: false
    }
  });

  if (detailObj.isLivestream && streamsObj.hlsManifestUrl) {
    vjsPlayer.src({ src: streamsObj.hlsManifestUrl, type: 'application/x-mpegURL' });
    if (detailObj.liveChatContinuationToken) setupLiveChat(videoId, detailObj.liveChatContinuationToken);
  }

  vjsPlayer.on('ended', () => {
    if (document.getElementById('ps-loop').checked) return;
    if (!document.getElementById('ps-autoplay').checked) return;

    const next = nextVideos[0];
    if (!next) return;
    const nextId = next.videoId || next.id;
    if (nextId) {
      window.location.hash = `#/watch?v=${nextId}${listId ? '&list=' + listId : ''}`;
    }
  });

  const settingsMenuHtml = `
  <div class="vjs-settings-menu hidden" id="player-settings-menu">
  <h3>Settings <span class="vjs-settings-close" id="ps-close">&times;</span></h3>
  <div class="vjs-settings-section" ${detailObj.isLivestream ? 'style="display:none;"' : ''}>
  <label>Quality</label>
  <select id="ps-quality">
  ${qualities.map((q,i) => `<option value="${i}" ${q.label === initialQ?.label ? 'selected' : ''}>${q.label}</option>`).join('')}
  </select>
  </div>
  <div class="vjs-settings-section" ${detailObj.isLivestream ? 'style="display:none;"' : ''}>
  <label>Audio Track</label>
  <select id="ps-audio">
  ${audioOptions.map((a,i) => `<option value="${i}" ${i === initialAudioIdx ? 'selected' : ''}>${escapeHtml(a.displayName || 'Default')}</option>`).join('')}
  </select>
  </div>
  <div class="vjs-settings-section">
  <label><input type="checkbox" id="ps-loop"> Loop Video</label>
  </div>
  <div class="vjs-settings-section">
  <label><input type="checkbox" id="ps-sponsor" checked> Skip Sponsor Segments</label>
  </div>
  <div class="vjs-settings-section">
  <label><input type="checkbox" id="ps-autoplay"> Autoplay</label>
  </div>
  </div>
  `;
  const menuWrapper = document.createElement('div');
  menuWrapper.innerHTML = settingsMenuHtml;
  vjsPlayer.el().appendChild(menuWrapper.firstElementChild);

  const fullscreenToggle = vjsPlayer.controlBar.getChild('fullscreenToggle');
  const fullscreenIdx = vjsPlayer.controlBar.children().indexOf(fullscreenToggle);
  const settingsBtn = vjsPlayer.controlBar.addChild('button', {
    className: 'vjs-visible-control vjs-control vjs-button',
    title: 'Settings',
  }, fullscreenIdx !== -1 ? fullscreenIdx : undefined);
  settingsBtn.el().innerHTML = '<span class="vjs-icon-placeholder vjs-icon-cog" aria-hidden="true"></span>';
  settingsBtn.el().addEventListener('click', () => {
    document.getElementById('player-settings-menu').classList.toggle('hidden');
  });
  document.getElementById('ps-close').addEventListener('click', () => {
    document.getElementById('player-settings-menu').classList.add('hidden');
  });
  const volumePanel = vjsPlayer.controlBar.getChild('volumePanel');
  const volumePanelIdx = vjsPlayer.controlBar.children().indexOf(volumePanel);
  let isSyncing = false;
  let isAudioTrackActive = false;
  let userVolume = 1;
  let userMuted = false;

  function addCaptions() {
    if (capsObj?.baseLanguages) {
      for (const track of capsObj.baseLanguages) {
        vjsPlayer.addRemoteTextTrack({
          kind: 'captions', label: track.name, language: track.languageCode,
          src: `/api/v1/captions/${videoId}/${track.languageCode}`, default: false
        }, true);
      }
    }
  }

  addCaptions();

  vjsPlayer.on('play', () => {
    if (isAudioTrackActive && audioTrackPlayer.src) {
      audioTrackPlayer.play().catch(e => console.log('Audio play error:', e));
    }
  });
  vjsPlayer.on('pause', () => {
    if (isAudioTrackActive && audioTrackPlayer.src) {
      audioTrackPlayer.pause();
    }
  });
  vjsPlayer.on('seeking', () => {
    if (isAudioTrackActive && audioTrackPlayer.src) {
      audioTrackPlayer.currentTime = vjsPlayer.currentTime();
    }
  });
  vjsPlayer.on('ratechange', () => {
    if (isAudioTrackActive && audioTrackPlayer.src) {
      audioTrackPlayer.playbackRate = vjsPlayer.playbackRate();
    }
  });
  vjsPlayer.on('volumechange', () => {
    if (isSyncing) return;
    const newVolume = vjsPlayer.volume();
    const newMuted = vjsPlayer.muted();
    userVolume = newVolume;
    userMuted = newMuted;

    if (isAudioTrackActive) {
      audioTrackPlayer.volume = newVolume;
      audioTrackPlayer.muted = newMuted;
    }
  });

  function handleSeekKey(e) {
    if (!vjsPlayer) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      vjsPlayer.currentTime(Math.max(0, vjsPlayer.currentTime() - 5));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const dur = vjsPlayer.duration() || Infinity;
      vjsPlayer.currentTime(Math.min(dur, vjsPlayer.currentTime() + 5));
    }
  }
  function handleVolumeWheel(e) {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    const newVol = Math.min(1, Math.max(0, vjsPlayer.volume() + delta));
    vjsPlayer.volume(newVol);
    if (newVol > 0 && vjsPlayer.muted()) vjsPlayer.muted(false);
    if (newVol === 0) vjsPlayer.muted(true);
  }
  const volumePanelEl = vjsPlayer.controlBar.getChild('volumePanel')?.el();
  if (volumePanelEl) {
    volumePanelEl.addEventListener('wheel', handleVolumeWheel, { passive: false });
  }

  vjsPlayer.on('dispose', () => {
    document.removeEventListener('keydown', handleSeekKey);
    if (volumePanelEl) volumePanelEl.removeEventListener('wheel', handleVolumeWheel);
  });
  document.addEventListener('keydown', handleSeekKey);
  vjsPlayer.on('dispose', () => {
    document.removeEventListener('keydown', handleSeekKey);
  });

  if (initialQ) setStream(initialQ, initialQ.type === 'adaptive' ? audioOptions[initialAudioIdx] : null);

  if (audioSyncInterval) clearInterval(audioSyncInterval);
  audioSyncInterval = setInterval(() => {
    if (!vjsPlayer || vjsPlayer.paused()) return;
    const qIdx = document.getElementById('ps-quality')?.value;
    const q = qualities[qIdx] || initialQ;
    if (q?.type === 'adaptive' && audioTrackPlayer.src && !audioTrackPlayer.paused) {
      const videoTime = vjsPlayer.currentTime();
      const audioTime = audioTrackPlayer.currentTime;
      if (Math.abs(videoTime - audioTime) > 0.2) {
        audioTrackPlayer.currentTime = videoTime;
      }
    }
  }, 500);

  vjsPlayer.on('timeupdate', () => {
    if (!document.getElementById('ps-sponsor')?.checked || !sponsorSegments.length) return;
    const ct = vjsPlayer.currentTime();
    for (const seg of sponsorSegments) {
      if (ct >= seg.segment[0] && ct < seg.segment[1]) { vjsPlayer.currentTime(seg.segment[1]); break; }
    }
  });

  function setStream(q, audioChoice) {
    const ct = vjsPlayer.currentTime() || 0;
    const paused = vjsPlayer.paused();

    vjsPlayer.src({ type: 'video/mp4', src: proxyStreamUrl(q.url) });
    const audioSelect = document.getElementById('ps-audio');
    if (audioSelect) {
      audioSelect.disabled = q.type !== 'adaptive';
      audioSelect.style.opacity = q.type !== 'adaptive' ? '0.5' : '1';
    }

    if (q.type === 'adaptive') {
      isAudioTrackActive = true;
      const aSrc = audioChoice ? proxyStreamUrl(audioChoice.url) : proxyStreamUrl(q.audioUrl);
      if (audioTrackPlayer.src !== aSrc) {
        audioTrackPlayer.src = aSrc;
        audioTrackPlayer.load();
      }
      isSyncing = true;
      vjsPlayer.muted(true);
      audioTrackPlayer.volume = userVolume;
      audioTrackPlayer.muted = userMuted;
      isSyncing = false;
    } else {
      isAudioTrackActive = false;
      audioTrackPlayer.pause();
      audioTrackPlayer.src = '';
      isSyncing = true;
      vjsPlayer.muted(userMuted);
      vjsPlayer.volume(userVolume);
      isSyncing = false;
    }

    vjsPlayer.ready(() => {
      addCaptions();
      vjsPlayer.currentTime(ct);
      if (isAudioTrackActive) {
        audioTrackPlayer.currentTime = ct;
      }
      if (!paused) {
        vjsPlayer.play();
        if (isAudioTrackActive) {
          audioTrackPlayer.play().catch(e => console.log('Audio play error:', e));
        }
      }
    });
  }

  document.getElementById('ps-quality').addEventListener('change', (e) => {
    const q = qualities[e.target.value];
    const a = audioOptions[document.getElementById('ps-audio').value];
    if (q) setStream(q, a);
  });

  document.getElementById('ps-audio').addEventListener('change', (e) => {
    const q = qualities[document.getElementById('ps-quality').value];
    const a = audioOptions[e.target.value];
    if (q?.type === 'adaptive') {
      audioTrackPlayer.src = proxyStreamUrl(a.url);
      audioTrackPlayer.currentTime = vjsPlayer.currentTime();
      if (!vjsPlayer.paused()) audioTrackPlayer.play();
    }
  });

  document.getElementById('ps-loop').addEventListener('change', (e) => {
    vjsPlayer.loop(e.target.checked);
  });

  const loadCommentsBtn = document.getElementById('load-comments');
  if (loadCommentsBtn) {
    let commentToken = detailObj.comments?.continuationToken || '';
    let commentType = detailObj.comments?.type ?? 1;
    loadCommentsBtn.addEventListener('click', async () => {
      loadCommentsBtn.textContent = 'Loading...';
      if (!detailObj.isLivestream) {
        try {
          const data = await getComments(videoId, commentToken || undefined, commentType);
          const list = document.getElementById('comments-list');
          for (const c of data.comments || []) {
            list.insertAdjacentHTML('beforeend', renderComment(c, videoId));
          }
          commentToken = data.continuationToken || '';
          commentType = data.type ?? -1;
          if (!commentToken || commentType === -1) loadCommentsBtn.remove();
          else loadCommentsBtn.textContent = 'Load more';
          attachReplyListeners(videoId);
        } catch (e) {
          loadCommentsBtn.textContent = 'Error, retry';
        }
      } else {
        loadCommentsBtn.remove();
        document.getElementById('comments-section').querySelector('h3').textContent = 'Top Chat';
      }
    });
    loadCommentsBtn.click();
  }
}

function attachReplyListeners(videoId) {
  document.querySelectorAll('.load-replies-btn:not(.bound)').forEach(btn => {
    btn.classList.add('bound');
    btn.addEventListener('click', async () => {
      const token = btn.getAttribute('data-token');
      const target = document.getElementById(btn.getAttribute('data-target'));
      btn.textContent = 'Loading...';
      try {
        const data = await getCommentReplies(videoId, token);
        for (const r of data.replies || []) {
          target.insertAdjacentHTML('beforeend', renderComment(r, videoId, true));
        }
        if (data.continuationToken) {
          btn.setAttribute('data-token', data.continuationToken);
          btn.textContent = 'Load more replies';
        } else {
          btn.remove();
        }
        attachReplyListeners(videoId);
      } catch(e) {
        btn.textContent = 'Error';
      }
    });
  });
}

async function setupLiveChat(videoId, initialToken) {
  let currentToken = initialToken;
  const chatList = document.getElementById('live-chat-messages');
  if (!chatList) return;
  const poll = async () => {
    if (!currentToken) return;
    try {
      const data = await getLiveChat(videoId, currentToken);
      if (data.messages?.length > 0) {
        if (chatList.innerHTML.includes('Waiting for messages...')) chatList.innerHTML = '';
        for (const m of data.messages) {
          chatList.insertAdjacentHTML('beforeend', `
            <div class="chat-msg" style="display:flex;gap:8px;align-items:flex-start;">
              <img src="${proxyImageUrl(m.authorIcon)}" style="width:24px;height:24px;border-radius:50%;flex-shrink:0;">
              <div>
                <span style="font-weight:600;color:${m.isOwner ? '#f00' : 'var(--text-secondary)'};font-size:0.8rem;">${escapeHtml(m.authorName)}</span>
                <span style="margin-left:4px;">${escapeHtml(m.content)}</span>
              </div>
            </div>
          `);
        }
        chatList.scrollTop = chatList.scrollHeight;
      }
      currentToken = data.continuationToken;
      chatInterval = setTimeout(poll, data.timeoutMs || 5000);
    } catch (e) {
      chatInterval = setTimeout(poll, 10000);
    }
  };
  poll();
}

function renderSuggestion(s, listId, i, currentIdx) {
  if (!s) return '';
  const videoId = s.videoId || s.id;
  if (!videoId) return '';
  const href = `#/watch?v=${videoId}${listId ? '&list=' + listId : ''}`;
  const isPlaying = listId && i === currentIdx;
  const isNext = listId ? i === currentIdx + 1 : i === 0;

  return `
    <a href="${href}" class="suggestion-item${isPlaying ? ' suggestion-playing' : ''}${isNext ? ' suggestion-next' : ''}">
      <div class="suggestion-thumb">
        <img src="${proxyImageUrl(s.thumbnailUrl || '')}" alt="" loading="lazy">
        ${s.duration ? `<span class="video-card-duration">${escapeHtml(s.duration)}</span>` : ''}
      </div>
      <div class="suggestion-info">
        <div class="suggestion-title">${escapeHtml(s.title || '')}</div>
        <div class="suggestion-meta">${escapeHtml(s.author || s.authorName || '')}</div>
      </div>
    </a>
  `;
}

function renderComment(c, videoId, isReply = false) {
  const ownerHtml = c.authorIsChannelOwner
    ? `<span style="background:#444;color:#fff;padding:1px 5px;border-radius:3px;font-size:0.7rem;margin-left:4px;">Owner</span>`
    : '';
  const pinHtml = c.isPinned
    ? `<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.7rem;background:var(--bg-tertiary);padding:2px 6px;border-radius:10px;margin-left:4px;border:1px solid var(--border);">${ICONS.pin} Pinned</span>`
    : '';
  const heartHtml = c.creatorHeart
    ? `<span style="display:inline-flex;align-items:center;margin-left:6px;" title="Liked by creator">${ICONS.heart}</span>`
    : '';
  const rid = 'replies-' + Math.random().toString(36).substr(2, 9);

  let authorLink = '';
  if (c.authorId) {
    authorLink = `href="#/channel/${c.authorId}"`;
  } else if (c.authorChannelId) {
    authorLink = `href="#/channel/${c.authorChannelId}"`;
  } else if (c.authorUrl) {
    const raw = c.authorUrl.startsWith('/') ? c.authorUrl.slice(1) : c.authorUrl;
    authorLink = `href="#/${raw}"`;
  }

  return `
    <div class="comment ${isReply ? 'comment-reply' : ''}" ${isReply ? 'style="margin-left:32px;border-left:2px solid var(--border);padding-left:12px;margin-top:8px;"' : ''}>
      <div class="comment-avatar">
        <img src="${proxyImageUrl(c.authorIconUrl || '')}" alt="" loading="lazy">
      </div>
      <div class="comment-content" style="flex:1;">
        <div class="comment-header">
          ${authorLink
            ? `<a ${authorLink} class="comment-author" style="color:var(--text-primary);">${escapeHtml(c.authorName || '')}${ownerHtml}</a>`
            : `<span class="comment-author">${escapeHtml(c.authorName || '')}${ownerHtml}</span>`
          }
          ${pinHtml}
          <span class="comment-date" style="font-size:0.72rem;">${escapeHtml(c.publishDate || '')}</span>
        </div>
        <div class="comment-text">${linkifyComment(c.content || '')}</div>
        <div class="comment-footer">
          ${c.upvotes ? `<span class="comment-stat">${ICONS.thumbUp} ${escapeHtml(c.upvotes)}</span>` : ''}
          ${c.replyCount ? `<span class="comment-stat">${ICONS.comment} ${c.replyCount}</span>` : ''}
          ${heartHtml}
        </div>
        <div class="comment-replies-list" id="${rid}"></div>
        ${c.repliesContinuationToken ? `
          <button class="load-replies-btn" data-token="${c.repliesContinuationToken}" data-target="${rid}">View replies</button>
        ` : ''}
      </div>
    </div>
  `;
}
