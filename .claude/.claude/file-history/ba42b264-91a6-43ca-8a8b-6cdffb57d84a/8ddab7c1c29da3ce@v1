import { useEffect, useRef, useState } from 'react';
import './comments.css'
import { motion } from "framer-motion";
import { addComment } from '../../../API/Api';
import { useAuth } from '../../Context/useAuth';
import { getComments } from '../../../API/Api';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { BarLoader, MoonLoader } from 'react-spinners';
import CommentsCards from './commentsCards';

const incrementJournalCommentCount = (old, postId) => {
    if (!old || !Array.isArray(old.pages)) return old;

    return {
        ...old,
        pages: old.pages.map((page) => ({
            ...page,
            data: Array.isArray(page?.data)
                ? page.data.map((journal) => {
                    if (journal?.id !== postId) return journal;

                    const currentCount = journal?.comment_count?.[0]?.count ?? 0;
                    return {
                        ...journal,
                        comment_count: [{ count: currentCount + 1 }],
                    };
                })
                : page?.data,
        })),
    };
};

const CommentSection = ({onclose, postId, receiverId})=>{
    const queryClient = useQueryClient();

    const {session, user} = useAuth();

    const textAreaFocusRef = useRef();

    const [comments, setComments] = useState('');
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);

    const {data, fetchNextPage, hasNextPage, isLoading, isFetchingNextPage} = useInfiniteQuery({
        queryKey: ['postComments', postId],
        queryFn: ({queryKey, pageParam = null}) => getComments(pageParam, 10, queryKey[1]),
        getNextPageParam: (lastPage) => {
            if(lastPage?.hasMore) {
                const lastComment = lastPage.comments[lastPage?.comments?.length - 1];
                return new Date(lastComment.created_at).toISOString();
            } else {
                return undefined;
            }
        },
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60 * 5
    })

    const handleSeeMoreComments = (e) =>{
        e.stopPropagation();
        if(hasNextPage && !isFetchingNextPage){
            try {
                fetchNextPage()
            } catch (error) {
                throw new Error(error);
            }
        }
    }

    useEffect(() =>{
        let timeout;
        if(textAreaFocusRef.current){
            timeout = setTimeout(() => {
                textAreaFocusRef.current.focus();
            }, 500);
        }
        return () => {
             clearTimeout(timeout);
        }
    }, [])

    const handeCloseCommentsSection = (e) =>{
        e.stopPropagation();
        onclose()
    }

    const handaleSubmitComment = async(e, postId, receiverId) =>{
        e.stopPropagation();
        const trimmedComment = comments.trim();
        if (!trimmedComment) return;

        const optimisticComment = {
            id: `optimistic-${Date.now()}`,
            comment: trimmedComment,
            created_at: new Date().toISOString(),
            parent_id: null,
            post_id: postId,
            reply_count: 0,
            user_id: user?.userData?.[0]?.id,
            users: {
                id: user?.userData?.[0]?.id,
                name: user?.userData?.[0]?.name,
                image_url: user?.userData?.[0]?.image_url,
                badge: user?.userData?.[0]?.badge,
            },
        };

        queryClient.cancelQueries({ queryKey: ['postComments', postId] });
        const previousComments = queryClient.getQueryData(['postComments', postId]);
        const previousJournalCaches = [
            ...queryClient.getQueriesData({ queryKey: ['journals'] }),
            ...queryClient.getQueriesData({ queryKey: ['userJournals'] }),
            ...queryClient.getQueriesData({ queryKey: ['visitedProfileJournals'] }),
        ];

        queryClient.setQueryData(['postComments', postId], (old) => {
            if (!old || !Array.isArray(old.pages)) {
                return {
                    pageParams: [null],
                    pages: [{ comments: [optimisticComment], hasMore: false }],
                };
            }

            return {
                ...old,
                pages: old.pages.map((page, index) =>
                    index === 0
                        ? { ...page, comments: [optimisticComment, ...(page?.comments || [])] }
                        : page
                ),
            };
        });

        queryClient.setQueriesData({ queryKey: ['journals'] }, (old) => incrementJournalCommentCount(old, postId));
        queryClient.setQueriesData({ queryKey: ['userJournals'] }, (old) => incrementJournalCommentCount(old, postId));
        queryClient.setQueriesData({ queryKey: ['visitedProfileJournals'] }, (old) => incrementJournalCommentCount(old, postId));

        const body = {
            comments: trimmedComment,
            postId: postId,
            receiverId: receiverId,
        }

        try {
            setIsSubmittingComment(true)
            const message = await addComment(session?.access_token, body);
            if(message){
                // console.log(message)
            }
            queryClient.invalidateQueries({ queryKey: ['postComments', postId] });
            queryClient.invalidateQueries({ queryKey: ['journals'] });
            queryClient.invalidateQueries({ queryKey: ['userJournals'] });
            queryClient.invalidateQueries({ queryKey: ['visitedProfileJournals'] });
        } catch (error) {
            queryClient.setQueryData(['postComments', postId], previousComments);
            previousJournalCaches.forEach(([key, value]) => {
                queryClient.setQueryData(key, value);
            });
            throw new Error('error adding comments')
        } finally {
            setIsSubmittingComment(false)
            setComments('')
        }
    }

    const commentsData = data?.pages?.flatMap((page) => page.comments || []);

    return(
        <motion.div
            initial={{y: '100vh', opacity: 0}}
            animate={{
                y: 0,
                opacity: 1,
                transition: {type: 'spring', damping: 25, stiffness: 200}
            }}
            exit={{y: '-100vh', opacity: 0, transition: {duration: 0.2}}}
            className="cm-parent-container"
        >
            <div className="cm-header">
                <p className="cm-header-title">Comments</p>
                <div className="cm-close-btn" onClick={(e) => handeCloseCommentsSection(e)}>
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px">
                        <path d="m336-280-56-56 144-144-144-143 56-56 144 144 143-144 56 56-144 143 144 144-56 56-143-144-144 144Z"/>
                    </svg>
                </div>
            </div>

            <div className="cm-list">
                {isLoading ? (
                    <div className="cm-loading">
                        <MoonLoader color='rgba(19, 77, 104, 1)' size={20} loading={isLoading}/>
                    </div>
                ) : (
                    commentsData?.map((comment, index) => (
                        <CommentsCards postId={postId} key={comment?.id || index} comments={comment}/>
                    ))
                )}

                {hasNextPage && (
                    <button onClick={(e) => handleSeeMoreComments(e)} className="cm-load-more">
                        See more comments
                        {isFetchingNextPage && (<MoonLoader size={12} speedMultiplier={0.5} color='rgba(19, 77, 104, 1)'/>)}
                    </button>
                )}
            </div>

            <div className="cm-input-area">
                <div className="cm-input-row">
                    <textarea
                        ref={textAreaFocusRef}
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        className="cm-textarea"
                        maxLength={200}
                        placeholder="Write a comment..."
                        rows={1}
                    />
                    <button
                        disabled={isSubmittingComment || !comments.trim()}
                        onClick={(e) => handaleSubmitComment(e, postId, receiverId)}
                        className="cm-submit-btn"
                    >
                        Submit
                    </button>
                </div>
                <div className="cm-action-row">
                    <p className={`cm-char-count ${comments.length > 199 ? 'cm-char-limit' : ''}`}>
                        {comments.length}/200
                    </p>
                </div>
            </div>

            {isSubmittingComment && (
                <div className="cm-progress">
                    <BarLoader loading={isSubmittingComment} width={'100%'} color="rgb(40, 115, 255)" speedMultiplier={0.9}/>
                </div>
            )}
        </motion.div>
    )
}

export default CommentSection;
