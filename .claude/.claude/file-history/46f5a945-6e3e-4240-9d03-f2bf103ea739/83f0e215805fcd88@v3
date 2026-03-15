import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "../../Context/useAuth";
import { useInView } from "react-intersection-observer";
import { MoonLoader } from "react-spinners";
import { getNotifications } from "../../../API/Api";
import { useEffect, useRef, useState, useMemo } from "react";
import FormatNotificationType from "../../../helpers/formatNoficationType";
import formatPostDate from "../../../helpers/formatDateString";
import { handleCLickContent, handleClickOpinion } from "../../../helpers/handleClicks";
import { useNavigate } from "react-router-dom";
import { useReadNotificationMutation, useUserDeleteNotificationMutation } from "../../utils/useMutation";
import { AnimatePresence, motion} from "framer-motion";
import VerifiedBadge from "../Badge/VerifiedBadge";
import { handleImageFallback } from "../../utils/handleImageFallback";
import { getReactionEmoji } from "../../utils/reactionConfig";
import { getBadgeRingClass } from "../../utils/badgeRingClass";
import { NOTIFICATION_ICON_MAP } from "./notificationIcons";

const NotificationCards = () =>{
    const {user, session} = useAuth();
    const {ref, inView} = useInView({
        threshold: 0.2
    })
    const navigate = useNavigate();

    const scrollToTop = useRef();
    const modalRef = useRef();
    const [settingsId, setSettingsId] = useState(null);


    const handleClickNotif = handleCLickContent(navigate);
    const handleClickOpinionNotif = handleClickOpinion(navigate);
    const mutationReadNotif = useReadNotificationMutation(session);

    const handleReadNotif = async(e, notification) => {
        e.stopPropagation();
        const source = notification?.source || 'journal';
        mutationReadNotif.mutate({notifId: notification.id, source})

        if(source === 'opinion'){
            handleClickOpinionNotif(e, notification?.opinions?.id, notification?.opinions?.user_id)
        } else if(notification?.type === 'follow'){
            navigate(`/visitProfile?userId=${notification?.sender_id}`);
        } else if(notification?.type === 'repost' && notification?.repost_journal_id){
            // Navigate to the repost post (quote + embedded original)
            const repostId = notification.repost_journal_id;
            const encodedId = encodeURIComponent(repostId);
            navigate(`/home/post/${encodedId}`);
        } else {
            handleClickNotif(
                e,
                null,
                '',
                notification?.journals?.title,
                notification?.journals?.users.id,
                notification?.journals?.users?.name,
                notification?.journals?.users?.image_url,
                notification?.journals?.created_at,
                notification?.journal_id,
                notification?.hasLiked,
                0,
                notification?.hasBookMarked,
                0,
                0,
                notification?.journals?.users?.badge,
            )
        }
    }

    const {data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage} = useInfiniteQuery({
        queryKey: ['getNotifications', session?.user?.id],
        queryFn: ({pageParam = null}) => getNotifications(session?.access_token, pageParam, 5),
        getNextPageParam: (lastpage) =>{
            if(lastpage?.hasMore){
                const lastNotification = lastpage?.data[lastpage?.data.length - 1];
                return new Date(lastNotification.created_at).toISOString();

            }
            return undefined;
        },
        enabled: !!session?.access_token,
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60 * 2
    })

    useEffect(() =>{
        if(scrollToTop.current && !isLoading){
            scrollToTop.current.scrollIntoView({behavior: 'smooth'});
        }
    }, [isLoading])

    useEffect(() =>{
        if(hasNextPage && !isFetchingNextPage && inView){
            // console.log(hasNextPage)
            fetchNextPage();
        }
    }, [hasNextPage, isFetchingNextPage, inView, fetchNextPage])

    const notifications = useMemo(() => data?.pages?.flatMap((page) => page?.data) || [], [data]);

    useEffect(() =>{
        const handleClickOutside = (e) =>{
            if(modalRef.current && !modalRef.current.contains(e.target)){
                setSettingsId(null);
                // console.log('close')
            }
        }

        document.addEventListener('click', handleClickOutside);
        return () =>{
            document.removeEventListener('click', handleClickOutside)
        }
    }, [])

    const handleClickSettings = (e, notifId) =>{
        e.stopPropagation();
        // console.log(notifId)
        setSettingsId(settingsId === notifId ? null : notifId);
    }

    const mutationDeleteNotif  = useUserDeleteNotificationMutation(session);

    const handleClickDeleteNotification = async(e, notifId, source) =>{
        e.stopPropagation();
        try {
           const message = mutationDeleteNotif.mutateAsync({notifId, source});
            if(message){
                // console.log(message)
            }
        } catch (error) {
            console.error('error while deleting notification:', error)
        }
    }

    if(notifications.length === 0 && !isLoading){
        return(
            <div className='notification-loading-container'>
                No notifications available
            </div>
        )
    }

    if(isLoading){
        return(
            <div className="notification-loading-container">
                <MoonLoader size={25} color="var(--loader-color)" loading={isLoading}/>
            </div>
        )
    }

    return(
        <>
        <div ref={scrollToTop}/>
        <div className="notifications-container">
            {notifications?.map((notification) => {
                const isOpinion = notification?.source === 'opinion';
                const displayType = isOpinion
                    ? (notification?.type === 'mention' ? 'mention' : 'opinion_reply')
                    : notification?.type;
                const previewText = !isOpinion ? (notification?.journals?.preview_text || '') : '';
                const thumbnailUrl = !isOpinion ? (notification?.journals?.thumbnail_url || null) : null;

                return(
                <div key={`${notification.source}-${notification.id}`} className={notification?.read ? "notification-cards" : "notification-cards-unread"}>

                    <div className="notification-cards-child-container">

                        <div className="notification-icon-container">
                            <div className="notification-icon">
                                {displayType === 'reaction'
                                    ? <span style={{ fontSize: '26px', lineHeight: 1 }}>{getReactionEmoji(notification?.reaction_type) || '❤️'}</span>
                                    : NOTIFICATION_ICON_MAP.get(displayType) ?? null
                                }
                            </div>
                        </div>

                        <div className="notification-contents-container">

                            <div className="notification-sender-user-metadata">
                                <div className="notification-sender-user-metadata-child">
                                    <div className={`notif-sender-profilepic-container ${getBadgeRingClass(notification?.users?.badge, 'notif-avatar-ring')}`}>
                                        <img loading="lazy" className="notif-sender-profilepic" src={notification?.users?.image_url || '/assets/profile.jpg'} alt="notificataion sender profile picture" />
                                    </div>

                                    <div className="notif-sender-name-container">
                                        <p className="notif-sender-name">{notification?.users?.name}</p>
                                        <VerifiedBadge badge={notification?.users?.badge} size={14} />
                                        <p className="notif-type">{FormatNotificationType(displayType, notification?.reaction_type)}</p>
                                    </div>

                                    <div className="notification-date-container">
                                        <p className="notification-date">{formatPostDate(notification?.created_at)}</p>
                                    </div>
                                </div>
                                <div className="notification-settings">
                                    {settingsId === notification.id && (
                                        <AnimatePresence>
                                        <motion.div
                                        initial={{opacity: 0, scale: 0}}
                                        animate={{opacity: 1, scale: 1, transition:{type: 'spring', stiffness: 300, damping: 25, mass: 0.8}}}
                                        exit={{ opacity: 0, scale: 0,
                                            transition: {
                                            duration: 0.2,
                                            ease: "easeOut"
                                            }
                                        }}
                                        ref={modalRef}
                                        className="settings-container">

                                            <div onClick={(e) => handleClickDeleteNotification(e, notification?.id, notification?.source)} className="delete-notification">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" fill="none">
                                                    <path d="M10 12V17" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                    <path d="M14 12V17" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                    <path d="M4 7H20" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                    <path d="M6 10V18C6 19.6569 7.34315 21 9 21H15C16.6569 21 18 19.6569 18 18V10" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                    <path d="M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5V7H9V5Z" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                </svg>
                                                Delete this notification
                                            </div>

                                        </motion.div>
                                        </AnimatePresence>
                                    )}

                                    <svg onClick={(e) => handleClickSettings(e, notification?.id)} xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" fill="none">
                                        <g id="style=fill">
                                            <g id="menu-meatballs">
                                                <path id="vector (Stroke)" fillRule="evenodd" clipRule="evenodd" d="M2.75 12C2.75 10.7574 3.75736 9.75 5 9.75C6.24264 9.75 7.25 10.7574 7.25 12C7.25 13.2426 6.24264 14.25 5 14.25C3.75736 14.25 2.75 13.2426 2.75 12Z" fill="#000000"/>
                                                <path id="vector (Stroke)_2" fillRule="evenodd" clipRule="evenodd" d="M9.75 12C9.75 10.7574 10.7574 9.75 12 9.75C13.2426 9.75 14.25 10.7574 14.25 12C14.25 13.2426 13.2426 14.25 12 14.25C10.7574 14.25 9.75 13.2426 9.75 12Z" fill="#000000"/>
                                                <path id="vector (Stroke)_3" fillRule="evenodd" clipRule="evenodd" d="M16.75 12C16.75 10.7574 17.7574 9.75 19 9.75C20.2426 9.75 21.25 10.7574 21.25 12C21.25 13.2426 20.2426 14.25 19 14.25C17.7574 14.25 16.75 13.2426 16.75 12Z" fill="#000000"/>
                                            </g>
                                        </g>
                                    </svg>
                                </div>

                            </div>

                            <div
                            className="notification-content"
                            onClick={(e) => handleReadNotif(e, notification)}
                            >
                                {displayType === 'follow' ? (
                                    <div className="notification-content-text">
                                        <p className="notif-content-sliced-text">started following you</p>
                                    </div>
                                ) : isOpinion ? (
                                    <div className="notification-content-text">
                                        <p className="notif-content-sliced-text">{notification?.opinions?.opinion?.length > 100 ? notification?.opinions?.opinion?.substring(0, 100) + '...' : notification?.opinions?.opinion}</p>
                                    </div>
                                ) : (
                                    <>
                                    <div className="notification-content-text">
                                        <p className="notif-content-title">{notification?.journals?.title?.length > 40 ? notification?.journals?.title?.substring(0, 39) : notification?.journals?.title}</p>
                                        <p className="notif-content-sliced-text">{previewText}</p>
                                    </div>
                                    <div className="notif-content-image-container">
                                        <img loading="lazy" className="notif-content-image" src={thumbnailUrl || '/assets/no-image.png'} alt={notification?.journals?.title ? `${notification.journals.title} cover image` : "Notification post cover image"} onError={handleImageFallback} />
                                    </div>
                                    </>
                                )}
                            </div>
                        </div>

                    </div>

                </div>
                )
            })}
            <div className="notification-inview-container" ref={ref}>
                {isFetchingNextPage && (
                    <MoonLoader size={20} color="var(--loader-color)"/>
                )}
                
            </div>
        </div>
        </>
    )
}

export default NotificationCards;
