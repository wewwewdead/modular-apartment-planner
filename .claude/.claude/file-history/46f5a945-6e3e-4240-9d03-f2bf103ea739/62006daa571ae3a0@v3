import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "../../Context/useAuth";
import { getUnreadNotification } from "../../../API/Api";
import { useEffect, useRef, useState } from "react";
import FormatNotificationType from "../../../helpers/formatNoficationType";
import formatPostDate from "../../../helpers/formatDateString";
import { useReadNotificationMutation, useUserDeleteNotificationMutation } from "../../utils/useMutation";
import { MoonLoader } from "react-spinners";
import { handleCLickContent, handleClickOpinion } from "../../../helpers/handleClicks";
import { useNavigate } from "react-router-dom";
import { useInView } from "react-intersection-observer";
import { AnimatePresence, motion } from "framer-motion";
import VerifiedBadge from "../Badge/VerifiedBadge";
import { handleImageFallback } from "../../utils/handleImageFallback";
import { getBadgeRingClass } from "../../utils/badgeRingClass";
import { NOTIFICATION_ICON_MAP } from "./notificationIcons";

const UnreadNotification = () =>{
    const {ref: inviewRef, inView} = useInView({threshold: 0.2});

    const {session, user} = useAuth();
    const modalRef = useRef();
    const navigate = useNavigate();

    const [settingsId, setSettingsId] = useState(null);

    const handleClickSettings = (e, notifId) =>{
        e.stopPropagation();
        setSettingsId(settingsId === notifId ? null : notifId);
    }

    const deleteNotifMutation = useUserDeleteNotificationMutation(session);
    const handleClickDeleteNotification = (e, notifId, source) =>{
        e.stopPropagation();
        try {
            const message = deleteNotifMutation.mutateAsync({notifId, source});
            if(message){
                // console.log(message)
            }
        } catch (error) {
            console.error('error deleting notification',error)
        }
    }


    const {data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage} = useInfiniteQuery({
        queryKey: ['unreadNotification', session?.user?.id],
        queryFn: ({pageParam = null}) => getUnreadNotification(session?.access_token, pageParam, 5),
        getNextPageParam: (lastPage) => {
            if(lastPage.hasMore){
                const lastJournal = lastPage?.data[lastPage?.data?.length - 1];
                return new Date(lastJournal.created_at).toISOString();
            } else {
                return undefined;
            }
        },
        enabled: !!session,
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60 * 2
    })

    useEffect(() => {
        if(inView && !isFetchingNextPage && hasNextPage){
            fetchNextPage();
        }
    }, [fetchNextPage, hasNextPage, isFetchingNextPage, inView])

    const handleClickNotif = handleCLickContent(navigate);
    const handleClickOpinionNotif = handleClickOpinion(navigate);
    const mutationReadNotif = useReadNotificationMutation(session);

    const handleReadNotif = async(e, notification) =>{
        const source = notification?.source || 'journal';
        mutationReadNotif.mutate({notifId: notification.id, source});

        if(source === 'opinion'){
            handleClickOpinionNotif(e, notification?.opinions?.id, notification?.opinions?.user_id)
        } else {
            handleClickNotif(
                e,
                null,
                '',
                notification?.journals?.title,
                notification?.journals?.users?.id,
                notification?.journals?.users?.name,
                notification?.journals?.users?.image_url,
                notification?.journals?.created_at,
                notification?.journal_id,
                notification?.hasLiked,
                0,
                notification?.hasBookMarked,
                0,
                0
            )
        }
    }

    const unreadNotifications = data?.pages?.flatMap((page) => page.data) || [];
    
    // useEffect(() =>{
    //     console.log(unreadNotifications)
    // }, [data])

    useEffect(() => {
        const handleClickOutside = (e) =>{
            if(modalRef.current && !modalRef.current.contains(e.target)){
                setSettingsId(null);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);

        return() => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [])

    if(unreadNotifications.length === 0 && !isLoading){
        return(
            <div className='notification-loading-container'>
                No unread notifications available
            </div>
        )
    }
    if(isLoading) {
        return(
            <div className="notification-loading-container">
                <MoonLoader size={25} color="var(--loader-color)" loading={isLoading}/>
            </div>
        )
    }

    return(
        <>
        <div className="unread-notification-component-container">
            {unreadNotifications?.map((unreadNotification) => {
                const isOpinion = unreadNotification?.source === 'opinion';
                const displayType = isOpinion
                    ? (unreadNotification?.type === 'mention' ? 'mention' : 'opinion_reply')
                    : unreadNotification?.type;
                const previewText = !isOpinion ? (unreadNotification?.journals?.preview_text || '') : '';
                const thumbnailUrl = !isOpinion ? (unreadNotification?.journals?.thumbnail_url || null) : null;

                return(
                    <div key={`${unreadNotification.source}-${unreadNotification.id}`} className={unreadNotification?.read ? "notification-cards" : "notification-cards-unread"}>

                        <div className="notification-cards-child-container">

                            <div className="notification-icon-container">
                                <div className="notification-icon">
                                    {NOTIFICATION_ICON_MAP.get(displayType) ?? null}
                                </div>
                            </div>

                            <div className="notification-contents-container">

                                <div className="notification-sender-user-metadata">
                                    <div className="notification-sender-user-metadata-child">
                                        <div className={`notif-sender-profilepic-container ${getBadgeRingClass(unreadNotification?.users?.badge, 'notif-avatar-ring')}`}>
                                            <img className="notif-sender-profilepic" loading="lazy" src={unreadNotification?.users?.image_url || '/assets/profile.jpg'} alt="notificataion sender profile picture" />
                                        </div>

                                        <div className="notif-sender-name-container">
                                            <p className="notif-sender-name">{unreadNotification?.users?.name}</p>
                                            <VerifiedBadge badge={unreadNotification?.users?.badge} size={14} />
                                            <p className="notif-type">{FormatNotificationType(displayType)}</p>
                                        </div>

                                        <div className="notification-date-container">
                                            <p className="notification-date">{formatPostDate(unreadNotification?.created_at)}</p>
                                        </div>

                                    </div>

                                    <div ref={modalRef} className="notification-settings">
                                        {settingsId === unreadNotification?.id && (
                                            <AnimatePresence>
                                            <motion.div
                                            initial={{opacity: 0, scale: 0}}
                                            animate={{opacity: 1, scale: 1, transition: {type: 'spring', stiffness: 300, damping: 25, mass: 0.8}}}
                                            exit={{opacity: 0, scale: 0, transition: {duration: 0.2, ease: 'easeInOut'}}}
                                            className="settings-container"
                                            >
                                                <div onClick={(e) => handleClickDeleteNotification(e, unreadNotification?.id, unreadNotification?.source)} className="delete-notification">
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

                                        <svg onClick={(e) => handleClickSettings(e, unreadNotification?.id)} xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" fill="none">
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

                                <div className="notification-content"
                                    onClick={(e) => handleReadNotif(e, unreadNotification)}
                                >
                                    {isOpinion ? (
                                        <div className="notification-content-text">
                                            <p className="notif-content-sliced-text">{unreadNotification?.opinions?.opinion?.length > 100 ? unreadNotification?.opinions?.opinion?.substring(0, 100) + '...' : unreadNotification?.opinions?.opinion}</p>
                                        </div>
                                    ) : (
                                        <>
                                        <div className="notification-content-text">
                                            <p className="notif-content-title">{unreadNotification?.journals?.title?.length > 40 ? unreadNotification?.journals?.title?.substring(0, 39) : unreadNotification?.journals?.title}</p>
                                            <p className="notif-content-sliced-text">{previewText}</p>
                                        </div>
                                        <div className="notif-content-image-container">
                                            <img className="notif-content-image" loading="lazy" src={thumbnailUrl || '/assets/no-image.png'} alt={unreadNotification?.journals?.title ? `${unreadNotification.journals.title} cover image` : "Notification post cover image"} onError={handleImageFallback} />
                                        </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                    </div>
                )
            })}
            <div ref={inviewRef} className="notification-inview-container">
                {isFetchingNextPage && (
                    <MoonLoader loading={isFetchingNextPage} color="var(--loader-color)" size={20}/>
                )}
            </div>
        </div>
        </>
    )
}

export default UnreadNotification;
