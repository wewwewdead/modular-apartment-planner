import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { getMyStories, getMyLibrary, getStoryById, getChapter, getChapterComments, getChapterCommentCounts, getUserStories } from '../../../../API/StoryApi';

export const useMyStories = (token) => {
    return useInfiniteQuery({
        queryKey: ['myStories'],
        queryFn: ({ pageParam }) => getMyStories(token, 5, pageParam),
        initialPageParam: undefined,
        getNextPageParam: (lastPage) => {
            if (lastPage.hasMore) {
                const lastStory = lastPage.data[lastPage.data.length - 1];
                return new Date(lastStory.updated_at).toISOString();
            }
            return undefined;
        },
        enabled: !!token,
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
    });
};

export const useMyLibrary = (token) => {
    return useInfiniteQuery({
        queryKey: ['myLibrary'],
        queryFn: ({ pageParam }) => getMyLibrary(token, 5, pageParam),
        initialPageParam: undefined,
        getNextPageParam: (lastPage) => {
            if (lastPage.hasMore) {
                const lastStory = lastPage.data[lastPage.data.length - 1];
                return new Date(lastStory.added_at).toISOString();
            }
            return undefined;
        },
        enabled: !!token,
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
    });
};

export const useStoryDetail = (storyId, token) => {
    return useQuery({
        queryKey: ['story', storyId],
        queryFn: () => getStoryById(storyId, token),
        enabled: !!storyId,
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
    });
};

export const useChapter = (storyId, chapterId, token) => {
    return useQuery({
        queryKey: ['chapter', storyId, chapterId],
        queryFn: () => getChapter(storyId, chapterId, token),
        enabled: !!storyId && !!chapterId,
        staleTime: 1000 * 60 * 10,
        refetchOnWindowFocus: false,
    });
};

export const useChapterCommentCounts = (chapterId, token) => {
    return useQuery({
        queryKey: ['chapterCommentCounts', chapterId],
        queryFn: () => getChapterCommentCounts(chapterId, token),
        enabled: !!chapterId,
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
    });
};

export const useUserStories = (userId, token) => {
    return useInfiniteQuery({
        queryKey: ['userStories', userId],
        queryFn: ({ pageParam }) => getUserStories(userId, token, 5, pageParam),
        initialPageParam: undefined,
        getNextPageParam: (lastPage) => {
            if (lastPage.hasMore) {
                const lastStory = lastPage.data[lastPage.data.length - 1];
                return new Date(lastStory.created_at).toISOString();
            }
            return undefined;
        },
        enabled: !!userId,
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
    });
};

export const useChapterComments = (chapterId, paragraphIndex, token) => {
    return useQuery({
        queryKey: ['chapterComments', chapterId, paragraphIndex],
        queryFn: () => getChapterComments(chapterId, paragraphIndex, token),
        enabled: !!chapterId && paragraphIndex !== null && paragraphIndex !== undefined,
        staleTime: 1000 * 60 * 2,
        refetchOnWindowFocus: false,
    });
};
