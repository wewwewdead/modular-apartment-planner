import { useEffect, useRef } from 'react';
import './mobilesidebarlink.css';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../../Context/useAuth';
import { useTheme } from '../../Context/useTheme';
import { useLocation, useNavigate } from 'react-router-dom';
import { preloadProfileRoute } from '../../utils/preloadRoutes';

const MobileSidebarLink = ({onclose}) => {
    const {user, signOut, notifCount} = useAuth();
    const {theme, toggleTheme} = useTheme();
    const navigate = useNavigate();
    const location = useLocation();
    const userData = user?.userData?.[0];

    const clickProfile = () =>{
        preloadProfileRoute();
        navigate('/profile')
    }

    useEffect(() => {
        preloadProfileRoute();
    }, []);

    const handleClose =(e) =>{
        e.stopPropagation();
        onclose();
    }
    const navigatePath = (path) =>{
        navigate(path);
        return onclose()
    }

    return(
        <>
        <AnimatePresence>
        <div onClick={(e) => handleClose(e)} className="mobile-sidebar-bg">
            <motion.div
            initial={{x: -30}}
            animate={{opacity: 1, x: 0, transition: {duration: 0.18, ease: 'easeOut'}}}
            exit={{x: -30, transition: {duration: 0.14, ease: 'easeIn'}}}
            onClick={(e) => e.stopPropagation()} className='mobile-sidebar-link-container'
            >
                <div className='sidebar-profile-container'>

                    <div onClick={(e) => clickProfile()} className='sidebar-profile-avatar-container'>
                        <img className='sidebar-profile-avatar' src={userData?.image_url || '/assets/profile.jpg'} alt={`${userData?.name || "User"} profile picture`} />
                    </div>

                    <div onClick={signOut} className='sidebar-signout-bttn'>
                        Sign Out
                    </div>

                </div>
                <div onClick={(e) => clickProfile()} className='sidebar-profile-metadata'>
                    <p>{userData?.name}</p>
                    <p style={{fontWeight: 500, fontSize: '0.8rem'}}>{userData?.user_email}</p>
                </div>

                <div onClick={() => navigatePath('/home/notifications')} className='sidebar-mycollection-container'>
                    <div className={location.pathname === '/home/notifications' ? 'sidebar-my-collection-bttn-active' : 'sidebar-my-collection-bttn'}>
                        <div className="sidebar-notif-label">
                            Notifications
                            {notifCount > 0 && (
                                <span className="sidebar-notif-badge">{notifCount}</span>
                            )}
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" width="28px" height="28px" viewBox="0 0 24 24" fill={location.pathname === '/home/notifications' ? "#D4A853" : "#b6b6b6"}>
                            <path fillRule="evenodd" clipRule="evenodd" d="M14.802 19.8317C15.4184 19.7699 15.8349 20.4242 15.5437 20.9539C15.3385 21.3271 15.0493 21.6529 14.7029 21.9197C14.3496 22.1918 13.9397 22.4006 13.5 22.5408C13.0601 22.6812 12.593 22.7522 12.1242 22.7522C11.6554 22.7522 11.1883 22.6812 10.7484 22.5408C10.3087 22.4006 9.89883 22.1918 9.54556 21.9197C9.1991 21.6529 8.90988 21.3271 8.70472 20.9539C8.41354 20.4242 8.83002 19.7699 9.44644 19.8317C9.63869 19.851 11.1433 19.9981 12.1242 19.9981C13.1051 19.9981 14.6097 19.851 14.802 19.8317Z" />
                            <path fillRule="evenodd" clipRule="evenodd" d="M8.52901 2.08755C10.7932 1.00445 13.4465 0.967602 15.7423 1.98737L15.9475 2.07851C18.3532 3.14707 19.8934 5.4622 19.8934 8.0096L19.8934 9.27297C19.8934 10.2885 20.1236 11.2918 20.5681 12.213L20.8335 12.7632C22.0525 15.29 20.465 18.2435 17.6156 18.7498L17.455 18.7783C13.93 19.4046 10.3154 19.4046 6.79044 18.7783C3.90274 18.2653 2.37502 15.1943 3.77239 12.7115L3.99943 12.3082C4.55987 11.3124 4.85335 10.1981 4.85335 9.06596L4.85335 7.79233C4.85335 5.3744 6.27704 3.16478 8.52901 2.08755Z" />
                        </svg>
                    </div>
                </div>

                <div onClick={() => navigatePath('/home/bookmark')} className='sidebar-mycollection-container'>
                    <div className={location.pathname === '/home/bookmark' ? 'sidebar-my-collection-bttn-active' : 'sidebar-my-collection-bttn'}>
                        Bookmarks
                        <svg xmlns="http://www.w3.org/2000/svg" width="28px" height="28px" viewBox="0 0 24 24" fill="none">
                            <path fillRule="evenodd" clipRule="evenodd" d="M8 1.25C5.37665 1.25 3.25 3.37665 3.25 6V20.4648C3.25 21.7269 4.27311 22.75 5.53518 22.75C5.98634 22.75 6.42739 22.6165 6.80278 22.3662L11.3066 19.3636C11.7265 19.0837 12.2735 19.0837 12.6934 19.3636L17.1972 22.3662C17.5726 22.6165 18.0137 22.75 18.4648 22.75C19.7269 22.75 20.75 21.7269 20.75 20.4648V6C20.75 3.37665 18.6234 1.25 16 1.25H8ZM9 6.75C8.58579 6.75 8.25 7.08579 8.25 7.5C8.25 7.91421 8.58579 8.25 9 8.25H15C15.4142 8.25 15.75 7.91421 15.75 7.5C15.75 7.08579 15.4142 6.75 15 6.75H9Z" fill={location.pathname === '/home/bookmark' ? "#D4A853" : "#b6b6b6"} />
                        </svg>
                    </div>
                </div>

                <div onClick={() => navigatePath('/home/collections')} className='sidebar-mycollection-container'>
                    <div className={location.pathname === '/home/collections' ? 'sidebar-my-collection-bttn-active' : 'sidebar-my-collection-bttn'}>
                        My collections
                        <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" width="28px" height="28px" viewBox="0 0 24 24" version="1.1">
                            <title>ic_fluent_book_formula_recent_24_filled</title>
                            <desc>Created with Sketch.</desc>
                            <g id="🔍-System-Icons" stroke="none" strokeWidth="1" fill="none" fillRule="evenodd">
                                <g id="ic_fluent_book_formula_recent_24_filled" fill={location.pathname === '/home/collections' ? "#000000ff" : "#b6b6b6ff"} fillRule="nonzero">
                                    <path d="M18,2 C19.3807,2 20.5,3.11929 20.5,4.5 L20.5,18.75 C20.5,19.1642 20.1642,19.5 19.75,19.5 L5.5,19.5 C5.5,20.0523 5.94772,20.5 6.5,20.5 L19.75,20.5 C20.1642,20.5 20.5,20.8358 20.5,21.25 C20.5,21.6642 20.1642,22 19.75,22 L6.5,22 C5.11929,22 4,20.8807 4,19.5 L4,4.5 C4,3.11929 5.11929,2 6.5,2 L18,2 Z M12.8581,6.37799 C12.62598,5.90759933 11.9844378,5.87623996 11.6977281,6.28391187 L11.642,6.37799 L10.5416,8.60759 L8.08108,8.96512 C7.55966125,9.04088875 7.33187629,9.64635672 7.63705678,10.0449565 L7.70527,10.1217 L9.48571,11.8572 L9.06541,14.3078 C8.97598882,14.8291176 9.48575824,15.2340394 9.96079283,15.0617758 L10.0493,15.0226 L12.25,13.8656 L14.4508,15.0226 C14.9189412,15.2688118 15.4615792,14.9090388 15.444597,14.4040705 L15.4347,14.3078 L15.0143,11.8572 L16.7948,10.1217 C17.17205,9.75395625 17.0005109,9.13023984 16.5193002,8.98711816 L16.419,8.96512 L13.9585,8.60759 L12.8581,6.37799 Z M12.25,8.21029 L12.9001,9.52747 C12.9847857,9.69901857 13.1371367,9.82544224 13.3180464,9.87827058 L13.4107,9.89842 L14.8643,10.1096 L13.8124,11.1349 C13.6792333,11.2647333 13.6064139,11.442275 13.6076569,11.625106 L13.6174,11.7351 L13.8657,13.1829 L12.5656,12.4993 C12.4009333,12.4128 12.2096,12.3983833 12.0361023,12.45605 L11.9345,12.4993 L10.6343,13.1829 L10.8826,11.7351 C10.9141,11.55185 10.8686556,11.3654056 10.7601556,11.2181856 L10.6876,11.1349 L9.6358,10.1096 L11.0894,9.89842 C11.2787429,9.87091429 11.4460449,9.76506816 11.5521994,9.60935207 L11.6,9.52747 L12.25,8.21029 Z" id="🎨-Color">
                                    </path>
                                </g>
                            </g>
                        </svg>
                    </div>
                </div>

                <div className='mobile-theme-toggle' onClick={toggleTheme}>
                    <div className='mobile-theme-toggle-label'>
                        {theme === 'dark' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M480-360q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Zm0 80q-83 0-141.5-58.5T280-480q0-83 58.5-141.5T480-680q83 0 141.5 58.5T680-480q0 83-58.5 141.5T480-280ZM200-440H40v-80h160v80Zm720 0H760v-80h160v80ZM440-760v-160h80v160h-80Zm0 720v-160h80v160h-80ZM256-650l-101-97 57-59 96 100-52 56Zm492 496-97-101 53-55 101 97-57 59Zm-98-550 97-101 59 57-100 96-56-52ZM154-212l101-97 55 53-97 101-59-57Zm326-268Z"/></svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M480-120q-150 0-255-105T120-480q0-150 105-255t255-105q14 0 27.5 1t26.5 3q-41 29-65.5 75.5T444-660q0 90 63 153t153 63q55 0 101-24.5t75-65.5q2 13 3 26.5t1 27.5q0 150-105 255T480-120Zm0-80q88 0 158-48.5T740-375q-20 5-40 8t-40 3q-123 0-209.5-86.5T364-660q0-20 3-40t8-40q-78 32-126.5 102T200-480q0 116 82 198t198 82Zm-10-270Z"/></svg>
                        )}
                        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                    </div>
                    <div className={`theme-toggle-track ${theme === 'dark' ? 'active' : ''}`}>
                        <div className='theme-toggle-thumb'/>
                    </div>
                </div>

            </motion.div>
        </div>
        </AnimatePresence>
        </>
    )
}

export default MobileSidebarLink;
