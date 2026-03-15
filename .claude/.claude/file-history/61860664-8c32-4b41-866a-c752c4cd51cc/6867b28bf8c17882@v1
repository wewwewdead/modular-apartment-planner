import { useEffect, useState } from 'react';
import { getBookmarks } from '../../../API/Api';
import { useAuth } from '../../Context/useAuth';
import './bookmarks.css';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import CalculateText from '../HomePage/postCards/calculateReadingTime';
import { MoonLoader } from 'react-spinners';
import { motion, AnimatePresence } from 'framer-motion';
import { handleCLickContent, handleClickProfile } from '../../../helpers/handleClicks';
import { useNavigate } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import { useRef } from 'react';
import VerifiedBadge from '../Badge/VerifiedBadge';
import formatPostDate from '../../../helpers/formatDateString';
import { handleImageFallback } from '../../utils/handleImageFallback';

const Bookmarks = () =>{
    const {user, session} = useAuth();
    const userId = user?.userData?.[0].id
    const navigate = useNavigate();

    const {ref: inviewRef, inView} = useInView({
        threshold: 0.2
    });
    const timeOutRef = useRef();
    const scrollToTop = useRef();
    const modalRef = useRef(null);

    const [bookmarkIdSettings, setBookmarkIdSettings] = useState('');
    const [showHeaders, setShowHeaders] = useState(true);

    const handleclickUserProfile = handleClickProfile(navigate);

    const handleClickBookmarkSettings = (e, journalId) => {
        e.stopPropagation();
        setBookmarkIdSettings(journalId === bookmarkIdSettings ? null : journalId)
    }

    const handleBackLocation = (e) =>{
        e.stopPropagation();
        window.history.back();
    }

    const handleClick = handleCLickContent(navigate);

    const queryClient = useQueryClient();
    const {data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage} = useInfiniteQuery({
        queryKey: ['getBookmarks', userId],
        queryFn: ({queryKey, pageParam = null}) => getBookmarks(pageParam, 5, queryKey[1], session?.access_token),
        getNextPageParam: (lastPage) => {
            if(lastPage?.hasMore){
                const lastBookmark = lastPage.bookmarks[lastPage?.bookmarks?.length - 1];
                return new Date(lastBookmark.created_at).toISOString();
            } else {
                return undefined;
            }
        },
        enabled: !!userId,
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60 * 5,
    })

    useEffect(() =>{
        if(inView && hasNextPage && !isFetchingNextPage){
            fetchNextPage();
        }

    }, [hasNextPage, fetchNextPage, isFetchingNextPage, inView])

    useEffect(() =>{
        const scroll = () =>{
            setShowHeaders(false)
            if(timeOutRef.current){
                clearTimeout(timeOutRef.current)
            }
            timeOutRef.current = setTimeout(() =>{
                setShowHeaders(true)
            }, 500)
        }

        document.addEventListener('scroll', scroll, true)
        return () =>{
             if(timeOutRef.current){
                clearTimeout(timeOutRef.current);
            }
            document.removeEventListener('scroll', scroll, true)
        }
    }, [])

    useEffect(() =>{
        // console.log(data)
    }, [data])

    useEffect(() => {
        const handleClickOutside = (e) =>{
            if(modalRef.current && !modalRef.current.contains(e.target)){
                setBookmarkIdSettings(null)
            }
        }
        window.addEventListener('click', handleClickOutside)
        return() => {
            window.removeEventListener('click', handleClickOutside)
        }
    }, [])

    const journals = data?.pages?.flatMap((journal) => journal.bookmarks|| []);
    const totalBookmarks = data?.pages?.flatMap((journal) => journal.totalBookmarks)

    useEffect(() => {
        if(!isLoading && scrollToTop.current){
            scrollToTop.current.scrollIntoView({behavior: 'smooth'});
        }
    }, [isLoading])

    if(isLoading){
        return(
            <div className='bookmark-loading-container'>
                <MoonLoader loading={isLoading} color="var(--loader-color)" speedMultiplier={1} size={20}/>
            </div>
        )
    }
    if(journals?.length === 0){
        return(
            <div className='bookmark-parent-container'>
                <p>No bookmarks available</p>
            </div>
        )
    }


    return(
        <>
        <div ref={scrollToTop}/>
        <AnimatePresence>
        {showHeaders && (
            <motion.div
            className='bookmarks-header'
            initial={{opacity: 0}}
            animate={{opacity: 1, transition:{ type: 'spring', stiffness: 300, damping: 25, mass: 0.8}}}
            exit={{opacity:0, y: -20, transition:{duration: 0.2, ease: 'easeInOut'}}}
            >
                <div onClick={(e) => handleBackLocation(e)} className='back-button'>
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M360-240 120-480l240-240 56 56-144 144h568v80H272l144 144-56 56Z"/></svg>
                </div>

                <p className='bookmarks-header-text'>Bookmarks <span className='bookmarks-header-count'>({totalBookmarks})</span></p>
            </motion.div>
        )}
        </AnimatePresence>

        <div className='bookmark-parent-container'>
            {journals?.map((journal, index) => {
                const previewText = journal.journals.preview_text || '';
                const thumbnail = journal.journals.thumbnail_url || null;
                return(
                    <motion.div
                        className='bookmark-card'
                        key={journal.journals.id || index}
                    >

                        {thumbnail && (
                            <img
                                className="bookmark-card-image-banner"
                                src={thumbnail}
                                alt={journal?.journals?.title ? `${journal.journals.title} cover image` : "Bookmarked post cover image"}
                                loading="lazy"
                                onError={handleImageFallback}
                                onClick={(e) => handleClick(
                                    e,
                                    null,
                                    '',
                                    journal.journals.title,
                                    journal.journals.user_id,
                                    journal.journals.users.name,
                                    journal.journals.users.image_url,
                                    journal.journals.created_at,
                                    journal.journals.id,
                                    journal.has_liked,
                                    journal.journals.comment_count[0]?.count,
                                    journal.has_bookmarked,
                                    journal.journals.like_count?.[0]?.count,
                                    journal.journals.bookmark_count?.[0]?.count,
                                    journal.journals.users.badge
                                )}
                            />
                        )}

                        <div className="card-content">
                            <div onClick={(e) => handleClick(
                                e,
                                null,
                                '',
                                journal.journals.title,
                                journal.journals.user_id,
                                journal.journals.users.name,
                                journal.journals.users.image_url,
                                journal.journals.created_at,
                                journal.journals.id,
                                journal.has_liked,
                                journal.journals.comment_count[0]?.count,
                                journal.has_bookmarked,
                                journal.journals.like_count?.[0]?.count,
                                journal.journals.bookmark_count?.[0]?.count,
                                journal.journals.users.badge
                            )}
                                className="content-container">

                                <div className='feed-text-content-container'>
                                    <div className='feed-title-content'>
                                        <h2 className="feed-title">{journal.journals.title.length > 55 ? `${journal.journals.title.substring(0, 55)}...` : journal.journals.title}</h2>
                                    </div>
                                    <p className="feed-text-content">{previewText}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bookmark-card-footer">
                            <div className='user-info-child-container'>
                                <div onClick={(e) => handleclickUserProfile(e, user?.userData?.[0].id, journal.journals.user_id)} className={`user-avatar-container ${journal?.journals?.users?.badge === 'legend' ? 'avatar-ring-legend' : journal?.journals?.users?.badge === 'og' ? 'avatar-ring-og' : ''}`}>
                                    <img loading='lazy' src={journal?.journals?.users?.image_url || '/assets/profile.jpg'} className="user-info-avatar" alt={`${journal?.journals?.users?.name || "User"} profile picture`} />
                                </div>
                                <div onClick={(e) => handleclickUserProfile(e, user?.userData?.[0].id, journal.journals.user_id)} className="user-name-container">
                                    <p className="user-newsfeed-name">{journal?.journals?.users?.name}</p>
                                    <VerifiedBadge badge={journal?.journals?.users?.badge} size={14} />
                                </div>
                                <div className="name-info-separator">•</div>
                                <p className="user-post-date">{formatPostDate(journal.created_at)}</p>
                            </div>

                            <div className="bookmark-card-footer-right">
                                <div className="reading-time-container">
                                    <p className="reading-time-text">{CalculateText(previewText)}</p>
                                </div>

                                <div className="user-post-settings">
                                    <svg onClick={(e) => handleClickBookmarkSettings(e, journal.journals.id)} xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M240-400q-33 0-56.5-23.5T160-480q0-33 23.5-56.5T240-560q33 0 56.5 23.5T320-480q0 33-23.5 56.5T240-400Zm240 0q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm240 0q-33 0-56.5-23.5T640-480q0-33 23.5-56.5T720-560q33 0 56.5 23.5T800-480q0 33-23.5 56.5T720-400Z"/></svg>
                                    {bookmarkIdSettings === journal.journals.id && (
                                        <motion.div
                                        initial={{opacity:0 ,scale:0}}
                                        animate={{opacity:1, scale:1, transition: {type: "tween", duration: 0.3}}}
                                        exit={{opacity:0, scale:0, transition: {type: "tween", duration: 0.3}}}
                                        ref={modalRef}
                                        className="setting-modal"
                                        >
                                            <p>{journal.journals.title}</p>
                                        </motion.div>
                                    )}
                                </div>
                            </div>
                        </div>

                    </motion.div>
                )
            })}
            <div ref={inviewRef} className='inview-container'>
                <MoonLoader loading={isFetchingNextPage} color="rgba(255, 255, 255, 0.64)" speedMultiplier={1} size={20}/>
            </div>
        </div>
        </>
    )
}
export default Bookmarks;
