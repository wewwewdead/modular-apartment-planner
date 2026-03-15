import { publicGet, authedGet, authedJsonRequest, authedFormRequest } from "./apiHelpers";

// ── Stories ──

export const createStory = (token, formData) =>
    authedFormRequest(token, 'POST', '/stories', formData, 'failed to create story');

export const getStories = (limit = 10, before = null, status = null, tag = null, token = null) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    if (status) params.set('status', status);
    if (tag) params.set('tag', tag);
    return token
        ? authedGet(token, `/stories?${params}`, 'failed to fetch stories')
        : publicGet(`/stories?${params}`, 'failed to fetch stories');
};

export const getStoryById = (storyId, token = null) =>
    token
        ? authedGet(token, `/stories/${storyId}`, 'failed to fetch story')
        : publicGet(`/stories/${storyId}`, 'failed to fetch story');

export const updateStory = (token, storyId, formData) =>
    authedFormRequest(token, 'PATCH', `/stories/${storyId}`, formData, 'failed to update story');

export const deleteStory = (token, storyId) =>
    authedFormRequest(token, 'DELETE', `/stories/${storyId}`, undefined, 'failed to delete story');

export const getMyStories = (token, limit = 5, before = null) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    return authedGet(token, `/stories/my?${params}`, 'failed to fetch my stories');
};

export const getMyLibrary = (token, limit = 5, before = null) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    return authedGet(token, `/stories/library?${params}`, 'failed to fetch library');
};

export const getUserStories = (userId, token = null, limit = 5, before = null) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    return token
        ? authedGet(token, `/stories/user/${userId}?${params}`, 'failed to fetch user stories')
        : publicGet(`/stories/user/${userId}?${params}`, 'failed to fetch user stories');
};

// ── Chapters ──

export const createChapter = (token, storyId, title) =>
    authedJsonRequest(token, 'POST', `/stories/${storyId}/chapters`, { title }, 'failed to create chapter');

export const getChapter = (storyId, chapterId, token = null) =>
    token
        ? authedGet(token, `/stories/${storyId}/chapters/${chapterId}`, 'failed to fetch chapter')
        : publicGet(`/stories/${storyId}/chapters/${chapterId}`, 'failed to fetch chapter');

export const updateChapter = (token, storyId, chapterId, data) =>
    authedJsonRequest(token, 'PATCH', `/stories/${storyId}/chapters/${chapterId}`, data, 'failed to update chapter');

export const deleteChapter = (token, storyId, chapterId) =>
    authedFormRequest(token, 'DELETE', `/stories/${storyId}/chapters/${chapterId}`, undefined, 'failed to delete chapter');

export const reorderChapters = (token, storyId, chapterOrder) =>
    authedJsonRequest(token, 'POST', `/stories/${storyId}/chapters/reorder`, { chapterOrder }, 'failed to reorder chapters');

// ── Interactions ──

export const toggleStoryVote = (token, storyId) =>
    authedFormRequest(token, 'POST', `/stories/${storyId}/vote`, undefined, 'failed to toggle vote');

export const toggleStoryLibrary = (token, storyId) =>
    authedFormRequest(token, 'POST', `/stories/${storyId}/library`, undefined, 'failed to toggle library');

export const getChapterComments = (chapterId, paragraphIndex = null, token = null) => {
    const params = new URLSearchParams();
    if (paragraphIndex !== null && paragraphIndex !== undefined) {
        params.set('paragraph_index', paragraphIndex);
    }
    const qs = params.toString();
    const path = `/chapters/${chapterId}/comments${qs ? '?' + qs : ''}`;
    return token
        ? authedGet(token, path, 'failed to fetch comments')
        : publicGet(path, 'failed to fetch comments');
};

export const getChapterCommentCounts = (chapterId, token = null) =>
    token
        ? authedGet(token, `/chapters/${chapterId}/comment-counts`, 'failed to fetch comment counts')
        : publicGet(`/chapters/${chapterId}/comment-counts`, 'failed to fetch comment counts');

export const addChapterComment = (token, chapterId, data) =>
    authedJsonRequest(token, 'POST', `/chapters/${chapterId}/comments`, data, 'failed to add comment');

export const saveReadingProgress = (token, storyId, chapterId, scrollPosition) =>
    authedJsonRequest(token, 'POST', `/stories/${storyId}/progress`, { chapter_id: chapterId, scroll_position: scrollPosition }, 'failed to save progress');

export const getReadingProgress = (token, storyId) =>
    authedGet(token, `/stories/${storyId}/progress`, 'failed to fetch progress');
