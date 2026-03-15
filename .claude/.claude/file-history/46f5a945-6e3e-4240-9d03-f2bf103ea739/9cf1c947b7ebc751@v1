import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "../../Context/useAuth";
import { getMyOpinions } from "../../../API/Api";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import VerifiedBadge from "../Badge/VerifiedBadge";
import formatPostDate from "../../../helpers/formatDateString";
import { MoonLoader } from "react-spinners";
import MentionText from "../mentions/MentionText";

const MyOpinions = () =>{
    const {session, user, openAuthModal} = useAuth();

    const navigate = useNavigate();
    const {ref, inView} = useInView({threshold: 0, rootMargin: '200px'})

    const {data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage} = useInfiniteQuery({
        queryKey: ['getMyOpinions', session?.user?.id],
        queryFn: ({pageParam = null}) => getMyOpinions(pageParam, 5, session?.access_token),
        getNextPageParam: (lastPage) => {
            if(lastPage.hasMore){
                const lastOpinion = lastPage?.data[lastPage.data.length - 1];
                return lastOpinion.id
            } else {
                return undefined;
            }
        },
        refetchOnWindowFocus: false,
        enabled: !!session,
        staleTime: 1000 * 60 * 5
    })

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
        if(inView && hasNextPage && !isFetchingNextPage){
            fetchNextPage();
        }
    }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage])

    const opinions = data?.pages?.flatMap((page) => page.data) || [];

    if(opinions.length === 0 && !isLoading){
        return (
            <>
            <div className="my-opinions-container">
                No opinions availabe
            </div>
            </>
        )
    }

    return(
        <>
        <AnimatePresence>
        <div className="my-opinions-container">

            {opinions.map((opinion) => (
                <motion.div
                    className="ov-card"
                    key={opinion.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                >
                    <div className="ov-user-row">
                        <div className={`ov-avatar-container ${user?.userData[0]?.badge === 'legend' ? 'avatar-ring-legend' : user?.userData[0]?.badge === 'og' ? 'avatar-ring-og' : ''}`}>
                            <img className="ov-avatar" src={user?.userData[0].image_url || "../../assets/profile.jpg"} alt={`${user?.userData?.[0]?.name || "User"} profile picture`} />
                        </div>
                        <span className="ov-username">{user?.userData[0].name}</span>
                        <VerifiedBadge badge={user?.userData[0]?.badge} size={14} />
                        <span className="ov-dot">·</span>
                        <span className="ov-date">{formatPostDate(opinion.created_at)}</span>
                    </div>

                    <div
                        onClick={(e) => handleClickContent(e, opinion.id, user?.userData[0].id)}
                        className="ov-body"
                    >
                        <MentionText text={opinion.opinion} />
                    </div>

                    <div className="ov-meta-bar">
                        <span className="ov-reply-pill" onClick={(e) => { e.stopPropagation(); navigate('/home/opinionsViewer', { state: { opinionId: opinion.id, userId: opinion.user_id } }); }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            {opinion.reply_count || 0} {opinion.reply_count === 1 ? 'reply' : 'replies'}
                        </span>
                        <span className="ov-full-date">
                            {new Date(opinion.created_at).toLocaleDateString('en-US', {
                                month: 'long',
                                day: '2-digit',
                                year: 'numeric',
                            })}
                        </span>
                    </div>
                </motion.div>
            ))}

            <div ref={ref} className="my-opinions-inview-container">

            </div>

        </div>
        </AnimatePresence>
        </>
    )
}

export default MyOpinions;
