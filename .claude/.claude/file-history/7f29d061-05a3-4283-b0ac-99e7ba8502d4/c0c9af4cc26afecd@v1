import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getUserOpinions } from "../../../API/Api";
import { AnimatePresence, motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import VerifiedBadge from "../Badge/VerifiedBadge";
import { useAuth } from "../../Context/useAuth";
import { handleClickProfile } from "../../../helpers/handleClicks";
import formatPostDate from "../../../helpers/formatDateString";
import { MoonLoader } from "react-spinners";



const VisitedProfileOpinions = () =>{
    const {ref, inView} = useInView({threshold: 0, rootMargin: '200px'})
    const location = useLocation();
    const navigate = useNavigate();
    const userId = location.state?.userId || new URLSearchParams(location.search).get('userId');
   const {openAuthModal, session, user} = useAuth();;

    const {data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage} = useInfiniteQuery({
        queryKey: ['getUserOpinions', userId],
        queryFn: ({pageParam = null, queryKey}) => getUserOpinions(pageParam, 5, queryKey[1]),
        getNextPageParam: (lastPage) => {
            if(lastPage.hasMore){
                const lastOpinion = lastPage?.data[lastPage?.data.length - 1]
                return lastOpinion.id;
            } else {
                return undefined
            }
        },
        refetchOnWindowFocus: false,
        enabled: !!userId,
        staleTime: 1000 * 60 * 5
    })


    const handleClickOpionionsProfileOriginal = handleClickProfile(navigate);
    const handleClickOpionionsProfile = (e, loggedInUserId, clickedUserId) => {
        if(!session){
            e.stopPropagation();
            return openAuthModal();
        }
        handleClickOpionionsProfileOriginal(e, loggedInUserId, clickedUserId);
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

    useEffect(() =>{
        // console.log(userId)
    }, [userId])

    useEffect(() =>{
        if(inView && hasNextPage && !isFetchingNextPage){
            fetchNextPage();
        }
    },[inView, hasNextPage, isFetchingNextPage, fetchNextPage])

    const opinions = data?.pages?.flatMap((page) => page.data) || [];

    if(isLoading){
        return(
            <div className="visited-profile-opinions-container">
                <div className="opinions-loading-container">
                    <MoonLoader size={25} color="var(--loader-color)" speedMultiplier={1} loading={isLoading}/>
                </div>
            </div>
        )
    }

    if(opinions?.length === 0){
        return(
            <div className="visited-profile-opinions-container">
                No opinions available
            </div>
        )
    }

    return(
        <>
        <AnimatePresence>
        <div className="visited-profile-opinions-container">
            {opinions.map((opinion) => (
                <motion.div
                    className="so-card-wrapper"
                    key={opinion.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                >
                    <div className="so-card so-card--flat">
                        <div className="so-card-content">
                            <div className="so-user-row">
                                <div className="so-user-meta">
                                    <div className={`so-avatar-outer ${opinion.users.badge === 'legend' ? 'avatar-ring-legend' : opinion.users.badge === 'og' ? 'avatar-ring-og' : ''}`}>
                                        <img onClick={(e) => handleClickOpionionsProfile(e, user?.userData[0].id, userId)} className="so-avatar" src={opinion.users.image_url || "../../assets/profile.jpg"} alt={`${opinion?.users?.name || "User"} profile picture`} />
                                    </div>
                                    <div className="so-name-block">
                                        <div className="so-name-line">
                                            <span className="so-username">{opinion.users.name}</span>
                                            <VerifiedBadge badge={opinion.users.badge} size={14} />
                                        </div>
                                        <span className="so-handle">{formatPostDate(opinion.created_at)}</span>
                                    </div>
                                </div>
                            </div>

                            <div
                                onClick={(e) => handleClickContent(e, opinion.id, opinion.users.id)}
                                className="so-body"
                            >
                                {opinion.opinion}
                            </div>

                            <div className="so-meta-bar">
                                <span className="so-reply-pill" onClick={(e) => { e.stopPropagation(); navigate('/home/opinionsViewer', { state: { opinionId: opinion.id, userId: opinion.user_id } }); }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                    </svg>
                                    {opinion.reply_count || 0} {opinion.reply_count === 1 ? 'reply' : 'replies'}
                                </span>
                            </div>
                        </div>
                    </div>
                </motion.div>
            ))}

            <div ref={ref} className="visited-user-opinions-inview">
            </div>
        </div>
        </AnimatePresence>
        </>
    )
}

export default VisitedProfileOpinions;
