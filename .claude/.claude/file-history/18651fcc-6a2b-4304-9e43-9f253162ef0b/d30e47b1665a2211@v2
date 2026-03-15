import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import '../ProfilePage/myprofile.css';
import './visitProfile.css';
import { useAuth } from '../../Context/useAuth';
import { getFollowsData, getUserData, getUserJournals, getUserByUsername } from '../../../API/Api';
import { Fragment, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import Sidebar from '../SideBar/Sidebar';
import { MoonLoader } from 'react-spinners';
import { useFollowMutation } from '../../utils/useMutation';
import debounce from '../../../helpers/debounce';
import VerifiedBadge from '../Badge/VerifiedBadge';
import formatCounts from '../../../helpers/fomatCounts';
import MobileNavlink from '../mobileNavLink/MobileNavLink';
import MobileSidebarLink from '../MobileSidebarLink/MobileSidebarLink';
import { useState } from 'react';
import WriteJournalButton from '../WriteJournalButton/WriteJournalButton';
import Editor from '../HomePage/Editor/Editor';
import Loader from '../loadingComponent/BgLoader';
import useProfileSeo from '../../seo/useProfileSeo';
import { createProfileSidebarLinks } from '../ProfilePage/constants/profileSidebarLinks';
import ShareMenu from '../ShareMenu/ShareMenu';
import { getProfileShareUrl } from '../../utils/getShareUrl';
import StreakBadge from '../Streak/StreakBadge';
import useStreakData from '../Streak/useStreakData';

const Visitprofile = () =>{
    const location = useLocation();
    const stateData = location.state;
    const { username: urlUsername } = useParams();
    const queryUserId = new URLSearchParams(location.search).get('userId');
    const isUsernameRoute = !!urlUsername;

    // Fetch user by username if on /@username route
    const { data: usernameData, isLoading: isLoadingByUsername } = useQuery({
        queryKey: ['userByUsername', urlUsername],
        queryFn: () => getUserByUsername(urlUsername),
        enabled: isUsernameRoute,
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
    });

    // Resolve visitedUserId from either username lookup, state, or query param
    const visitedUserId = isUsernameRoute
        ? usernameData?.userData?.[0]?.id
        : (stateData?.userId || queryUserId);

    const resolvedUsername = isUsernameRoute
        ? urlUsername
        : usernameData?.userData?.[0]?.username;

    const {session, user, notifCount, loading} = useAuth();

    const [showSidebar, setShowSidebar]= useState(false)
    const [opendRichTextEditor, setOpenRichTextEditor] = useState(false);
    const [showShareMenu, setShowShareMenu] = useState(false);

    const { data: visitedStreakData } = useStreakData(visitedUserId);
    const buttonRef = useRef();

    const navigate = useNavigate();
    const visitedProfileNavState = { userId: visitedUserId };
    const visibleProfileSections = [{id: 'stats'}, {id: 'bio'}, {id: 'joined_date'}];

    // Use @username paths when available, fall back to legacy /visitProfile paths
    const profileUsername = resolvedUsername || usernameData?.userData?.[0]?.username;
    const useNewUrls = !!profileUsername;
    const tablists = useNewUrls
        ? [
            {label: 'Writings', path: `/u/${profileUsername}`, action: () => navigate(`/u/${profileUsername}`, {state: visitedProfileNavState})},
            {label: 'Media', path: `/u/${profileUsername}/media`, action: () => navigate(`/u/${profileUsername}/media`, {state: visitedProfileNavState})},
            {label: 'Collections', path: `/u/${profileUsername}/collections`, action: () => navigate(`/u/${profileUsername}/collections`, {state: visitedProfileNavState})},
            {label: 'Opinions', path: `/u/${profileUsername}/opinions`, action: () => navigate(`/u/${profileUsername}/opinions`, {state: visitedProfileNavState})},
            {label: 'Stories', path: `/u/${profileUsername}/stories`, action: () => navigate(`/u/${profileUsername}/stories`, {state: visitedProfileNavState})}
        ]
        : [
            {label: 'Writings', path: '/visitProfile', action: () => navigate(`/visitProfile?userId=${visitedUserId || ''}`, {state: visitedProfileNavState})},
            {label: 'Media', path: '/visitProfile/media', action: () => navigate(`/visitProfile/media?userId=${visitedUserId || ''}`, {state: visitedProfileNavState})},
            {label: 'Collections', path: '/visitProfile/visitedCollections', action: () => navigate(`/visitProfile/visitedCollections?userId=${visitedUserId || ''}`, {state: visitedProfileNavState})},
            {label: 'Opinions', path:'/visitProfile/visitedOpinions', action: () => navigate(`/visitProfile/visitedOpinions?userId=${visitedUserId || ''}`, {state: visitedProfileNavState})},
            {label: 'Stories', path:'/visitProfile/stories', action: () => navigate(`/visitProfile/stories?userId=${visitedUserId || ''}`, {state: visitedProfileNavState})}
        ]

     const navigatePath = (path) => {
        return navigate(path)
    }

    const handleMouseMove = (isFollowing) =>{
        if(buttonRef.current){
            if(isFollowing){
                buttonRef.current.innerText = 'Unfollow'
            } else {
                return
            }
        }
    }

    //open rich text editor
    const handleClickRichtextEditor = () =>{
        setOpenRichTextEditor(true);
    }
    //close rich text editor
    const handleCloseRichtextEditor = () =>{
        setOpenRichTextEditor(false);
    }

    // open sidebar through boolean function
    const openSidebar = () =>{
        setShowSidebar(true)
    }

    // close sidebar through boolean function
    const closeSidebar = () =>{
        setShowSidebar(false)
    }

    const handleMouseLeave = (isFollowing) =>{
        if(buttonRef.current){
            if(isFollowing){
                buttonRef.current.innerText = 'Following'
            } else {
                return
            }
        }
    }

    const mutationFollow = useFollowMutation(session);
    const hadnleClickFollow = (e, followingId, followerId,) =>{
        mutationFollow.mutate({followingId, followerId})
    }
    const debounceClickFollow = debounce(hadnleClickFollow, 0)

    const links = createProfileSidebarLinks({
        location,
        navigatePath,
        navigate,
        notifCount,
        setShowEditor: setOpenRichTextEditor,
    });

    
    const {data, isLoading} = useQuery({
        queryKey: ['visitedProfile', visitedUserId],
        queryFn:({queryKey}) => getUserData(queryKey[1]),
        enabled: !!visitedUserId && !isUsernameRoute,
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60 * 10
    })

    // Use username-fetched data when on /@username route, otherwise use userId-fetched data
    const userData = isUsernameRoute
        ? usernameData?.userData?.[0]
        : data?.userData?.[0]

    useProfileSeo(userData, profileUsername);
    const getProfileSectionSize = () => 'md';

    const{data: followsData, isLoading: isLoadingFollowsData} = useQuery({
        queryKey: ['followsData', user?.userData?.[0].id, visitedUserId],
        queryFn: ({queryKey}) => getFollowsData(queryKey[1], queryKey[2]),
        staleTime: 1000 * 60 * 60,
        cacheTime: 1000 * 60 * 60,
        enabled: !!user?.userData?.[0].id && !!visitedUserId,
        refetchOnWindowFocus: false
    })


    useEffect(() =>{
        console.log(data)
    }, [data])

    useEffect(() => {
        if(!session && !loading){
            return navigate('/login')
            //check if the user has user metadata on the users table database if not then show a UI that let them input there data and save to database
        }
    
    },[session, loading])

    if(isLoading || isLoadingByUsername){
        return(
            <Loader/>
        )
    }
    return(
        <>{opendRichTextEditor &&(
            <Editor onClose={handleCloseRichtextEditor}/>
        )}
        
        <div className='profile-parent-container'>
            {userData?.background && (
                <div className="blurred-img-bg" style={userData?.background}/>
            )}

            <div className="side-bar-holder-container">
                <Sidebar links={links}/> {/*passing the setShowEditor to this component to be used as a state setter inside this component*/}
            </div>

            <div style={{color: userData?.profile_font_color}} className="profile-center-bar-container">
                {userData && (

                    <div style={userData?.background} className='visit-profile-hero-section'>

                        <div className='visited-profile-top-row'>
                            <div className={`profile-avatar-ring ${userData?.badge === 'legend' ? 'badge-ring-legend' : userData?.badge === 'og' ? 'badge-ring-og' : ''}`}>
                                <img className='visited-profile-image' src={userData?.image_url || '/assets/profile.jpg'} alt={`${userData?.name || "User"} profile picture`} />
                            </div>
                        </div>

                        <div className='visited-profile-name-container'>
                            <div className='visited-profile-name-row'>
                                <p className='visited-profile-name'>{userData?.name}</p>
                                <VerifiedBadge badge={userData?.badge} size={22} />
                                <StreakBadge count={visitedStreakData?.current_streak} size={18} />
                                {userData?.badge && (
                                    <span className={`badge-pill ${userData.badge === 'legend' ? 'badge-pill-legend' : 'badge-pill-og'}`}>
                                        {userData.badge === 'legend' ? 'Legend' : 'OG'}
                                    </span>
                                )}
                            </div>
                            {(profileUsername || userData?.username) && (
                                <p className="visited-profile-handle">@{profileUsername || userData.username}</p>
                            )}
                        </div>

                        <div className='visited-profile-layout-sections'>
                            {visibleProfileSections.map((section) => {
                                const sectionSize = getProfileSectionSize(section.id);

                                if(section.id === 'stats'){
                                    return (
                                        <Fragment key={section.id}>
                                            <div className={`visited-profile-stats-container profile-section-size-${sectionSize}`}>
                                                <div className='visited-profile-stat-item'>
                                                    <span className='visited-stat-number'>{formatCounts(followsData?.followersCount)}</span>
                                                    <span className='visited-stat-label'>Followers</span>
                                                </div>
                                                <div className='visited-profile-stat-item'>
                                                    <span className='visited-stat-number'>{formatCounts(followsData?.followingsCount)}</span>
                                                    <span className='visited-stat-label'>Following</span>
                                                </div>
                                            </div>
                                        </Fragment>
                                    );
                                }

                                if(section.id === 'bio'){
                                    return (
                                        <Fragment key={section.id}>
                                            <div className={`visited-profile-bio-container profile-section-size-${sectionSize}`}>
                                                <p style={{margin: 0, padding: 0}}>{userData?.bio}</p>
                                            </div>
                                        </Fragment>
                                    );
                                }

                                if(section.id === 'joined_date'){
                                    return (
                                        <Fragment key={section.id}>
                                            <div className={`visited-profile-joined-date profile-section-size-${sectionSize}`}>
                                                <p className='visited-profile-date-joined'>{new Date(userData?.created_at).toLocaleDateString('en-US', {
                                                    month: 'long',
                                                    day: '2-digit',
                                                    year: 'numeric'
                                                })}</p>
                                            </div>
                                        </Fragment>
                                    );
                                }

                                return null;
                            })}
                        </div>

                        <div className='visited-profile-actions-row'>
                            <div onMouseMove={() => handleMouseMove(followsData?.isFollowing)} onMouseLeave={() => handleMouseLeave(followsData?.isFollowing)} className='visited-profile-follow-button-container'>
                                <button onClick={(e) => debounceClickFollow(e, visitedUserId, user?.userData?.[0].id)} ref={buttonRef} className={followsData?.isFollowing ? 'unfollow-visited-profile-bttn' : 'follow-visited-profile-bttn'}>
                                    {followsData?.isFollowing ? 'Following' : 'Follow'}
                                </button>
                            </div>
                            {(profileUsername || userData?.username) && (
                                <div className="visit-profile-share-btn" style={{ position: 'relative' }} onClick={(e) => { e.stopPropagation(); setShowShareMenu((v) => !v); }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 24 24" width="18px" fill="currentColor">
                                        <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
                                    </svg>
                                    {showShareMenu && (
                                        <ShareMenu
                                            url={getProfileShareUrl(profileUsername || userData.username)}
                                            title={`${userData.name || profileUsername || userData.username}'s Profile`}
                                            onClose={() => setShowShareMenu(false)}
                                        />
                                    )}
                                </div>
                            )}
                        </div>

                    </div>

                    )
                }

                <div className='my-profile-tablist'>
                    {tablists.map((tab, index) => (
                         <div key={index} onClick={() => tab.action()} className='tab-container'>
                            {tab.label}
                            <div className={location.pathname === tab.path ? 'tab-indicator' : ''}/>
                        </div>
                    ))}
                   
                </div>

                <Outlet/>

            </div>
            
            <div className="profile-sidebar-right-holder-container" />

            {showSidebar && (
                <MobileSidebarLink onclose={closeSidebar}/>
            )}
            
            {<MobileNavlink clickOpenSidebar={openSidebar}/>}
            <WriteJournalButton onOpen={handleClickRichtextEditor}/>
        </div>
        </>

    )
}
export default Visitprofile;
