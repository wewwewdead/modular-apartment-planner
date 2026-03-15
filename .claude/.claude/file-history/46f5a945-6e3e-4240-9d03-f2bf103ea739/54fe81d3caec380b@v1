import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getOpinions } from "../../../API/Api";
import { useAuth } from "../../Context/useAuth";
import { useInView } from "react-intersection-observer";
import { useMediaQuery } from "react-responsive";
import { handleClickProfile } from "../../../helpers/handleClicks";
import OpinionEditor from "./OpinionsEditor";
import formatPostDate from "../../../helpers/formatDateString";
import VerifiedBadge from "../Badge/VerifiedBadge";
import MentionText from "../mentions/MentionText";

const cardVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: (i) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.3, delay: i * 0.04, ease: "easeOut" }
    })
};

const OpinionsPage = () =>{
    const [showHeaders, setShowHeaders] = useState(true);
    const [showWriteContainer, setShowWriteContainer] = useState(true);
    const [scrollReady, setScrollReady] = useState(false);
    const {ref, inView} = useInView({threshold: 0.5, rootMargin: '200px'});

    const isMobile = useMediaQuery({query: '(max-width: 480px'});

    const timeoutRef = useRef();
    const {user, session, openAuthModal} = useAuth();
    const queryClient = useQueryClient();

    const [openOpinionEditor, setOpenOpinionEditor] = useState(false);

    const {isLoading, data, fetchNextPage, isFetchingNextPage, hasNextPage} = useInfiniteQuery({
        queryKey: ['getOpinions'],
        queryFn:({pageParam = null}) => getOpinions(pageParam, 5),
        getNextPageParam: (lastPage) => {
            if(lastPage.hasMore){
                const lastOpinion = lastPage?.data[lastPage?.data.length - 1];
                return lastOpinion.id;
            } else {
                return undefined;
            }
        },
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60 * 5,
    })

    const links = [
        {label: 'Writings', path: '/home'},
        {label: 'Opinions', path: '/home/opinions'}
    ]
    const location = useLocation();
    const navigate = useNavigate();

    const handleClickLinks = (path) => {
        navigate(path);
    }

    const handleClickWriteOpinion = (e) =>{
        e.stopPropagation();
        if(!session) return openAuthModal();
        setOpenOpinionEditor(true)
    }

    const closeOpinionEditor = () =>{
        setOpenOpinionEditor(false);
    }

    const handleClickOpinionProfileOriginal = handleClickProfile(navigate);
    const handleClickOpinionProfile = (e, loggedInUserId, clickedUserId) => {
        if(!session){
            e.stopPropagation();
            return openAuthModal();
        }
        handleClickOpinionProfileOriginal(e, loggedInUserId, clickedUserId);
    };

    const handleClickContent = (e, opinionId, userId) =>{
        e.stopPropagation();
        if(!session) return openAuthModal();
        navigate('/home/opinionsViewer', {
            state: {
                opinionId: opinionId,
                userId: userId
            }
        })
    }

    useLayoutEffect(() =>{
        const scrollContainer = document.querySelector('.home-parent-container');
        if (scrollContainer) {
            scrollContainer.scrollTop = 0;
        } else {
            window.scrollTo(0, 0);
        }
    }, [])

    useEffect(() =>{
        const id = requestAnimationFrame(() => setScrollReady(true));
        return () => cancelAnimationFrame(id);
    }, [])

    useEffect(() =>{
        const scroll = () =>{
            setShowHeaders(false);
            setShowWriteContainer(false)
            if(timeoutRef.current){
                clearTimeout(timeoutRef.current)
            }

            timeoutRef.current = setTimeout(() =>{
                setShowHeaders(true)
                setShowWriteContainer(true)
            }, 500)
        }
        document.addEventListener('scroll', scroll, true)
        return () =>{
            document.removeEventListener('scroll', scroll)
            if(timeoutRef.current){
                clearTimeout(timeoutRef.current)
            }
        }
    }, [])

    useEffect(() =>{
        if(scrollReady && inView && hasNextPage && !isFetchingNextPage){
            fetchNextPage();
        }
    }, [scrollReady, inView, hasNextPage, isFetchingNextPage, fetchNextPage])

    const opinions = data?.pages.flatMap((page) => page.data) || [];

    const fabButton = showWriteContainer && (
        <motion.div
            className="write-opinion-fab"
            onClick={(e) => handleClickWriteOpinion(e)}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.3, ease: 'easeOut' } }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2, ease: 'easeIn' } }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
        </motion.div>
    );

    const headerNav = showHeaders && (
        <motion.div
            className="newsfeed-header"
            initial={{opacity: 0}}
            animate={{opacity: 1, transition: {type: 'spring', stiffness: 300, damping: 25, mass: 0.8}}}
            exit={{ opacity: 0, y: -20, transition: { duration: 0.2, ease: "easeOut" } }}
        >
            {links.map((link, index) =>(
                <div onClick={() => handleClickLinks(link.path)} key={index} className='header-link'>
                    {link.label}
                    <div className={link.path === location.pathname ? "header-underline" : ''}></div>
                </div>
            ))}
        </motion.div>
    );

    if(opinions.length === 0 && !isLoading) {
        return (
            <AnimatePresence>
            <>
                {openOpinionEditor && (
                    <OpinionEditor onClose={closeOpinionEditor}/>
                )}
                {headerNav}
                <div className="opinions-page-parent-container">
                    {fabButton}
                    <div>
                        No opinions availabe
                    </div>
                </div>
            </>
            </AnimatePresence>
        )
    }

    return(
        <AnimatePresence>
        <>
        {openOpinionEditor && (
            <OpinionEditor onClose={closeOpinionEditor}/>
        )}
        {headerNav}

        <div className="opinions-page-parent-container">
            {fabButton}

            {opinions.map((opinion, index) => (
                <motion.div
                    key={opinion.id}
                    className="so-card-wrapper"
                    custom={index}
                    initial="hidden"
                    animate="visible"
                    variants={cardVariants}
                >
                    <div className="so-card">
                        <div className="so-card-content">
                            <div className="so-header-row">
                                <div className={`so-avatar-outer ${opinion.users.badge === 'legend' ? 'avatar-ring-legend' : opinion.users.badge === 'og' ? 'avatar-ring-og' : ''}`}>
                                    <img onClick={(e) => handleClickOpinionProfile(e, user?.userData[0].id, opinion.user_id)} className="so-avatar" src={opinion.users.image_url || "../../assets/profile.jpg"} alt={`${opinion?.users?.name || "User"} profile picture`} />
                                </div>
                                <span onClick={(e) => handleClickOpinionProfile(e, user?.userData[0].id, opinion.user_id)} className="so-username">{opinion.users.name}</span>
                                <VerifiedBadge badge={opinion.users.badge} size={14}/>
                                <span className="so-dot">·</span>
                                <span className="so-date">{formatPostDate(opinion.created_at)}</span>
                            </div>
                            <div className="so-body" onClick={(e) => handleClickContent(e, opinion.id, opinion.user_id)}>
                                <MentionText text={opinion.opinion} />
                            </div>
                            <div className="so-action-row">
                                <motion.button
                                    className="so-reply-btn"
                                    whileHover={{ scale: 1.04 }}
                                    whileTap={{ scale: 0.96 }}
                                    onClick={(e) => { e.stopPropagation(); if(!session) return openAuthModal(); navigate('/home/opinionsViewer', { state: { opinionId: opinion.id, userId: opinion.user_id } }); }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                    </svg>
                                    Reply
                                </motion.button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            ))}
            <div className="opinions-in-view" ref={ref}>
            </div>
        </div>


        </>
        </AnimatePresence>
    )
}

export default OpinionsPage;
