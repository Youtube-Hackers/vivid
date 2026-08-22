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

// unused for now

const STORAGE_KEY = 'vivid_playlists';

export function getPlaylists() {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

export function savePlaylists(playlists) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
}

export function createPlaylist(name) {
  const playlists = getPlaylists();
  const id = 'pl_' + Math.random().toString(36).substr(2, 9);
  playlists.push({
    id,
    name,
    videos: [],
    createdAt: new Date().toISOString()
  });
  savePlaylists(playlists);
  return id;
}

export function deletePlaylist(id) {
  let playlists = getPlaylists();
  playlists = playlists.filter(p => p.id !== id);
  savePlaylists(playlists);
}

export function addVideoToPlaylist(playlistId, video) {
  const playlists = getPlaylists();
  const playlist = playlists.find(p => p.id === playlistId);
  if (playlist) {
    if (!playlist.videos.some(v => v.videoId === video.videoId)) {
      playlist.videos.push(video);
      savePlaylists(playlists);
    }
  }
}

export function removeVideoFromPlaylist(playlistId, videoId) {
  const playlists = getPlaylists();
  const playlist = playlists.find(p => p.id === playlistId);
  if (playlist) {
    playlist.videos = playlist.videos.filter(v => v.videoId !== videoId);
    savePlaylists(playlists);
  }
}

export function isVideoInPlaylist(playlistId, videoId) {
  const playlists = getPlaylists();
  const playlist = playlists.find(p => p.id === playlistId);
  return playlist ? playlist.videos.some(v => v.videoId === videoId) : false;
}
