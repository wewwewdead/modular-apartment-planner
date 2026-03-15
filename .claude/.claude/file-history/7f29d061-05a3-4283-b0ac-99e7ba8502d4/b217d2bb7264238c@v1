import { useInfiniteQuery } from '@tanstack/react-query';
import './sidebarOpinions.css'
import { getOpinions } from '../../../API/Api';
import { useNavigate } from 'react-router-dom';
import { handleClickProfile } from '../../../helpers/handleClicks';
import { useAuth } from '../../Context/useAuth';
import { BarLoader, MoonLoader } from 'react-spinners';
import VerifiedBadge from '../Badge/VerifiedBadge';
import { useEffect } from 'react';

const SidebarOpinions = ({openEditor}) =>{
    const {user, session, openAuthModal} = useAuth();

    const handleOpenEditor = () =>{
        if(!session) return openAuthModal();
        openEditor();
    }
    const navigate = useNavigate();

    const handleClickOpionionsProfileOriginal = handleClickProfile(navigate);
    const handleClickOpionionsProfile = (e, loggedInUserId, clickedUserId) => {
        if(!session){
            e.stopPropagation();
            return openAuthModal();
        }
        handleClickOpionionsProfileOriginal(e, loggedInUserId, clickedUserId);
    };

    const {data, isLoading, fetchNextPage, isFetchingNextPage, hasNextPage} = useInfiniteQuery({
        queryKey: ['getOpinions'],
        queryFn: ({pageParam = null}) => getOpinions(pageParam, 5),
        getNextPageParam: (lastPage) =>{
            if(lastPage?.hasMore){
                const lastOpinion = lastPage?.data[lastPage?.data?.length - 1];
                return lastOpinion.id;
            } else {
                return undefined
            }
        },
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60 * 5,
    });

    const handleClickSeeMore = () =>{
        if(!isLoading && !isFetchingNextPage){
            fetchNextPage();;
        }
        
    }

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

    useEffect(() => {
        // console.log(data)
    }, [data])

    const getUserHandle = (opinionUser) => {
        if(!opinionUser?.user_email) return null;
        const handle = opinionUser.user_email.split('@')[0];
        return handle ? `@${handle}` : null;
    }

    const opinions = data?.pages.flatMap((page) => page.data) || [];
    
    if(opinions.length === 0){
        return(
            <div className='side-bar-opinions-parent-container'>
                <div className='signal-container'>
                    <p className='signal-header'>“Share what you believe. This is a free-speech space.”</p>
                    <button onClick={() => handleOpenEditor()} className='write-opinions-bttn'>
                        Write opinions
                    </button>
                </div>
                <div className='latest-opinions-container'>
                    <div className='latest-opinions-header'>
                        Latest opinions
                    </div>
                    <div className='sidebar-opinions-cards-container'>
                        No opinions availabe
                    </div>
                </div>
            </div>
        )
    }
    if(isLoading){
        return(
            <div className='side-bar-opinions-parent-container'>
                <div className='opinions-loading-container'>
                    <MoonLoader size={25} color="var(--loader-color)" speedMultiplier={1} loading={isLoading}/>
                </div>
            </div>
        )
    }
    return(
        <>
        <div className="side-bar-opinions-parent-container">
            <div className='signal-container'>
                <p className='signal-header'>“Share what you believe. This is a free-speech space.”</p>
                <button onClick={() => handleOpenEditor()} className='write-opinions-bttn'>
                    Write opinions
                </button>
            </div>

            <div className='latest-opinions-container'>
                <div className='latest-opinions-header'>
                    Latest opinions
                </div>
                <div className='sidebar-opinions-cards-container'>
                    {opinions.map((opinionsData) => {
                        const handle = getUserHandle(opinionsData?.users);
                        return (
                            <div key={opinionsData.id} className="so-card-wrapper">
                                <div className="so-card so-card--flat">
                                    <div className="so-card-content">
                                        <div className="so-user-row">
                                            <div className="so-user-meta">
                                                <div className={`so-avatar-outer ${opinionsData.users.badge === 'legend' ? 'avatar-ring-legend' : opinionsData.users.badge === 'og' ? 'avatar-ring-og' : ''}`}>
                                                    <img onClick={(e) => handleClickOpionionsProfile(e, user?.userData[0].id, opinionsData.user_id)} className="so-avatar" src={opinionsData.users.image_url || "../../assets/profile.jpg"} alt={`${opinionsData?.users?.name || "User"} profile picture`} />
                                                </div>
                                                <div className="so-name-block">
                                                    <div className="so-name-line">
                                                        <span onClick={(e) => handleClickOpionionsProfile(e, user?.userData[0].id, opinionsData.user_id)} className="so-username">{opinionsData.users.name}</span>
                                                        <VerifiedBadge badge={opinionsData.users.badge} size={14} />
                                                    </div>
                                                    {handle && (
                                                        <span className="so-handle">{handle}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="so-body" onClick={(e) => handleClickContent(e, opinionsData.id, opinionsData.user_id)}>
                                            {opinionsData.opinion}
                                        </div>
                                        <div className="so-meta-bar">
                                            <span className="so-reply-pill" onClick={(e) => { e.stopPropagation(); if(!session) return openAuthModal(); navigate('/home/opinionsViewer', { state: { opinionId: opinionsData.id, userId: opinionsData.user_id } }); }}>
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                                </svg>
                                                Reply
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                    {hasNextPage && (
                        <div onClick={() => handleClickSeeMore()} className='see-fullpage-bttn'>
                            See more
                        </div>
                    )}
                    
                </div>
            </div>
        </div>
        </>
    )
}
export default SidebarOpinions;

