import React, { useEffect, useState, useRef} from "react";
import './home.css'
import { useAuth } from "../../Context/useAuth";
import { useNavigate, Outlet, useLocation } from "react-router-dom";
import Sidebar from "../SideBar/Sidebar";
import { MoonLoader, BeatLoader, BarLoader } from "react-spinners";
import { checkUser, getUserData, submitProfileData, checkUsernameAvailability } from "../../../API/Api";
import { motion, AnimatePresence } from "framer-motion";

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Editor from "./Editor/Editor";
import { useCallback } from "react";
import PostCards from "./postCards/PostCards";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import MobileNavlink from "../mobileNavLink/MobileNavLink";
import WriteJournalButton from "../WriteJournalButton/WriteJournalButton";
import MobileSidebarLink from "../MobileSidebarLink/MobileSidebarLink";
import WelcomeMessage from "../WelcomeMessage/WelcomeMessage";
import Loader from "../loadingComponent/BgLoader";
import SidebarOpinions from "../SidebarOpinions/SidebarOpinions";
import OpinionEditor from "../SidebarOpinions/OpinionsEditor";
import { useMediaQuery } from 'react-responsive';

const DEFAULT_EDITOR_LAUNCH_CONFIG = {
    initialMode: 'text',
    initialTitle: '',
    initialCanvasDoc: null,
    remixSource: null
};

const HomePage = () => {
    const {session, signOut, user, loading, isLoading, notifCount, openAuthModal} = useAuth();
    const isGuest = !session && !loading;

    const userId = user?.userData?.[0]?.id || null;

    const isMobile = useMediaQuery({query: '(max-width: 480px)'});

    const navigate = useNavigate();
    const location = useLocation();

    const queryClient = useQueryClient();
    const [editor] = useLexicalComposerContext();

    const [showMobileSideBar, setShowMobileSideBar] = useState(false);

    const isOpinionsPage = location.pathname === '/home/opinions';
    const isOpinionsViewer = location.pathname === '/home/opinionsViewer';

    const navigatePath = (path) => {
        if(window.location.pathname === path){
           return window.location.reload()
        }
        return navigate(path);
    }
    
    const homeLink = {
        path: '/home',
        label: 'Home',
        action: ()=> navigatePath('/home'),
        icon:
        <svg xmlns="http://www.w3.org/2000/svg" width="28px" height="28px" viewBox="0 0 24 24" fill="#000000ff">
            <g id="style=fill">
                <g id="home-line" clipPath="url(#clip0_1_110)">
                    <path id="Subtract" fillRule="evenodd" clipRule="evenodd" d="M14.3594 2.12613C13.0087 0.944612 10.9923 0.94461 9.64162 2.12612L3.2802 7.69086C2.29508 8.55261 1.72998 9.79772 1.72998 11.1066L1.72998 19.1672C1.72998 21.1459 3.33403 22.75 5.31273 22.75L18.6883 22.75C20.667 22.75 22.271 21.1459 22.271 19.1672L22.271 11.1066C22.271 9.79772 21.706 8.55261 20.7208 7.69086L14.3594 2.12613ZM10 16.1136C9.58579 16.1136 9.25 16.4494 9.25 16.8636C9.25 17.2779 9.58579 17.6136 10 17.6136L14 17.6136C14.4142 17.6136 14.75 17.2779 14.75 16.8636C14.75 16.4494 14.4142 16.1136 14 16.1136L10 16.1136Z" fill={location.pathname === '/home' ? "#5f92ffff" : "#b6b6b6ff"}/>
                </g>
            </g>
        </svg>
    };

    const exploreLink = {
        path: '/home/explore',
        label: 'Explore',
        action: () => navigatePath('/home/explore'),
        icon:
        <svg xmlns="http://www.w3.org/2000/svg" width="28px" height="28px" viewBox="0 0 24 24" fill="#000000">
            <path fillRule="evenodd" d="M12,2 C17.5228475,2 22,6.4771525 22,12 C22,17.5228475 17.5228475,22 12,22 C6.4771525,22 2,17.5228475 2,12 C2,6.4771525 6.4771525,2 12,2 Z M17.9842695,7.39078625 C18.1985588,6.64477525 17.4973604,5.9435768 16.7513494,6.1578661 L16.6494246,6.19284365 L9.57835679,9.02127078 L9.47282273,9.07079854 C9.30957453,9.15937167 9.17428758,9.29167162 9.08209683,9.45256344 L9.02127078,9.57835679 L6.19284365,16.6494246 L6.1578661,16.7513494 C5.9435768,17.4973604 6.64477525,18.1985588 7.39078625,17.9842695 L7.49271102,17.949292 L14.5637788,15.1208648 L14.6693129,15.0713371 C14.8325611,14.982764 14.967848,14.850464 15.0600388,14.6895722 L15.1208648,14.5637788 L17.949292,7.49271102 L17.9842695,7.39078625 Z M12,10 C13.1045695,10 14,10.8954305 14,12 C14,13.1045695 13.1045695,14 12,14 C10.8954305,14 10,13.1045695 10,12 C10,10.8954305 10.8954305,10 12,10 Z" fill={location.pathname === '/home/explore' ? "#5f92ffff" : "#b6b6b6ff"} />
        </svg>
    };

    const galleryLink = {
        path: '/home/gallery',
        label: 'Gallery',
        action: () => navigatePath('/home/gallery'),
        icon:
        <svg xmlns="http://www.w3.org/2000/svg" height="28px" viewBox="0 -960 960 960" width="28px" fill={location.pathname === '/home/gallery' ? "#5f92ff" : "#b6b6b6"}>
            <path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q63 0 121.5 18.5T709-807q-17 19-26 44t-9 52q0 53 37.5 90.5T802-583q27 0 52-9t44-26q36 49 54 107.5T970-480q0 83-31.5 156T853-197q-54 54-127 85.5T570-80H480Zm-12-196q30 0 51-21t21-51q0-30-21-51t-51-21q-30 0-51 21t-21 51q0 30 21 51t51 21Zm-153-84q24 0 42-18t18-42q0-24-18-42t-42-18q-24 0-42 18t-18 42q0 24 18 42t42 18Zm6-189q17 0 28.5-11.5T361-589q0-17-11.5-28.5T321-629q-17 0-28.5 11.5T281-589q0 17 11.5 28.5T321-549Zm183-66q36 0 60-24t24-60q0-36-24-60t-60-24q-36 0-60 24t-24 60q0 36 24 60t60 24Z"/>
        </svg>
    };

    const freedomWallLink = {
        path: '/home/freedom-wall',
        label: 'Freedom Wall',
        action: () => navigatePath('/home/freedom-wall'),
        className: location.pathname === '/home/freedom-wall' ? 'sidebar-freedom-wall-cta-active' : 'sidebar-freedom-wall-cta',
        icon:
        <svg xmlns="http://www.w3.org/2000/svg" width="28px" height="28px" viewBox="0 0 24 24" fill="none">
            <path d="M4 7.2A3.2 3.2 0 0 1 7.2 4h9.6A3.2 3.2 0 0 1 20 7.2v9.6a3.2 3.2 0 0 1-3.2 3.2H7.2A3.2 3.2 0 0 1 4 16.8V7.2Z" stroke={location.pathname === '/home/freedom-wall' ? "#ffffff" : "#e6a817"} strokeWidth="1.6"/>
            <path d="M8 15.5c1.7-3 2.4-3 4 0 1.5-2.2 2.1-2.2 3.9 0" stroke={location.pathname === '/home/freedom-wall' ? "#ffffff" : "#e6a817"} strokeWidth="1.6" strokeLinecap="round"/>
            <circle cx="9" cy="9.2" r="1.1" fill={location.pathname === '/home/freedom-wall' ? "#ffffff" : "#e6a817"} />
            <circle cx="14.2" cy="8.6" r="0.9" fill={location.pathname === '/home/freedom-wall' ? "#ffffff" : "#e6a817"} />
        </svg>
    };

    const universeLink = {
        path: '/universe',
        label: 'Universe',
        action: () => navigate('/universe'),
        icon:
        <svg xmlns="http://www.w3.org/2000/svg" width="28px" height="28px" viewBox="0 0 24 24" fill={location.pathname === '/universe' ? "#5f92ff" : "#b6b6b6"}>
            <circle cx="6" cy="6" r="2"/>
            <circle cx="18" cy="8" r="1.5"/>
            <circle cx="12" cy="4" r="1"/>
            <circle cx="10" cy="14" r="2.5"/>
            <circle cx="17" cy="17" r="1.8"/>
            <circle cx="5" cy="19" r="1.2"/>
            <line x1="6" y1="6" x2="12" y2="4" stroke={location.pathname === '/universe' ? "#5f92ff" : "#b6b6b6"} strokeWidth="0.5" opacity="0.4"/>
            <line x1="12" y1="4" x2="18" y2="8" stroke={location.pathname === '/universe' ? "#5f92ff" : "#b6b6b6"} strokeWidth="0.5" opacity="0.4"/>
            <line x1="6" y1="6" x2="10" y2="14" stroke={location.pathname === '/universe' ? "#5f92ff" : "#b6b6b6"} strokeWidth="0.5" opacity="0.4"/>
            <line x1="10" y1="14" x2="17" y2="17" stroke={location.pathname === '/universe' ? "#5f92ff" : "#b6b6b6"} strokeWidth="0.5" opacity="0.4"/>
        </svg>
    };

    const authLinks = [
        {
            path: '/profile',
            label: 'Profile', action: ()=> navigatePath('/profile'),
            icon:
            <svg xmlns="http://www.w3.org/2000/svg" width="28px" height="28px" viewBox="0 0 24 24" fill="#000000ff">
                <g id="style=fill">
                    <g id="profile">
                        <path id="vector (Stroke)" fillRule="evenodd" clipRule="evenodd" d="M6.75 6.5C6.75 3.6005 9.1005 1.25 12 1.25C14.8995 1.25 17.25 3.6005 17.25 6.5C17.25 9.3995 14.8995 11.75 12 11.75C9.1005 11.75 6.75 9.3995 6.75 6.5Z" fill={location.pathname === '/profile' ? "#5f92ffff" : "#b6b6b6ff"}/>
                        <path id="rec (Stroke)" fillRule="evenodd" clipRule="evenodd" d="M4.25 18.5714C4.25 15.6325 6.63249 13.25 9.57143 13.25H14.4286C17.3675 13.25 19.75 15.6325 19.75 18.5714C19.75 20.8792 17.8792 22.75 15.5714 22.75H8.42857C6.12081 22.75 4.25 20.8792 4.25 18.5714Z" fill={location.pathname === '/profile' ? "#5f92ffff" : "#b6b6b6ff"}/>
                    </g>
                </g>
            </svg>
        },
        {
            path: '/home/notifications',
            label: 'Notifications',
            notifCount: notifCount > 0 ? notifCount : '',
            action: () => navigate('/home/notifications'),
            icon:
            <svg xmlns="http://www.w3.org/2000/svg" width="28px" height="28px" viewBox="0 0 24 24" fill="#000000ff">
                <g id="style=fill">
                    <g id="notification-bell">
                        <path id="vector (Stroke)" fillRule="evenodd" clipRule="evenodd" d="M14.802 19.8317C15.4184 19.7699 15.8349 20.4242 15.5437 20.9539C15.3385 21.3271 15.0493 21.6529 14.7029 21.9197C14.3496 22.1918 13.9397 22.4006 13.5 22.5408C13.0601 22.6812 12.593 22.7522 12.1242 22.7522C11.6554 22.7522 11.1883 22.6812 10.7484 22.5408C10.3087 22.4006 9.89883 22.1918 9.54556 21.9197C9.1991 21.6529 8.90988 21.3271 8.70472 20.9539C8.41354 20.4242 8.83002 19.7699 9.44644 19.8317C9.63869 19.851 11.1433 19.9981 12.1242 19.9981C13.1051 19.9981 14.6097 19.851 14.802 19.8317Z" fill={location.pathname === '/home/notifications' ? "#5f92ffff" : "#b6b6b6ff"}/>
                        <path id="vector (Stroke)_2" fillRule="evenodd" clipRule="evenodd" d="M8.52901 2.08755C10.7932 1.00445 13.4465 0.967602 15.7423 1.98737L15.9475 2.07851C18.3532 3.14707 19.8934 5.4622 19.8934 8.0096L19.8934 9.27297C19.8934 10.2885 20.1236 11.2918 20.5681 12.213L20.8335 12.7632C22.0525 15.29 20.465 18.2435 17.6156 18.7498L17.455 18.7783C13.93 19.4046 10.3154 19.4046 6.79044 18.7783C3.90274 18.2653 2.37502 15.1943 3.77239 12.7115L3.99943 12.3082C4.55987 11.3124 4.85335 10.1981 4.85335 9.06596L4.85335 7.79233C4.85335 5.3744 6.27704 3.16478 8.52901 2.08755Z" fill={location.pathname === '/home/notifications' ? "#5f92ffff" : "#b6b6b6ff"}/>
                    </g>
                </g>
            </svg>
        },
        {
            path: '/home/bookmark',
            label: 'Bookmarks',
            action: ()=> navigatePath('/home/bookmark'),
            icon:
            <svg xmlns="http://www.w3.org/2000/svg" width="28px" height="28px" viewBox="0 0 24 24" fill="none">
                <g id="style=fill">
                    <g id="bookmark">
                    <path id="Subtract" fillRule="evenodd" clipRule="evenodd" d="M8 1.25C5.37665 1.25 3.25 3.37665 3.25 6V20.4648C3.25 21.7269 4.27311 22.75 5.53518 22.75C5.98634 22.75 6.42739 22.6165 6.80278 22.3662L11.3066 19.3636C11.7265 19.0837 12.2735 19.0837 12.6934 19.3636L17.1972 22.3662C17.5726 22.6165 18.0137 22.75 18.4648 22.75C19.7269 22.75 20.75 21.7269 20.75 20.4648V6C20.75 3.37665 18.6234 1.25 16 1.25H8ZM9 6.75C8.58579 6.75 8.25 7.08579 8.25 7.5C8.25 7.91421 8.58579 8.25 9 8.25H15C15.4142 8.25 15.75 7.91421 15.75 7.5C15.75 7.08579 15.4142 6.75 15 6.75H9Z" fill={location.pathname === '/home/bookmark' ? "#5f92ffff" : "#b6b6b6ff"}/>
                    </g>
                </g>
            </svg>
        },
        {
            path: '/home/collections',
            label: 'Collections',
            action: () => {navigatePath('/home/collections')},
            icon:
            <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" width="28px" height="28px" viewBox="0 0 24 24" version="1.1">
                <title>ic_fluent_book_formula_recent_24_filled</title>
                <desc>Created with Sketch.</desc>
                <g id="🔍-System-Icons" stroke="none" strokeWidth="1" fill="none" fillRule="evenodd">
                    <g id="ic_fluent_book_formula_recent_24_filled" fill={location.pathname === '/home/collections' ? "#5f92ffff" : "#b6b6b6ff"} fillRule="nonzero">
                    <path d="M18,2 C19.3807,2 20.5,3.11929 20.5,4.5 L20.5,18.75 C20.5,19.1642 20.1642,19.5 19.75,19.5 L5.5,19.5 C5.5,20.0523 5.94772,20.5 6.5,20.5 L19.75,20.5 C20.1642,20.5 20.5,20.8358 20.5,21.25 C20.5,21.6642 20.1642,22 19.75,22 L6.5,22 C5.11929,22 4,20.8807 4,19.5 L4,4.5 C4,3.11929 5.11929,2 6.5,2 L18,2 Z M12.8581,6.37799 C12.62598,5.90759933 11.9844378,5.87623996 11.6977281,6.28391187 L11.642,6.37799 L10.5416,8.60759 L8.08108,8.96512 C7.55966125,9.04088875 7.33187629,9.64635672 7.63705678,10.0449565 L7.70527,10.1217 L9.48571,11.8572 L9.06541,14.3078 C8.97598882,14.8291176 9.48575824,15.2340394 9.96079283,15.0617758 L10.0493,15.0226 L12.25,13.8656 L14.4508,15.0226 C14.9189412,15.2688118 15.4615792,14.9090388 15.444597,14.4040705 L15.4347,14.3078 L15.0143,11.8572 L16.7948,10.1217 C17.17205,9.75395625 17.0005109,9.13023984 16.5193002,8.98711816 L16.419,8.96512 L13.9585,8.60759 L12.8581,6.37799 Z M12.25,8.21029 L12.9001,9.52747 C12.9847857,9.69901857 13.1371367,9.82544224 13.3180464,9.87827058 L13.4107,9.89842 L14.8643,10.1096 L13.8124,11.1349 C13.6792333,11.2647333 13.6064139,11.442275 13.6076569,11.625106 L13.6174,11.7351 L13.8657,13.1829 L12.5656,12.4993 C12.4009333,12.4128 12.2096,12.3983833 12.0361023,12.45605 L11.9345,12.4993 L10.6343,13.1829 L10.8826,11.7351 C10.9141,11.55185 10.8686556,11.3654056 10.7601556,11.2181856 L10.6876,11.1349 L9.6358,10.1096 L11.0894,9.89842 C11.2787429,9.87091429 11.4460449,9.76506816 11.5521994,9.60935207 L11.6,9.52747 L12.25,8.21029 Z" id="🎨-Color">
                    </path>
                    </g>
                </g>
            </svg>,
        },
        {
            label: 'Write', action: () => handleOpenTextEditor(),
            className: 'write-journal-bttn'
        },
    ];

    const guestLinks = [
        {
            label: 'Log in', action: () => navigate('/login'),
            className: 'write-journal-bttn'
        },
        {
            label: 'Sign up', action: () => navigate('/signUp'),
            className: 'sidebar-links'
        },
    ];

    const links = isGuest
        ? [homeLink, exploreLink, galleryLink, freedomWallLink, universeLink, ...guestLinks]
        : [homeLink, exploreLink, galleryLink, freedomWallLink, universeLink, ...authLinks];

    const imgRef = useRef(null)
    const [showProfileEditor, setShowProfileEditor] = useState(false);
    const [showEditor, setShowEditor] = useState(false);
    const [editorLaunchConfig, setEditorLaunchConfig] = useState(DEFAULT_EDITOR_LAUNCH_CONFIG);
    const [profilePreview, setProfilePreview] = useState(null);
    const [imageFile, setImageFile] = useState(null);

    const [name, setName] = useState('')
    const [bio, setBio] = useState('')
    const [setupUsername, setSetupUsername] = useState('')
    const [usernameAvailable, setUsernameAvailable] = useState(null)
    const [usernameChecking, setUsernameChecking] = useState(false)
    const usernameCheckTimer = useRef(null)
    const [uploadingUserData, setUploadingUserData] = useState(false)

    const [showWelcomeMessage, setShowWelcomeMessage] = useState(false);

    const [showOpinionEditor, setShowOpinionEditor] = useState(false);


    const handleClickUploadPhoto = (e) =>{
        e.stopPropagation();
        if(imgRef.current){
            imgRef.current.click();
        }
    }
    const handleImageChange = (e) =>{
        const file = e.target.files[0];
        if(file){
            setImageFile(file)
            const reader = new FileReader();
            reader.onloadend = () =>{
                setProfilePreview(reader.result)
            }
            reader.readAsDataURL(file)
        }
    }

    const slugifyForUsername = (val) =>
        String(val || '').toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    const handleNameChangeForSetup = (e) => {
        const newName = e.target.value;
        setName(newName);
        // Auto-suggest username from name if user hasn't manually edited username
        if (!setupUsername || setupUsername === slugifyForUsername(name)) {
            const suggested = slugifyForUsername(newName);
            setSetupUsername(suggested);
            checkUsernameDebounced(suggested);
        }
    };

    const handleUsernameChange = (e) => {
        const raw = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
        setSetupUsername(raw);
        checkUsernameDebounced(raw);
    };

    const checkUsernameDebounced = (uname) => {
        if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current);
        if (!uname || uname.length < 3) {
            setUsernameAvailable(null);
            return;
        }
        setUsernameChecking(true);
        usernameCheckTimer.current = setTimeout(async () => {
            try {
                const result = await checkUsernameAvailability(uname);
                setUsernameAvailable(result.available);
            } catch {
                setUsernameAvailable(null);
            } finally {
                setUsernameChecking(false);
            }
        }, 400);
    };

    const handleOpenTextEditor = useCallback((config = {}) => {
        editor.setEditable(true)
        setEditorLaunchConfig({
            ...DEFAULT_EDITOR_LAUNCH_CONFIG,
            ...config
        });
        setShowEditor(true)
    }, [editor])
    const handleCloseEditor = useCallback(() => {
        setShowEditor(false)
        setEditorLaunchConfig(DEFAULT_EDITOR_LAUNCH_CONFIG);
    }, [])

    const handleSubmit = async(e) =>{
        e.stopPropagation();
        e.preventDefault();
        try {
            setUploadingUserData(true)
            const formdata = new FormData();
            if(imageFile){
                formdata.append('image', imageFile);
            }
            if(bio && name){
                formdata.append('name', name)
                formdata.append('bio', bio)
                if(setupUsername && setupUsername.length >= 3){
                    formdata.append('username', setupUsername)
                }
            }
            const {data} = await submitProfileData(formdata, session?.access_token);
            // if(data){
            //     console.log(data)
            // }
            setShowWelcomeMessage(true)
        } catch (error) {
            throw new Error('error uploading data')
        } finally {
            setBio('')
            setName('')
            setSetupUsername('')
            setUsernameAvailable(null)
            setImageFile(null)
            setProfilePreview('')
            setUploadingUserData(false)
            setShowProfileEditor(false)
            queryClient.invalidateQueries({ queryKey: ['userData', session?.user?.id] });
            
        }
        
    }

    const handleClickMobileProfileLink = () =>{
        setShowMobileSideBar(true)
    }
    const handleClickCloseSidebar = () =>{
        setShowMobileSideBar(false)
    }

    //close welcome message modal
    const handleCloseWelcomeMessage = () =>{
        setShowWelcomeMessage(false)
    }

    const handleOpenOpinionTextEditor = () =>{
        setShowOpinionEditor(true)
    }
    const handleCloseOpiniionTextEditor = () =>{
        setShowOpinionEditor(false);
    }

    useEffect(() => {
        const launchState = location.state;
        if(!launchState?.openEditor){
            return;
        }

        handleOpenTextEditor({
            initialMode: launchState?.editorMode === 'canvas' ? 'canvas' : 'text',
            initialTitle: launchState?.initialTitle || '',
            initialCanvasDoc: launchState?.initialCanvasDoc || null,
            remixSource: launchState?.remixSource || null
        });

        navigate(location.pathname, {replace: true, state: null});
    }, [location.state, location.pathname, navigate, handleOpenTextEditor]);

    //handle show links header when stop scrolling and hides header when scrolling
    // useEffect(() =>{
    //     const handleScroll = (e) => {
    //         clearTimeout(scrollRefTimeOut.current)
    //         setShowHeaders(false)

    //         scrollRefTimeOut.current = setTimeout(() => {
    //             setShowHeaders(true)
    //         }, 500);
    //     }
        
    //     document.addEventListener('scroll', handleScroll, true);

    //     return() => {
    //         document.removeEventListener('scroll', handleScroll, true);
    //         clearTimeout(scrollRefTimeOut.current)
    //     }
    // }, [])

    useEffect(() => {
        const getUserData = async() => {   
            const userData = await checkUser(session?.user.id)   
            if(userData){
                const exist = userData.exist;
                if(!exist){
                    setShowProfileEditor(true)
                }
            }
        }
        if(session && !loading){
            getUserData();
        }

    },[session, loading])

    // useEffect(() => {
    //     if(user){
    //         console.log(user?.userData?.[0]?.id)
    //     }
    // }, [user])
    

    if(isLoading && !isGuest){
        return(
            <Loader/>
        )
    }

    return(
        <>
        {!isGuest && showWelcomeMessage && (
            <WelcomeMessage onClose={handleCloseWelcomeMessage}/>
        )}

        <AnimatePresence>
        {!isGuest && showEditor && (
            <Editor
                key={'main-editor'}
                onClose={handleCloseEditor}
                initialMode={editorLaunchConfig.initialMode}
                initialTitle={editorLaunchConfig.initialTitle}
                initialCanvasDoc={editorLaunchConfig.initialCanvasDoc}
                remixSource={editorLaunchConfig.remixSource}
            />
        )}

        {!isGuest && showOpinionEditor && (
            <OpinionEditor onClose={handleCloseOpiniionTextEditor}/>
        )}

        </AnimatePresence>

        {!isGuest && uploadingUserData && (
            <>
            <div className="uploading-bg">
                <BeatLoader loading={uploadingUserData} size={20} speedMultiplier={2}/>
            </div>
            </>
        )}

        <AnimatePresence>
        {!isGuest && showProfileEditor && (
        <div className="profile-editor-bg">

            <motion.div 
            className="profile-editor"
            initial={{scale: 0, opacity: 0}}
            animate={{scale: 1, opacity: 1, transition: {type: 'tween', duration: 0.3}}}
            exit={{
                y: '100%',
                opacity: 0,
                transition:{type:'tween', duration: 0.25}
            }}
            >
                
                <div className="edit-profile-header">
                    <div className="edit-profile-title-container">
                            Edit profile
                    </div>

                    <button disabled={!bio || !name} onClick={(e) => handleSubmit(e)} className={!bio || !name ? "save-bttn-disabled" : 'save-bttn'}>
                        Save
                    </button>      
                </div>

                <div className="profile-edit-container">
                    <div className="profile-edit-backdrop-filter">
                        <div onClick={(e) => handleClickUploadPhoto(e)} className="camera-icon-container">
                            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#FFFFFF"><path d="M480-260q75 0 127.5-52.5T660-440q0-75-52.5-127.5T480-620q-75 0-127.5 52.5T300-440q0 75 52.5 127.5T480-260Zm0-80q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29ZM160-120q-33 0-56.5-23.5T80-200v-480q0-33 23.5-56.5T160-760h126l74-80h240l74 80h126q33 0 56.5 23.5T880-680v480q0 33-23.5 56.5T800-120H160Zm0-80h640v-480H638l-73-80H395l-73 80H160v480Zm320-240Z"/></svg>
                        </div>
                        <input onChange={(e) => handleImageChange(e)} ref={imgRef} type="file" accept="image/*" style={{display: "none"}} />
                    </div>
                    <img className="profile-img-edit-preview" src={profilePreview || '/assets/profile.jpg'} alt="profile-photo" />
                </div>

                <div className="profile-edit-metadata-container">
                    <div className="name-input-container">
                        <div className="input-title-container">
                            <span className="input-title">Name</span>
                            <span className="input-title" style={name?.length > 19 ? {color: 'red'} : {}}>
                                {`${name?.length}/20`}
                            </span>
                        </div>
                        
                        <input value={name} maxLength={20} onChange={handleNameChangeForSetup} className="edit-profile-name-input" type="text" />
                    </div>
                    <div className="bio-input-container">
                        <div className="input-title-container">
                            <div className="input-title-container">
                                <span className="input-title">Bio</span>
                                <span style={bio.length > 149 ? {color: 'red'} : {}} className="input-title">
                                    {`${bio?.length}/150`}
                                </span>
                            </div>
                        </div>
                        
                        <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={150} className="edit-profile-bio-input" type="text" />
                    </div>

                    <div className="name-input-container">
                        <div className="input-title-container">
                            <span className="input-title">Username</span>
                            <span className="input-title" style={setupUsername.length > 0 && setupUsername.length < 3 ? {color: 'red'} : {}}>
                                {usernameChecking ? 'Checking...' : usernameAvailable === true ? 'Available' : usernameAvailable === false ? 'Taken' : ''}
                            </span>
                        </div>
                        <input
                            value={setupUsername}
                            maxLength={50}
                            onChange={handleUsernameChange}
                            className="edit-profile-name-input"
                            type="text"
                            placeholder="e.g. john-doe"
                        />
                    </div>

                </div>

            </motion.div>

        </div>
        )}
        </AnimatePresence>
        
        <div className="home-parent-container">
             <div className="side-bar-holder-container">
                <Sidebar links={links}/> {/*passing the setShowEditor to this component to be used as a state setter inside this component*/}
            </div>
            <div className="center-bar-holder-container">

                {/* <AnimatePresence>
                {showHeaders && (
                    <motion.div 
                    className="newsfeed-header"
                    initial={{opacity: 0}}
                    animate={{opacity: 1, transition: {type: 'spring', stiffness: 300, damping: 25, mass: 0.8}}}
                    exit={{ opacity: 0, y: -20,
                        transition: { 
                            duration: 0.2,
                            ease: "easeOut"
                        }
                    }}
                    >
                        {header_links.map((header_link, index) => (
                            <div key={index} className="header-links">
                                {header_link.label}
                            </div>
                        ))}
                    </motion.div>
                )}
                </AnimatePresence> */}

                <Outlet context={{ clickOpenSidebar: handleClickMobileProfileLink, handleOpenTextEditor }} />
            </div>
            <div className="sidebar-right-holder-container">
                {/* Log out */}
                {!isMobile && !isOpinionsViewer &&(
                    <SidebarOpinions openEditor={handleOpenOpinionTextEditor}/>
                )}
                
            </div>
            
            {!isGuest && !isOpinionsPage && !isOpinionsViewer && (
                <WriteJournalButton onOpen={handleOpenTextEditor} hideOnHomeFeed={location.pathname === '/home' || location.pathname === '/home/opinions'}/>
            )}
            
            <MobileNavlink />
        </div>
        
        {showMobileSideBar && (
            <MobileSidebarLink onclose={handleClickCloseSidebar}/>
        )}
        </>
    )
}
export default HomePage
