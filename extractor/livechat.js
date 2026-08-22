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

import { getTextFromObject, getThumbnailUrlExact } from './utils.js';

export async function getLiveChat(client, continuationToken) {
  const result = {
    messages: [],
    continuationToken: '',
    error: '',
  };

  try {
    const data = await client.liveChat(continuationToken);

    const continuationContents = data?.continuationContents?.liveChatContinuation;
    if (!continuationContents) {
      result.error = 'No chat data available';
      return result;
    }

    const actions = continuationContents.actions || [];
    for (const action of actions) {
      const item = action.addChatItemAction?.item;
      if (!item) continue;

      let msg = null;
      if (item.liveChatTextMessageRenderer) {
        const render = item.liveChatTextMessageRenderer;
        msg = {
          id: render.id,
          authorName: getTextFromObject(render.authorName),
          authorIcon: getThumbnailUrlExact(render.authorPhoto?.thumbnails, 32),
          content: getTextFromObject(render.message),
          timestamp: render.timestampText ? getTextFromObject(render.timestampText) : '',
          isOwner: render.authorBadges?.some(b => b.liveChatAuthorBadgeRenderer?.tooltip === 'Owner' || b.liveChatAuthorBadgeRenderer?.customThumbnail),
        };
      }

      if (msg) result.messages.push(msg);
    }

    const continuations = continuationContents.continuations || [];
    for (const cont of continuations) {
      if (cont.timedContinuationData) {
        result.continuationToken = cont.timedContinuationData.continuation;
        result.timeoutMs = cont.timedContinuationData.timeoutMs || 5000;
      } else if (cont.invalidationContinuationData) {
         result.continuationToken = cont.invalidationContinuationData.continuation;
         result.timeoutMs = 5000;
      } else if (cont.liveChatReplayContinuationData) {
         result.continuationToken = cont.liveChatReplayContinuationData.continuation;
      }
    }

  } catch (e) {
    result.error = e.message;
  }

  return result;
}

export default { getLiveChat };
