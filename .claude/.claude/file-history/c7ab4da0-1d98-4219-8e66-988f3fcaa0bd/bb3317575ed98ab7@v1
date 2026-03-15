import {useLocation, useNavigate } from 'react-router-dom';
import './profilepostcards.css';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useState, useCallback } from 'react';
import { MoonLoader } from 'react-spinners';
import { motion } from 'framer-motion';
import ParseContent from '../parseData';
import { useInView } from 'react-intersection-observer';
import { handleCLickContent } from '../../../../../helpers/handleClicks';
import { useAuth } from '../../../../Context/useAuth';
import { getVisitedUserJournals } from '../../../../../API/Api';
import { useAddViewsMutation } from '../../../../utils/useMutation';
import VerifiedBadge from '../../../Badge/VerifiedBadge';
import { handleImageFallback } from '../../../../utils/handleImageFallback';

const VisitedProfilePostCards = () =>{
    const location = useLocation();
    const userId = location.state?.userId || new URLSearchParams(location.search).get('userId');
    const {user, session} = useAuth();

    const navigate = useNavigate();

    const {ref, inView} = useInView({
        threshold: 0.2
    })

    const {data: journalData, isLoading: isLoadingJournals, isFetchingNextPage, fetchNextPage, hasNextPage,} = useInfiniteQuery({
        queryKey: ['visitedProfileJournals', userId, user?.userData?.[0]?.id],
        queryFn: ({pageParam = null, queryKey}) => getVisitedUserJournals(pageParam, 5, queryKey[1], queryKey[2]),
        getNextPageParam: (lastPage) => {
            if(lastPage.hasMore){
                const lastJournal = lastPage?.data[lastPage?.data.length - 1]
                return new Date(lastJournal.created_at).toISOString();
            } else {
                return undefined
            }
        },
        enabled: !!userId,
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60 * 5
    })

    const clickContent = handleCLickContent(navigate);
    const mutateViews = useAddViewsMutation(session);
    const viewContent = (e, jsonbContent,wholeText, title, userId, name, avatar, created_at, journalId, isLiked, commentsCount, isBookmarked, likesCount, bookmarksCount, badge, postType = null, userReaction = null, reactionCount = 0) =>{
        const formadata = new FormData();
        formadata.append('journalId', journalId)
        mutateViews.mutate(formadata);

        clickContent(e, jsonbContent,wholeText, title, userId, name, avatar, created_at, journalId, isLiked, commentsCount, isBookmarked, likesCount, bookmarksCount, badge, postType, userReaction, reactionCount);
    }

    useEffect(() =>{
        // console.log(userId)
    },[userId])

    const [viewMode, setViewMode] = useState('grid');

    useEffect(() =>{
        if(!isFetchingNextPage && hasNextPage && inView){
            fetchNextPage();
        }
    }, [inView, fetchNextPage, isFetchingNextPage, hasNextPage])

    const handleToggleView = useCallback(() => {
        setViewMode((prev) => (prev === 'list' ? 'grid' : 'list'));
    }, []);

    const journals = journalData?.pages.flatMap((page) => page.data) || [];


   if(isLoadingJournals){
        return(
            <>
            <div className='profile-postcards-loading-container'>
                <MoonLoader loading={isLoadingJournals} color="var(--loader-color)" size={20} speedMultiplier={0.5}/>
            </div>
            </>
        )
    }
    

    if(journalData && !journals?.length > 0){
        return (
            <div className='profile-postcards-loading-container'>
                No post available!
            </div>
        )
    }

    return(
        <>
        <div className='profile-postcards-parent-container'>
            <div className="postcards-header-row">
                <h2 className="postcards-heading">
                    Posts <span className="postcards-count">({journals.length})</span>
                </h2>
                <div className="postcards-header-actions">
                    <button
                        className={`postcards-view-toggle-btn ${viewMode === 'grid' ? 'is-active' : ''}`}
                        onClick={handleToggleView}
                        title={viewMode === 'grid' ? 'Switch to list' : 'Switch to grid'}
                    >
                        {viewMode === 'grid' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M120-520v-320h320v320H120Zm0 400v-320h320v320H120Zm400-400v-320h320v320H520Zm0 400v-320h320v320H520Z"/></svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M120-200v-560h720v560H120Z"/></svg>
                        )}
                    </button>
                </div>
            </div>

            {viewMode === 'grid' ? (
                <div className="postcards-grid-view">
                    {journals.map((journal) => {
                        const parsedContent = ParseContent(journal.content);
                        const wholeText = parsedContent?.wholeText || '';
                        const previewText = parsedContent?.slicedText || '';
                        const thumbnail = parsedContent?.firstImage?.src;
                        return (
                            <motion.div
                                key={journal.id}
                                className="postcards-grid-item"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.25, ease: 'easeOut' }}
                                onClick={(e) => viewContent(e, journal?.content, wholeText, journal?.title, userId, journal?.users?.name, journal?.users?.image_url, journal?.created_at, journal?.id, journal?.has_liked, journal?.comment_count?.[0].count, journal?.has_bookmarked, journal?.like_count?.[0].count, journal?.bookmark_count?.[0].count, journal?.users?.badge, journal?.post_type, journal?.user_reaction, journal?.reaction_count?.[0]?.count || 0)}
                            >
                                {thumbnail ? (
                                    <div className="postcards-grid-img-wrap">
                                        <img className="postcards-grid-thumb" src={thumbnail} alt={journal?.title ? `${journal.title} cover image` : "Post cover image"} loading="lazy" onError={handleImageFallback} />
                                    </div>
                                ) : null}
                                <div className="postcards-grid-body">
                                    <h3 className="postcards-grid-title">{journal.title.length > 32 ? `${journal.title.substring(0, 32)}...` : journal.title}</h3>
                                    {previewText && (
                                        <p className="postcards-grid-snippet">{previewText.length > 50 ? `${previewText.substring(0, 50)}...` : previewText}</p>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            ) : (
            <div className="postcards-list-view">
            {journals.map((journal, index) => {
                const parsedContent = ParseContent(journal.content);
                const wholeText = parsedContent?.wholeText || '';
                const previewText = parsedContent?.slicedText || '';
                const thumbnail = parsedContent?.firstImage?.src;
                const badgeClass = journal.users.badge === 'legend' ? 'avatar-ring-legend' : journal.users.badge === 'og' ? 'avatar-ring-og' : '';

                return(
                    <motion.div
                        key={journal.id || index}
                        className="profile-postcards"
                        initial={{opacity: 0, y: 12}}
                        animate={{opacity: 1, y: 0}}
                        transition={{duration: 0.3, ease: 'easeOut'}}
                    >
                        {thumbnail && (
                            <img
                                className="card-image-banner"
                                src={thumbnail}
                                alt={journal?.title ? `${journal.title} cover image` : "Post cover image"}
                                loading="lazy"
                                onError={handleImageFallback}
                                onClick={(e) => viewContent(e, journal?.content, wholeText, journal?.title, userId, journal?.users?.name, journal?.users?.image_url, journal?.created_at, journal?.id, journal?.has_liked, journal?.comment_count?.[0].count, journal?.has_bookmarked, journal?.like_count?.[0].count, journal?.bookmark_count?.[0].count, journal?.users?.badge, journal?.post_type, journal?.user_reaction, journal?.reaction_count?.[0]?.count || 0)}
                            />
                        )}

                        <div className='user-profile-card-content'>
                            <div onClick={(e) => viewContent(e, journal?.content, wholeText, journal?.title, userId, journal?.users?.name, journal?.users?.image_url, journal?.created_at, journal?.id, journal?.has_liked, journal?.comment_count?.[0].count, journal?.has_bookmarked, journal?.like_count?.[0].count, journal?.bookmark_count?.[0].count, journal?.users?.badge, journal?.post_type, journal?.user_reaction, journal?.reaction_count?.[0]?.count || 0)} className="content-container">
                                <div className='feed-text-content-container'>
                                    <div className='feed-title-content'>
                                        <h2 className="feed-title-profile-page">{journal.title.length > 55 ? `${journal.title.substring(0, 55)}...` : journal.title}</h2>
                                    </div>
                                    <p className="feed-text-content-profile-page">{previewText}</p>
                                </div>
                            </div>

                            <div className="card-icons-container">
                                <div className='user-info-child-container'>
                                    <div className={`user-avatar-container ${badgeClass}`}>
                                        <img src={journal.users.image_url || '/assets/profile.jpg'} alt="user-profile" loading='lazy' className="user-info-avatar"/>
                                    </div>
                                    <div className="user-name-container">
                                        <p className="user-newsfeed-name-profile-page">{journal.users.name}</p>
                                        <VerifiedBadge badge={journal.users.badge} size={14} />
                                    </div>
                                    <div className="name-info-separator">•</div>
                                    <p className="user-post-date">{new Date(journal.created_at).toLocaleDateString('en-US', {
                                        month: 'long',
                                        day: 'numeric',
                                        year: 'numeric'
                                    })}</p>

                                    <div className="user-post-settings">
                                        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M240-400q-33 0-56.5-23.5T160-480q0-33 23.5-56.5T240-560q33 0 56.5 23.5T320-480q0 33-23.5 56.5T240-400Zm240 0q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm240 0q-33 0-56.5-23.5T640-480q0-33 23.5-56.5T720-560q33 0 56.5 23.5T800-480q0 33-23.5 56.5T720-400Z"/></svg>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )
            })}
            </div>
            )}

            <div ref={ref} className='in-view-container'>
                {isFetchingNextPage && (
                    <MoonLoader size={20} color="var(--loader-color)" loading={isFetchingNextPage}/>
                )}
            </div>

        </div>
        </>
    )
}

export default VisitedProfilePostCards;
