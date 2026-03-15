import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {addBookmark, addFollows, addJournalViews, clickLike, createRepost, deleteNotification, readNotification, toggleReaction, updatePrivacy } from "../../API/Api";

const updateInfiniteJournalsCache = (old, updater) => {
    if (!old || !Array.isArray(old.pages)) return old;

    return {
        ...old,
        pages: old.pages.map((page) => ({
            ...page,
            data: Array.isArray(page?.data) ? page.data.map(updater) : page?.data,
        })),
    };
};

const normalizeInteractionFlag = (value) => {
    if(typeof value === 'boolean') return value;
    if(typeof value === 'string'){
        const normalized = value.trim().toLowerCase();
        if(normalized === 'true') return true;
        if(normalized === 'false') return false;
    }
    if(typeof value === 'number'){
        return value === 1;
    }
    return Boolean(value);
};

const normalizeCount = (value) => {
    const number = Number(value);
    if(!Number.isFinite(number) || number < 0){
        return 0;
    }
    return number;
};

const getNextToggleCount = (isActive, currentCount) => {
    return isActive
        ? Math.max(0, currentCount - 1)
        : currentCount + 1;
};

const toJournalKey = (journalId) => {
    if(journalId === undefined || journalId === null){
        return '';
    }
    return String(journalId);
};

export const useBookMarkMutation = (session, userId) => {
    const queryClient = useQueryClient();
    const inFlightBookmarkIdsRef = useRef(new Set());

    const mutation = useMutation({
        mutationFn: (data) => addBookmark(session?.access_token, data),

        onMutate: async(data) =>{
            queryClient.cancelQueries({ queryKey: ['journals'] });
            queryClient.cancelQueries({ queryKey: ['journals-following'] });
            queryClient.cancelQueries({ queryKey: ['journals-for-you'] });
            queryClient.cancelQueries({ queryKey: ['userJournals'] });
            queryClient.cancelQueries({ queryKey: ['visitedProfileJournals'] });

            const previousData = [
                ...queryClient.getQueriesData({ queryKey: ['journals'] }),
                ...queryClient.getQueriesData({ queryKey: ['journals-following'] }),
                ...queryClient.getQueriesData({ queryKey: ['journals-for-you'] }),
                ...queryClient.getQueriesData({ queryKey: ['userJournals'] }),
                ...queryClient.getQueriesData({ queryKey: ['visitedProfileJournals'] }),
            ];

            const updater = (journal) => {
                if(journal.id !== data.journalId) return journal;

                const isBookmarked = normalizeInteractionFlag(journal?.has_bookmarked);
                const count = normalizeCount(journal?.bookmark_count?.[0]?.count);
                const nextCount = getNextToggleCount(isBookmarked, count);

                return{
                    ...journal,
                    has_bookmarked: !isBookmarked,
                    bookmark_count: [{count: nextCount}]
                };
            };

            queryClient.setQueriesData({ queryKey: ['journals'] }, (old) => updateInfiniteJournalsCache(old, updater));
            queryClient.setQueriesData({ queryKey: ['journals-following'] }, (old) => updateInfiniteJournalsCache(old, updater));
            queryClient.setQueriesData({ queryKey: ['journals-for-you'] }, (old) => updateInfiniteJournalsCache(old, updater));
            queryClient.setQueriesData({ queryKey: ['userJournals'] }, (old) => updateInfiniteJournalsCache(old, updater));
            queryClient.setQueriesData({ queryKey: ['visitedProfileJournals'] }, (old) => updateInfiniteJournalsCache(old, updater));

            return {previousData};
        },
        onError: (err,data, context) =>{
            context?.previousData?.forEach(([key, value]) => {
                queryClient.setQueryData(key, value);
            });
        },
    });

    const guardedMutate = (variables, options) => {
        const journalKey = toJournalKey(variables?.journalId);
        if(journalKey && inFlightBookmarkIdsRef.current.has(journalKey)){
            return;
        }

        if(journalKey){
            inFlightBookmarkIdsRef.current.add(journalKey);
        }

        mutation.mutate(variables, {
            ...options,
            onSettled: (data, error, vars, context) => {
                if(journalKey){
                    inFlightBookmarkIdsRef.current.delete(journalKey);
                }
                options?.onSettled?.(data, error, vars, context);
            }
        });
    };

    const guardedMutateAsync = async (variables, options) => {
        const journalKey = toJournalKey(variables?.journalId);
        if(journalKey && inFlightBookmarkIdsRef.current.has(journalKey)){
            return {message: 'skipped'};
        }

        if(journalKey){
            inFlightBookmarkIdsRef.current.add(journalKey);
        }

        try {
            return await mutation.mutateAsync(variables, options);
        } finally {
            if(journalKey){
                inFlightBookmarkIdsRef.current.delete(journalKey);
            }
        }
    };

    return {
        ...mutation,
        mutate: guardedMutate,
        mutateAsync: guardedMutateAsync
    };
}




export const useLikeMutation = (session, userId) =>{
    const queryClient = useQueryClient();
    const inFlightLikeIdsRef = useRef(new Set());

    const mutation = useMutation({
        mutationFn: (data) => clickLike(session?.access_token, data), //receiving the object data {journalId: the Id}

        onMutate: async(data) => {
            queryClient.cancelQueries({ queryKey: ['journals'] });
            queryClient.cancelQueries({ queryKey: ['journals-following'] });
            queryClient.cancelQueries({ queryKey: ['journals-for-you'] });
            queryClient.cancelQueries({ queryKey: ['userJournals'] });
            queryClient.cancelQueries({ queryKey: ['visitedProfileJournals'] });

            const previousData = [
                ...queryClient.getQueriesData({ queryKey: ['journals'] }),
                ...queryClient.getQueriesData({ queryKey: ['journals-following'] }),
                ...queryClient.getQueriesData({ queryKey: ['journals-for-you'] }),
                ...queryClient.getQueriesData({ queryKey: ['userJournals'] }),
                ...queryClient.getQueriesData({ queryKey: ['visitedProfileJournals'] }),
            ];

            const updater = (journal) => {
                if(journal.id !== data.journalId) return journal;

                const isLiked = normalizeInteractionFlag(journal?.has_liked);
                const count = normalizeCount(journal?.like_count?.[0]?.count);
                const nextCount = getNextToggleCount(isLiked, count);

                return{
                    ...journal,
                    has_liked: !isLiked,
                    like_count: [{count: nextCount}]
                };
            };

            queryClient.setQueriesData({ queryKey: ['journals'] }, (old) => updateInfiniteJournalsCache(old, updater));
            queryClient.setQueriesData({ queryKey: ['journals-following'] }, (old) => updateInfiniteJournalsCache(old, updater));
            queryClient.setQueriesData({ queryKey: ['journals-for-you'] }, (old) => updateInfiniteJournalsCache(old, updater));
            queryClient.setQueriesData({ queryKey: ['userJournals'] }, (old) => updateInfiniteJournalsCache(old, updater));
            queryClient.setQueriesData({ queryKey: ['visitedProfileJournals'] }, (old) => updateInfiniteJournalsCache(old, updater));

        return {previousData};
    },
    onError: (err, data, context) => {
      context?.previousData?.forEach(([key, value]) => {
          queryClient.setQueryData(key, value);
      });
    },
});

    const guardedMutate = (variables, options) => {
        const journalKey = toJournalKey(variables?.journalId);
        if(journalKey && inFlightLikeIdsRef.current.has(journalKey)){
            return;
        }

        if(journalKey){
            inFlightLikeIdsRef.current.add(journalKey);
        }

        mutation.mutate(variables, {
            ...options,
            onSettled: (data, error, vars, context) => {
                if(journalKey){
                    inFlightLikeIdsRef.current.delete(journalKey);
                }
                options?.onSettled?.(data, error, vars, context);
            }
        });
    };

    const guardedMutateAsync = async (variables, options) => {
        const journalKey = toJournalKey(variables?.journalId);
        if(journalKey && inFlightLikeIdsRef.current.has(journalKey)){
            return {message: 'skipped'};
        }

        if(journalKey){
            inFlightLikeIdsRef.current.add(journalKey);
        }

        try {
            return await mutation.mutateAsync(variables, options);
        } finally {
            if(journalKey){
                inFlightLikeIdsRef.current.delete(journalKey);
            }
        }
    };

    return {
        ...mutation,
        mutate: guardedMutate,
        mutateAsync: guardedMutateAsync
    };
}

export const useFollowMutation = (session, followingId) =>{
    const queryClient = useQueryClient();
    const queryFilter = {
        queryKey: ['followsData'],
        predicate: (query) => query.queryKey[2] === followingId,
    };

    return useMutation({
        mutationFn: (data) => addFollows(data, session?.access_token),

        onMutate: async() => {
            await queryClient.cancelQueries(queryFilter);
            const allMatching = queryClient.getQueriesData(queryFilter);

            queryClient.setQueriesData(queryFilter, (old) => {
                if(!old) return old;
                return{
                    ...old,
                    followersCount: old.isFollowing ? old.followersCount - 1 : old.followersCount + 1,
                    isFollowing: !old.isFollowing
                }
            })

            return {allMatching};

        },
        onError: (_err, _data, context) => {
            context?.allMatching?.forEach(([key, data]) => {
                queryClient.setQueryData(key, data);
            });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['followsData'] });
        }
    })
}

export const useReadNotificationMutation = (session) =>{
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data) => readNotification(session?.access_token, data?.notifId, data?.source),
        onMutate: async(data) => {
            await queryClient.cancelQueries(['notifcounts', session?.user?.id]);
            const previousData = queryClient.getQueryData(['notifcounts', session?.user?.id])

            queryClient.setQueryData(['notifcounts', session?.user?.id], (old) => ({count: (old?.count ? old?.count : 0) - 1}));

            return{previousData};
        },
         onError: (err, data, context) => {
            queryClient.setQueryData(['notifcounts', session?.user?.id], context.previousData)
         },
         onSettled: () => {
            queryClient.invalidateQueries(['notifcounts', session?.user?.id]);
         }
    })
}

export const useUserDeleteNotificationMutation = (session) =>{
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data) => deleteNotification(session?.access_token, data?.notifId, data?.source),

        onMutate: async(data) =>{
            await queryClient.cancelQueries(['getNotifications', session?.user?.id]);
            const previousData = queryClient.getQueryData(['getNotifications', session?.user?.id]);

            queryClient.setQueryData(['getNotifications', session?.user?.id], (old) => {
                if(!old) return old;

                return{
                    ...old,
                    pages: old.pages.map((page) =>({
                        ...page,
                        data: page.data.filter((notification) => notification.id !== data?.notifId)
                    }))
                }
            })

            return {previousData};
        },
        onError: (err, data, context) =>{
            queryClient.setQueryData(['getNotifications', session?.user?.id], context.previousData)
        },
        onSettled: () =>{
            queryClient.invalidateQueries(['getNotifications', session?.user?.id])
        }
    })
}

export const useAddViewsMutation = (session) =>{
    return useMutation({
        mutationFn: (data) => addJournalViews(session?.access_token, data),
        onError: (err) => console.error(err),
        retry: 2,
    })
}

export const useUpdateJournalPrivacyMutation = (session) =>{
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data) => updatePrivacy(session?.access_token, data),
        onMutate: async(data) => {
            await queryClient.cancelQueries(['userJournals', session?.user?.id])
            const previousData = queryClient.getQueryData(['userJournals', session?.user?.id])

            const journalId = data.get('journalId')
            const privacy = data.get('privacy');

            // console.log(privacy)

            queryClient.setQueryData(['userJournals', session?.user?.id], (old) => {
                if(!old) return old;

                return{
                    ...old,
                    pages: old.pages.map((page) => ({
                        ...page,
                        data: page.data.map((journal) => {
                            if(journal.id !== journalId) return journal;

                            return{
                                ...journal,
                                privacy: privacy
                            }
                        })
                    }))
                }
            })
            // console.log(previousData)
            return {previousData};
            
        },
        onError: (err, data, context) =>{
            queryClient.setQueryData(['userJournals', session?.user?.id], context.previousData)
        },
        onSuccess: (data) => console.log(data),
        retry: 1,
    })
}

export const useRepostMutation = (session) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data) => createRepost(session?.access_token, data),
        onSuccess: async () => {
            await Promise.allSettled([
                queryClient.invalidateQueries({ queryKey: ['userJournals'], refetchType: 'active' }),
                queryClient.invalidateQueries({ queryKey: ['journals'], refetchType: 'active' }),
                queryClient.invalidateQueries({ queryKey: ['journals-following'], refetchType: 'active' }),
                queryClient.invalidateQueries({ queryKey: ['journals-for-you'], refetchType: 'active' }),
                queryClient.invalidateQueries({ queryKey: ['journals-search'], refetchType: 'active' }),
                queryClient.invalidateQueries({ queryKey: ['journals-suggestions'], refetchType: 'active' }),
            ]);
        }
    });
}

export const useReactionMutation = (session, userId) => {
    const queryClient = useQueryClient();
    const inFlightRef = useRef(new Set());

    const mutation = useMutation({
        mutationFn: (data) => toggleReaction(session?.access_token, data),

        onMutate: async (data) => {
            queryClient.cancelQueries({ queryKey: ['journals'] });
            queryClient.cancelQueries({ queryKey: ['journals-following'] });
            queryClient.cancelQueries({ queryKey: ['journals-for-you'] });
            queryClient.cancelQueries({ queryKey: ['userJournals'] });
            queryClient.cancelQueries({ queryKey: ['visitedProfileJournals'] });

            const previousData = [
                ...queryClient.getQueriesData({ queryKey: ['journals'] }),
                ...queryClient.getQueriesData({ queryKey: ['journals-following'] }),
                ...queryClient.getQueriesData({ queryKey: ['journals-for-you'] }),
                ...queryClient.getQueriesData({ queryKey: ['userJournals'] }),
                ...queryClient.getQueriesData({ queryKey: ['visitedProfileJournals'] }),
            ];

            const updater = (journal) => {
                if (journal.id !== data.journalId) return journal;

                const currentReaction = journal?.user_reaction;
                const currentCount = normalizeCount(journal?.reaction_count?.[0]?.count);

                let nextReaction;
                let nextCount;

                if (currentReaction === data.reactionType) {
                    // Toggle off
                    nextReaction = null;
                    nextCount = Math.max(currentCount - 1, 0);
                } else if (currentReaction) {
                    // Switch reaction (count stays same)
                    nextReaction = data.reactionType;
                    nextCount = currentCount;
                } else {
                    // New reaction
                    nextReaction = data.reactionType;
                    nextCount = currentCount + 1;
                }

                return {
                    ...journal,
                    user_reaction: nextReaction,
                    reaction_count: [{ count: nextCount }],
                };
            };

            queryClient.setQueriesData({ queryKey: ['journals'] }, (old) => updateInfiniteJournalsCache(old, updater));
            queryClient.setQueriesData({ queryKey: ['journals-following'] }, (old) => updateInfiniteJournalsCache(old, updater));
            queryClient.setQueriesData({ queryKey: ['journals-for-you'] }, (old) => updateInfiniteJournalsCache(old, updater));
            queryClient.setQueriesData({ queryKey: ['userJournals'] }, (old) => updateInfiniteJournalsCache(old, updater));
            queryClient.setQueriesData({ queryKey: ['visitedProfileJournals'] }, (old) => updateInfiniteJournalsCache(old, updater));

            return { previousData };
        },

        onError: (err, data, context) => {
            context?.previousData?.forEach(([key, value]) => {
                queryClient.setQueryData(key, value);
            });
        },

    });

    const guardedMutate = (variables, options) => {
        const journalKey = toJournalKey(variables?.journalId);
        if (journalKey && inFlightRef.current.has(journalKey)) return;

        if (journalKey) inFlightRef.current.add(journalKey);

        mutation.mutate(variables, {
            ...options,
            onSettled: (data, error, vars, context) => {
                if (journalKey) inFlightRef.current.delete(journalKey);
                options?.onSettled?.(data, error, vars, context);
            },
        });
    };

    return { ...mutation, mutate: guardedMutate };
}
