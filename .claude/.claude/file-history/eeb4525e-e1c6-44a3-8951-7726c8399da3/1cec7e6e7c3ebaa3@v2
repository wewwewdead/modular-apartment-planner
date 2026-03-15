import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    createStory,
    updateStory,
    deleteStory,
    createChapter,
    updateChapter,
    deleteChapter,
    reorderChapters,
    toggleStoryVote,
    toggleStoryLibrary,
    addChapterComment,
} from '../../../../API/StoryApi';

export const useCreateStory = (token) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (formData) => createStory(token, formData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['myStories'] });
        },
    });
};

export const useUpdateStory = (token) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ storyId, formData }) => updateStory(token, storyId, formData),
        onSuccess: (_data, { storyId }) => {
            queryClient.invalidateQueries({ queryKey: ['myStories'] });
            queryClient.invalidateQueries({ queryKey: ['story', storyId] });
        },
    });
};

export const useDeleteStory = (token) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (storyId) => deleteStory(token, storyId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['myStories'] });
        },
    });
};

export const useCreateChapter = (token) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ storyId, title }) => createChapter(token, storyId, title),
        onSuccess: (_data, { storyId }) => {
            queryClient.invalidateQueries({ queryKey: ['story', storyId] });
            queryClient.invalidateQueries({ queryKey: ['myStories'] });
        },
    });
};

export const useUpdateChapter = (token) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ storyId, chapterId, data }) => updateChapter(token, storyId, chapterId, data),
        onSuccess: (_data, { storyId, chapterId }) => {
            queryClient.invalidateQueries({ queryKey: ['chapter', storyId, chapterId] });
            queryClient.invalidateQueries({ queryKey: ['story', storyId] });
            queryClient.invalidateQueries({ queryKey: ['myStories'] });
        },
    });
};

export const useDeleteChapter = (token) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ storyId, chapterId }) => deleteChapter(token, storyId, chapterId),
        onSuccess: (_data, { storyId }) => {
            queryClient.invalidateQueries({ queryKey: ['story', storyId] });
            queryClient.invalidateQueries({ queryKey: ['myStories'] });
        },
    });
};

export const useReorderChapters = (token) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ storyId, chapterOrder }) => reorderChapters(token, storyId, chapterOrder),
        onSuccess: (_data, { storyId }) => {
            queryClient.invalidateQueries({ queryKey: ['story', storyId] });
        },
    });
};

export const useToggleVote = (token) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (storyId) => toggleStoryVote(token, storyId),
        onMutate: async (storyId) => {
            await queryClient.cancelQueries({ queryKey: ['story', storyId] });
            const previous = queryClient.getQueryData(['story', storyId]);
            if (previous) {
                queryClient.setQueryData(['story', storyId], (old) => ({
                    ...old,
                    has_voted: !old.has_voted,
                    vote_count: old.has_voted ? (old.vote_count || 1) - 1 : (old.vote_count || 0) + 1,
                }));
            }
            return { previous };
        },
        onError: (_err, storyId, context) => {
            if (context?.previous) {
                queryClient.setQueryData(['story', storyId], context.previous);
            }
        },
        onSettled: (_data, _err, storyId) => {
            queryClient.invalidateQueries({ queryKey: ['story', storyId] });
        },
    });
};

export const useAddChapterComment = (token) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ chapterId, data }) => addChapterComment(token, chapterId, data),
        onSuccess: (_data, { chapterId }) => {
            queryClient.invalidateQueries({ queryKey: ['chapterComments', chapterId] });
            queryClient.invalidateQueries({ queryKey: ['chapterCommentCounts', chapterId] });
        },
    });
};

export const useToggleLibrary = (token) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (storyId) => toggleStoryLibrary(token, storyId),
        onMutate: async (storyId) => {
            await queryClient.cancelQueries({ queryKey: ['story', storyId] });
            const previous = queryClient.getQueryData(['story', storyId]);
            if (previous) {
                queryClient.setQueryData(['story', storyId], (old) => ({
                    ...old,
                    in_library: !old.in_library,
                }));
            }
            return { previous };
        },
        onError: (_err, storyId, context) => {
            if (context?.previous) {
                queryClient.setQueryData(['story', storyId], context.previous);
            }
        },
        onSettled: (_data, _err, storyId) => {
            queryClient.invalidateQueries({ queryKey: ['story', storyId] });
            queryClient.invalidateQueries({ queryKey: ['myLibrary'] });
        },
    });
};
