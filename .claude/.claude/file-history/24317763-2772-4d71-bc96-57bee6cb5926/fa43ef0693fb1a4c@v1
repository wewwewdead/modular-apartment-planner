import React, { useEffect, useState, useRef } from "react";
import { MoonLoader } from "react-spinners";
import { motion, AnimatePresence,} from "framer-motion";
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import './postcards.css';
import '../explore/userSearch.css';
import { getJournals, searchJournals, searchUsers } from "../../../../API/Api";
import ParseContent from "./parseData";
import { useInView } from 'react-intersection-observer';
import CalculateText from "./calculateReadingTime";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import VerifiedBadge from "../../Badge/VerifiedBadge";

import { useAuth } from "../../../Context/useAuth";
import { useAddViewsMutation, useBookMarkMutation, useLikeMutation } from "../../../utils/useMutation";
import formatCounts from "../../../../helpers/fomatCounts";
import debounce from "../../../../helpers/debounce";
import { handleClickProfile, handleCLickContent } from "../../../../helpers/handleClicks";
import formatPostDate from "../../../../helpers/formatDateString";
import { handleImageFallback } from "../../../utils/handleImageFallback";
import { getCanvasPreview } from "../../../utils/canvasDoc";
import CanvasPreview from "./CanvasPreview/CanvasPreview";
import RepostModal from "../../RepostModal/RepostModal";


const PostCards = () => {
    const {session, user, openAuthModal} = useAuth();
    const location = useLocation();
    const outletContext = useOutletContext() || {};
    const { clickOpenSidebar, handleOpenTextEditor } = outletContext;

    const navigate = useNavigate();
    const modalRef = useRef(null);
    const searchShellRef = useRef(null);
    const timeOutRef = useRef();
    const {ref, inView} = useInView({
        threshold: 0,
        rootMargin: '800px'
    })
    const [postIdSettings, setPostIdSettings] = useState('');
    const [showHeaders, setShowHeaders] = useState(true);

    const [bookmarkedMessage, setBookmarkedMessage] = useState('');
    const [showBookmarkedMessage, setShowBookmarkedMessage] = useState(null);
    const [searchInput, setSearchInput] = useState('');
    const [debouncedSearchInput, setDebouncedSearchInput] = useState('');
    const [committedSearchQuery, setCommittedSearchQuery] = useState('');
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [searchType, setSearchType] = useState('posts');
    const [repostModalJournal, setRepostModalJournal] = useState(null);
    const [repostToastMessage, setRepostToastMessage] = useState('');

    const handleClickUserProfileOriginal = handleClickProfile(navigate);
    const clickContent = handleCLickContent(navigate);

    const mutateViews = useAddViewsMutation(session)

    const handleClickUserProfile = (e, loggedInUserId, clickedUserId, clickedUsername = null) => {
        e.stopPropagation();
        if(!session){
            return openAuthModal();
        }
        handleClickUserProfileOriginal(e, loggedInUserId, clickedUserId, clickedUsername);
    }

    const viewContent = (e, jsonbContent,wholeText, title, userId, name, avatar, created_at, journalId, isLiked, commentsCount, isBookmarked, likesCount, bookmarksCount, badge, postType = null, canvasDoc = null) =>{
        e.stopPropagation();
        if(session){
            const formadata = new FormData();
            formadata.append('journalId', journalId);
            mutateViews.mutate(formadata);
        }
        clickContent(e, jsonbContent,wholeText, title, userId, name, avatar, created_at, journalId, isLiked, commentsCount, isBookmarked, likesCount, bookmarksCount, badge, postType, canvasDoc )
    }

    const header_links = [
        {label: 'Writings', path: '/home'},
        {label: 'Opinions', path: '/home/opinions'},
    ]

    const handleClickHeaderLinks = (path) =>{
        navigate(path);
    }

    const handleExpandCanvas = (e, journal) => {
        e.stopPropagation();
        viewContent(
            e,
            journal.content,
            getCanvasPreview(journal?.canvas_doc)?.wholeText || '',
            journal.title,
            journal.users.id,
            journal.users.name,
            journal.users.image_url,
            journal.created_at,
            journal.id,
            journal.has_liked,
            journal.comment_count?.[0]?.count,
            journal.has_bookmarked,
            journal.like_count?.[0]?.count,
            journal.bookmark_count?.[0]?.count,
            journal.users.badge,
            journal?.post_type,
            journal?.canvas_doc
        );
    }

    const handleRemixCanvas = (e, journal) => {
        e.stopPropagation();
        if(!session){
            openAuthModal();
            return;
        }

        const sourceTitle = typeof journal?.title === 'string' ? journal.title.trim() : '';
        const remixTitle = sourceTitle.toLowerCase().startsWith('remix:')
            ? sourceTitle
            : `Remix: ${sourceTitle || 'Canvas'}`;

        navigate('/home', {
            state: {
                openEditor: true,
                editorMode: 'canvas',
                initialTitle: remixTitle,
                initialCanvasDoc: journal?.canvas_doc || null,
                remixSource: {
                    journalId: journal?.id,
                    authorName: journal?.users?.name || 'Unknown'
                }
            }
        });
    }

    const cardIcons = [
        {
            likeAction: (isLiked) => (
                <svg className="svg-like" xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" fill="none">
                    <g id="style=fill">
                    <g id="like">
                    <path id="Subtract" fillRule="evenodd" clipRule="evenodd" d="M15.9977 5.63891C16.2695 4.34931 15.433 3.00969 14.2102 2.59462C13.6171 2.37633 12.9892 2.4252 12.4662 2.60499C11.9449 2.78419 11.4461 3.12142 11.1369 3.58441L11.136 3.58573L7.49506 9.00272C8.05104 9.29585 8.43005 9.87954 8.43005 10.5518V21.3018H6.91003V21.3018H16.6801C18.2938 21.3018 19.2028 20.2977 19.8943 19.202C20.6524 18.0009 21.1453 16.7211 21.5116 15.5812C21.6808 15.0546 21.8252 14.5503 21.9547 14.0984L21.9863 13.9881C22.126 13.5007 22.2457 13.0904 22.366 12.7549C22.698 11.8292 22.5933 10.9072 22.067 10.2072C21.5476 9.5166 20.7005 9.15175 19.76 9.15175H15.76C15.6702 9.15175 15.6017 9.11544 15.5599 9.06803C15.5238 9.02716 15.4831 8.95058 15.502 8.81171L15.9977 5.63891Z" fill={isLiked ? 'rgb(255, 116, 116)' : "#5e5e5eff"}/>
                    <path id="rec" d="M2.18005 10.6199C2.18005 10.03 2.62777 9.55176 3.18005 9.55176H6.68005C7.23234 9.55176 7.68005 10.03 7.68005 10.6199V21.3018H3.18005C2.62777 21.3018 2.18005 20.8235 2.18005 20.2336V10.6199Z" fill={isLiked ? 'rgb(255, 116, 116)' : "#5e5e5eff"}/>
                    </g>
                    </g>
                </svg>
            ),

            className: 'like-button',
            action: (e, journalId, receiverId) => {
                e.preventDefault();
                e.stopPropagation();
                handleClickLike(journalId, receiverId);
            },
            countLike: (count) => <p style={{padding:'0', margin: '0', fontSize: '0.78rem'}}>{formatCounts(count)}</p>
        },
        {
            label:
            <svg className="svg-comment" xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" fill="#5e5e5eff">
                <g id="style=fill">
                <g id="comment">
                <path id="Subtract" fillRule="evenodd" clipRule="evenodd" d="M11.9862 0.763672C6.07454 0.763672 1.23621 5.36133 1.23621 11.1034C1.23621 13.5057 2.10188 15.7237 3.55066 17.4735C5.46882 19.8566 8.48271 21.3843 11.8522 21.4238L11.8878 21.4367C11.9902 21.4735 12.1385 21.5265 12.3236 21.5916C12.6936 21.7216 13.2115 21.9001 13.8035 22.0941C14.9799 22.4797 16.4767 22.9358 17.6892 23.1894C18.303 23.3178 18.9306 23.1718 19.4096 22.8608C19.8872 22.5507 20.3019 22.0126 20.3019 21.3173C20.3019 20.9046 20.1354 20.4987 19.9732 20.1857C19.8007 19.8529 19.5794 19.5251 19.371 19.2448C19.2691 19.1076 19.1676 18.9782 19.0724 18.8609C21.3193 16.9815 22.7362 14.2061 22.7362 11.1034C22.7362 7.55126 20.8865 4.4319 18.073 2.58609C16.3321 1.4227 14.2426 0.763672 11.9862 0.763672ZM18.3637 6.03728C18.1546 5.67972 17.6953 5.55937 17.3377 5.76847C16.9801 5.97757 16.8598 6.43694 17.0689 6.7945C17.8131 8.0671 18.2362 9.53599 18.2362 11.1034C18.2362 12.6662 17.8138 14.1316 17.0693 15.4016C16.8598 15.7589 16.9797 16.2184 17.337 16.4279C17.6943 16.6374 18.1538 16.5175 18.3633 16.1602C19.2385 14.6673 19.7362 12.941 19.7362 11.1034C19.7362 9.26158 19.238 7.53236 18.3637 6.03728Z" fill="#5e5e5eff"/>
                </g>
                </g>
            </svg>,
            className: 'comment-button',
            commentAction: (e, jsonbContent, wholeText, title, userId, name, avatar, created_at, journalId, isLiked, commentsCount, isBookmarked, likeCount, bookmarkCount, badge, postType, canvasDoc) => viewContent(e, jsonbContent, wholeText, title, userId, name, avatar, created_at, journalId, isLiked, commentsCount, isBookmarked, likeCount, bookmarkCount, badge, postType, canvasDoc ),
            countComments: (count) => <p style={{padding: '0', margin: '0', fontSize: '0.78rem'}}>{formatCounts(count)}</p>
        },
        {
            checkBookrmark: (isBookmarked) => (
            <svg className="svg-bookmark" xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" fill="none">
                <g id="style=fill">
                    <g id="bookmark">
                    <path id="Subtract" fillRule="evenodd" clipRule="evenodd" d="M8 1.25C5.37665 1.25 3.25 3.37665 3.25 6V20.4648C3.25 21.7269 4.27311 22.75 5.53518 22.75C5.98634 22.75 6.42739 22.6165 6.80278 22.3662L11.3066 19.3636C11.7265 19.0837 12.2735 19.0837 12.6934 19.3636L17.1972 22.3662C17.5726 22.6165 18.0137 22.75 18.4648 22.75C19.7269 22.75 20.75 21.7269 20.75 20.4648V6C20.75 3.37665 18.6234 1.25 16 1.25H8ZM9 6.75C8.58579 6.75 8.25 7.08579 8.25 7.5C8.25 7.91421 8.58579 8.25 9 8.25H15C15.4142 8.25 15.75 7.91421 15.75 7.5C15.75 7.08579 15.4142 6.75 15 6.75H9Z" fill={isBookmarked ? "rgb(72, 208, 135)" : "#5e5e5eff"}/>
                    </g>
                </g>
            </svg>),
            className: 'bookmark-button',
            bookmarkAction: (e, journalId) => {
                e.preventDefault();
                e.stopPropagation();
                debounceClickBookmark(journalId);
            },
            countBookmarks: (count) => <p  style={{padding: '0', margin: '0', fontSize: '0.78rem'}}>{formatCounts(count)}</p>
        },
        {
            repostAction: true,
            repostIcon:
                <svg className="svg-repost" xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" fill="#5e5e5eff">
                    <path d="M7 7h10l-1.293-1.293a1 1 0 0 1 1.414-1.414l3 3a1 1 0 0 1 0 1.414l-3 3a1 1 0 0 1-1.414-1.414L17 9H7a1 1 0 0 1-1-1V5a1 1 0 0 1 2 0v2zm10 10H7l1.293 1.293a1 1 0 0 1-1.414 1.414l-3-3a1 1 0 0 1 0-1.414l3-3a1 1 0 1 1 1.414 1.414L7 15h10a1 1 0 0 1 1 1v3a1 1 0 0 1-2 0v-2z"/>
                </svg>,
            className: 'repost-button',
        },
        {
            iconCount: (count) => <p style={{padding: '0', margin: '0', fontSize: '0.6rem', color: "var(--icon-view-count)"}}>{formatCounts(count)}</p>,
            iconView:
            <svg xmlns="http://www.w3.org/2000/svg" fill="var(--icon-view)" width="28px" height="28px" viewBox="-3.5 0 32 32" version="1.1">
                <title>view</title>
                <path d="M12.406 13.844c1.188 0 2.156 0.969 2.156 2.156s-0.969 2.125-2.156 2.125-2.125-0.938-2.125-2.125 0.938-2.156 2.125-2.156zM12.406 8.531c7.063 0 12.156 6.625 12.156 6.625 0.344 0.438 0.344 1.219 0 1.656 0 0-5.094 6.625-12.156 6.625s-12.156-6.625-12.156-6.625c-0.344-0.438-0.344-1.219 0-1.656 0 0 5.094-6.625 12.156-6.625zM12.406 21.344c2.938 0 5.344-2.406 5.344-5.344s-2.406-5.344-5.344-5.344-5.344 2.406-5.344 5.344 2.406 5.344 5.344 5.344z"/>
            </svg>,

        }
    ]

    const userId = user?.userData?.[0]?.id || null;
    const isSearchMode = committedSearchQuery.length >= 2;
    const isPostSearchMode = isSearchMode && searchType === 'posts';
    const isPeopleSearchMode = isSearchMode && searchType === 'people';

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchInput(searchInput.trim());
        }, 350);

        return () => clearTimeout(timer);
    }, [searchInput]);

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading: isFeedLoading,
    } = useInfiniteQuery({
        queryKey: ['journals', userId],
        queryFn: ({pageParam = null}) => getJournals(pageParam, 5, userId),
        getNextPageParam: (lastPage) => {
            if(lastPage?.hasMore) {
                const lastJournal = lastPage?.data[lastPage?.data?.length - 1]; //get the last array of object using index
                return new Date(lastJournal.created_at).toISOString();
            }
            return undefined;
        } ,
        refetchOnWindowFocus: false
    })

    const {
        data: searchData,
        isLoading: isSearchLoading,
        isFetching: isSearchFetching,
        error: searchError,
    } = useQuery({
        queryKey: ['journals-search', userId, committedSearchQuery],
        queryFn: () => searchJournals(committedSearchQuery, 10, userId),
        enabled: isPostSearchMode,
        refetchOnWindowFocus: false,
        staleTime: 15 * 1000,
    });

    const {
        data: suggestionData,
        isLoading: isSuggestionsLoading,
    } = useQuery({
        queryKey: ['journals-suggestions', userId, debouncedSearchInput],
        queryFn: () => searchJournals(debouncedSearchInput, 6, userId),
        enabled: debouncedSearchInput.length >= 2 && isSearchFocused && searchType === 'posts',
        refetchOnWindowFocus: false,
        staleTime: 10 * 1000,
    });

    const {
        data: userSearchData,
        isLoading: isUserSearchLoading,
        isFetching: isUserSearchFetching,
        error: userSearchError,
    } = useQuery({
        queryKey: ['users-search', committedSearchQuery],
        queryFn: () => searchUsers(committedSearchQuery, 10),
        enabled: isPeopleSearchMode,
        refetchOnWindowFocus: false,
        staleTime: 10 * 1000,
    });

    const {
        data: userSuggestionData,
        isLoading: isUserSuggestionsLoading,
    } = useQuery({
        queryKey: ['users-suggestions', debouncedSearchInput],
        queryFn: () => searchUsers(debouncedSearchInput, 6),
        enabled: debouncedSearchInput.length >= 2 && isSearchFocused && searchType === 'people',
        refetchOnWindowFocus: false,
        staleTime: 10 * 1000,
    });

    const handleClickSettings = (e, postId) =>{
        e.stopPropagation();
        setPostIdSettings(postId === postIdSettings ? null : postId)
    }

    const mutationLike = useLikeMutation(session, user?.userData?.[0]?.id);

    const handleClickLike = async (journalId, receiverId) => {
        if(!session) return openAuthModal();
        console.log(journalId)
        mutationLike.mutate({journalId, receiverId}) //passing this into mutationFn {journalId: the id}
    }


    const mutationBookmark = useBookMarkMutation(session, userId);

    const handleClickBookmark = async (journalId) => {
        if(!session) return openAuthModal();
        console.log(journalId)
        // mutationBookmark.mutate({journalId});
        const response = await mutationBookmark.mutateAsync({journalId})

        if(timeOutRef.current){
            clearTimeout(timeOutRef.current);
        }
        if(response.message === 'success'){
            setBookmarkedMessage('Post was added to your Bookmarks')
            setShowBookmarkedMessage(journalId);
            timeOutRef.current = setTimeout(() =>{
                setShowBookmarkedMessage(null)
                setBookmarkedMessage('')
            }, 2500)
        } else {
            setBookmarkedMessage('Post was removed from your Bookmarks')
            setShowBookmarkedMessage(journalId);
            timeOutRef.current = setTimeout(() =>{
                setShowBookmarkedMessage(null)
                setBookmarkedMessage('')
            }, 2500)
        }
        console.log(response.message);
    }

    const debounceClickBookmark = debounce(handleClickBookmark, 100);

    const handleSubmitSearch = (rawQuery) => {
        const normalizedQuery = typeof rawQuery === 'string' ? rawQuery.trim() : '';
        if(normalizedQuery.length < 2){
            setCommittedSearchQuery('');
            return;
        }

        setCommittedSearchQuery(normalizedQuery);
        setSearchInput(normalizedQuery);
        setIsSearchFocused(false);
    };

    const handleClearSearch = () => {
        setSearchInput('');
        setDebouncedSearchInput('');
        setCommittedSearchQuery('');
        setIsSearchFocused(false);
        setSearchType('posts');
    };

    const handleSearchInputKeyDown = (e) => {
        if(e.key === 'Enter'){
            e.preventDefault();
            handleSubmitSearch(searchInput);
        }

        if(e.key === 'Escape'){
            setIsSearchFocused(false);
        }
    };

    const handleClickSuggestion = (journal) => {
        if(!journal?.id){
            return;
        }
        setIsSearchFocused(false);
        if(journal?.title){
            setSearchInput(journal.title);
            setDebouncedSearchInput(journal.title);
        }
        navigate(`/home/post/${journal.id}`);
    };

    const handleClickUserSuggestion = (e, person) => {
        if(!person?.id){
            return;
        }
        setIsSearchFocused(false);
        handleClickUserProfile(e, user?.userData?.[0]?.id, person.id, person.username);
    };

    const handleVisitFreedomWall = () => {
        navigate('/home/freedom-wall');
    };

    useEffect(() => {
        const handleOutsideSearchClick = (e) => {
            if(searchShellRef.current && !searchShellRef.current.contains(e.target)){
                setIsSearchFocused(false);
            }
        };

        window.addEventListener('mousedown', handleOutsideSearchClick);
        return () => window.removeEventListener('mousedown', handleOutsideSearchClick);
    }, []);

    useEffect(() =>{
        if(!isSearchMode && inView && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
        }
    }, [inView, fetchNextPage, hasNextPage, isFetchingNextPage, isSearchMode])


    useEffect(() => {
       const handleClickOutside = (e) =>{
        if(modalRef.current && !modalRef.current.contains(e.target)){
            setPostIdSettings(null)
        }
       }
       window.addEventListener('click', handleClickOutside)

       return() => {
        window.removeEventListener('click', handleClickOutside)
       }
    }, [])

    useEffect(() =>{
        const scroll = (e) =>{
            setShowHeaders(!showHeaders)

            if(timeOutRef.current){
                clearTimeout(timeOutRef.current);
            }
            timeOutRef.current = setTimeout(() => {
                setShowHeaders(showHeaders)
            }, 100);
        }
        document.addEventListener('scroll', scroll, true);
        return() =>{
            if(timeOutRef.current){
                clearTimeout(timeOutRef.current);
            }
            document.removeEventListener('scroll', scroll, true)
        }
    }, [])

    const feedJournals = data?.pages?.flatMap((page) => page.data || []) || [];
    const searchedJournals = searchData?.data || [];
    const searchedUsers = userSearchData?.data || [];
    const suggestionItems = searchType === 'people'
        ? (userSuggestionData?.data || [])
        : (suggestionData?.data || []);
    const isSuggestionsPending = searchType === 'people'
        ? isUserSuggestionsLoading
        : isSuggestionsLoading;
    const journals = isSearchMode ? searchedJournals : feedJournals;
    const isLoading = isPostSearchMode
        ? isSearchLoading
        : isPeopleSearchMode
            ? isUserSearchLoading
            : isFeedLoading;
    const activeSearchError = searchType === 'people' ? userSearchError : searchError;
    const showSuggestions = isSearchFocused && debouncedSearchInput.length >= 2;

    if(isLoading) {
        return(
            <>
            <div className="postcards-parent-loading-container">
                <MoonLoader loading={isLoading} color="var(--loader-color)" speedMultiplier={1} size={20}/>
            </div>
            </>
        )
    }

    return(
        <>
        <div className="mobile-top-header">
            <span className="mobile-brand-text">iskrib</span>
            {clickOpenSidebar && (
                <button className="mobile-header-profile-btn" onClick={clickOpenSidebar}>
                    <img src={user?.userData?.[0]?.image_url || '/assets/profile.jpg'} alt="profile" />
                </button>
            )}
        </div>

        <div className="search-shell" ref={searchShellRef}>
        <div className="search-top-bar">
            <div className="search-input-wrap">
                <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M10 2a8 8 0 1 0 4.906 14.32l4.387 4.387a1 1 0 0 0 1.414-1.414L16.32 14.906A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12a6 6 0 0 1 0-12Z"/>
                </svg>
                <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    onKeyDown={handleSearchInputKeyDown}
                    placeholder={searchType === 'people' ? 'Search people...' : 'Search writings by meaning or title...'}
                    className="search-input"
                    aria-label={searchType === 'people' ? 'Search people' : 'Search journals'}
                />
            </div>
            {searchInput ? (
                <button type="button" className="search-clear-btn" onClick={handleClearSearch}>
                    Clear
                </button>
            ) : null}
            <button type="button" className="search-freedom-wall-btn" onClick={handleVisitFreedomWall}>
                Visit Freedom Wall
            </button>
            {handleOpenTextEditor && (
                <button type="button" className="mobile-write-btn" onClick={() => handleOpenTextEditor()}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" clipRule="evenodd" d="M22.8013 1.74899C22.6665 1.22946 22.1457 0.908925 21.6212 1.02275C8.65054 3.83745 2.58949 13.7685 0.052924 22.7276C-0.0695134 23.16 0.111594 23.621 0.495639 23.8545C0.671767 23.9616 0.870732 24.0087 1.06614 23.9987C1.30094 22.8623 2.3183 22.0061 3.53976 22L3.82845 21.7288C4.23095 21.3506 4.25066 20.7177 3.87248 20.3153C3.65552 20.0843 3.35472 19.9794 3.06169 20.0033L3.10053 19.9025C3.13285 19.8568 3.16175 19.8078 3.18671 19.7556C3.39169 19.327 3.62105 19.0828 3.85127 18.9282C4.08827 18.769 4.38857 18.663 4.7947 18.6054C5.20936 18.5467 5.69118 18.5437 6.27396 18.5637C6.4627 18.5702 6.66791 18.5794 6.8832 18.5891L6.88328 18.5891C7.29482 18.6077 7.74319 18.6279 8.18371 18.6335C9.57215 18.6515 11.1777 18.5382 12.8464 17.8022C14.5236 17.0625 16.1803 15.7318 17.7487 13.451C17.9918 13.0974 17.9823 12.6281 17.7249 12.2846C17.6946 12.2443 17.6617 12.2067 17.6266 12.1721C18.6722 11.5802 19.5909 10.7793 20.3487 9.88147C21.3629 8.6798 22.1246 7.27154 22.5618 5.86914C22.9956 4.47728 23.1309 3.02041 22.8013 1.74899Z" />
                    </svg>
                    Write
                </button>
            )}
            {isSearchMode ? (
                <span className="search-mode-pill">
                    {(searchType === 'people' ? isUserSearchFetching : isSearchFetching) ? 'Searching...' : 'Matched'}
                </span>
            ) : null}
        </div>
        {showSuggestions && (
            <div className="search-suggestions-dropdown">
                {isSuggestionsPending ? (
                    <div className="search-suggestion-item search-suggestion-muted">Searching...</div>
                ) : suggestionItems.length > 0 ? (
                    searchType === 'people' ? (
                        suggestionItems.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className="search-suggestion-user"
                                onClick={(e) => handleClickUserSuggestion(e, item)}
                            >
                                <img
                                    className="search-suggestion-user-avatar"
                                    src={item.image_url || '/assets/profile.jpg'}
                                    alt=""
                                    loading="lazy"
                                />
                                <div className="search-suggestion-user-info">
                                    <span className="search-suggestion-user-name">{item.name || 'Unknown'}</span>
                                    {item.username && (
                                        <span className="search-suggestion-user-handle">@{item.username}</span>
                                    )}
                                </div>
                            </button>
                        ))
                    ) : (
                        suggestionItems.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className="search-suggestion-item"
                                onClick={() => handleClickSuggestion(item)}
                            >
                                <span className="search-suggestion-title">{item.title || 'Untitled'}</span>
                                <span className="search-suggestion-meta">{item?.users?.name || 'Unknown author'}</span>
                            </button>
                        ))
                    )
                ) : (
                    <div className="search-suggestion-item search-suggestion-muted">No suggestions</div>
                )}
            </div>
        )}

        {(isSearchFocused || searchInput.length > 0 || isSearchMode) && (
            <div className="search-type-toggle">
                <button
                    type="button"
                    className={`search-type-btn ${searchType === 'posts' ? 'search-type-btn--active' : ''}`}
                    onClick={() => setSearchType('posts')}
                >
                    Posts
                </button>
                <button
                    type="button"
                    className={`search-type-btn ${searchType === 'people' ? 'search-type-btn--active' : ''}`}
                    onClick={() => setSearchType('people')}
                >
                    People
                </button>
            </div>
        )}
        </div>

        <div className="mobile-fw-banner" onClick={handleVisitFreedomWall}>
            <span>Freedom Wall</span>
            <span className="mobile-fw-banner-sub">Speak freely</span>
        </div>

        <AnimatePresence>
            {!isSearchMode && showHeaders && (
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
                            <div onClick={() => handleClickHeaderLinks(header_link.path) } className='header-link'>
                                {header_link.label}
                                <div className={header_link.path === location.pathname ? "header-underline" : ''}/>
                            </div>
                        </div>
                    ))}

                </motion.div>
            )}
            </AnimatePresence>

        <AnimatePresence>
        <div className="postcards-parent-container">
            {isPeopleSearchMode ? (
                <>
                    {searchedUsers.length === 0 && !isLoading && (
                        <div className="search-empty-state">
                            {activeSearchError ? 'Search failed. Please try again.' : 'No matching people found.'}
                        </div>
                    )}

                    {searchedUsers.length > 0 && (
                        <div className="user-search-results">
                            {searchedUsers.map((person, index) => (
                                <motion.div
                                    key={person.id}
                                    className="user-search-card"
                                    onClick={(e) => handleClickUserProfile(e, user?.userData?.[0]?.id, person.id, person.username)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if(e.key === 'Enter' || e.key === ' '){
                                            e.preventDefault();
                                            handleClickUserProfile(e, user?.userData?.[0]?.id, person.id, person.username);
                                        }
                                    }}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: 0.05 * index, ease: [0.22, 1, 0.36, 1] }}
                                >
                                    <div className="user-search-avatar-wrap">
                                        <div className={`user-avatar-container ${person.badge === 'legend' ? 'avatar-ring-legend' : person.badge === 'og' ? 'avatar-ring-og' : ''}`}>
                                            <img
                                                loading="lazy"
                                                className="user-info-avatar"
                                                src={person.image_url || '/assets/profile.jpg'}
                                                alt={`${person.name || 'User'} profile picture`}
                                            />
                                        </div>
                                    </div>
                                    <div className="user-search-info">
                                        <div className="user-search-name-row">
                                            <p className="user-search-name">{person.name || 'Unknown'}</p>
                                            <VerifiedBadge badge={person.badge} size={14} />
                                        </div>
                                        {person.username && (
                                            <p className="user-search-username">@{person.username}</p>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </>
            ) : (
            <>
            {journals.length === 0 && !isLoading && (
                <div className="search-empty-state">
                    {activeSearchError ? 'Search failed. Please try again.'
                     : isSearchMode ? 'No matching posts found.'
                     : 'No post available...'}
                </div>
            )}
            {journals.map((journal, index) => {
                const isRepost = journal?.is_repost === true;
                const isCanvasPost = !isRepost && journal?.post_type === 'canvas';
                const parsedContent = !isRepost ? ParseContent(journal.content) : null;
                const canvasPreview = isCanvasPost ? getCanvasPreview(journal?.canvas_doc) : null;
                const wholeText = isRepost ? '' : isCanvasPost ? canvasPreview?.wholeText || '' : parsedContent?.wholeText || '';
                const previewText = isRepost ? '' : isCanvasPost ? canvasPreview?.slicedText || '' : parsedContent?.slicedText || '';
                const thumbnail = isRepost ? null : isCanvasPost ? null : parsedContent?.firstImage?.src;
                const isLiked = journal?.has_liked;
                const isBookmarked = journal?.has_bookmarked;

                // For repost cards: parse original post content for preview
                const repostSource = isRepost ? journal?.repost_source : null;
                const repostSourceParsed = repostSource ? ParseContent(repostSource.content) : null;
                const repostSourcePreviewText = repostSourceParsed?.slicedText || '';

                return(
                    <motion.div
                        className={`cards${isCanvasPost ? ' is-canvas-card' : ''}${isRepost ? ' is-repost-card' : ''}`}
                        key={journal.id}
                        onClick={isCanvasPost ? (e) => handleExpandCanvas(e, journal) : undefined}
                        role={isCanvasPost ? 'button' : undefined}
                        tabIndex={isCanvasPost ? 0 : undefined}
                        onKeyDown={isCanvasPost ? (e) => {
                            if(e.key === 'Enter' || e.key === ' '){
                                e.preventDefault();
                                handleExpandCanvas(e, journal);
                            }
                        } : undefined}
                    >

                        {isRepost && (
                            <div className="repost-header-badge">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="var(--text-faint)">
                                    <path d="M7 7h10l-1.293-1.293a1 1 0 0 1 1.414-1.414l3 3a1 1 0 0 1 0 1.414l-3 3a1 1 0 0 1-1.414-1.414L17 9H7a1 1 0 0 1-1-1V5a1 1 0 0 1 2 0v2zm10 10H7l1.293 1.293a1 1 0 0 1-1.414 1.414l-3-3a1 1 0 0 1 0-1.414l3-3a1 1 0 1 1 1.414 1.414L7 15h10a1 1 0 0 1 1 1v3a1 1 0 0 1-2 0v-2z"/>
                                </svg>
                                <span onClick={(e) => handleClickUserProfile(e, user?.userData?.[0]?.id, journal.users.id)} className="repost-header-name">{journal.users.name}</span>
                                <span>reposted</span>
                            </div>
                        )}

                        {isRepost ? (
                            <div
                                className="card-content"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if(session){
                                        const formadata = new FormData();
                                        formadata.append('journalId', journal.id);
                                        mutateViews.mutate(formadata);
                                    }
                                    const postSlug = journal.title
                                        ? journal.title.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
                                        : '';
                                    navigate(`/home/post/${encodeURIComponent(journal.id)}${postSlug ? `/${postSlug}` : ''}`, {
                                        state: {
                                            isRepost: true,
                                            repostCaption: journal.repost_caption || '',
                                            repostSource: repostSource,
                                            title: journal.title,
                                            userId: journal.users?.id,
                                            name: journal.users?.name,
                                            avatar: journal.users?.image_url,
                                            created_at: journal.created_at,
                                            journalId: journal.id,
                                            isLiked: journal.has_liked,
                                            commentsCount: journal.comment_count?.[0]?.count || 0,
                                            isBookmarked: journal.has_bookmarked,
                                            likesCount: journal.like_count?.[0]?.count || 0,
                                            bookmarksCount: journal.bookmark_count?.[0]?.count || 0,
                                            badge: journal.users?.badge,
                                        }
                                    });
                                }}
                            >
                                {journal.repost_caption && (
                                    <p className="repost-caption-text">{journal.repost_caption}</p>
                                )}
                                {repostSource ? (
                                    <div className="repost-embedded-card">
                                        <div className="repost-embedded-author">
                                            <img className="repost-embedded-avatar" src={repostSource.users?.image_url || '/assets/profile.jpg'} alt="original author" />
                                            <span className="repost-embedded-name">{repostSource.users?.name}</span>
                                            <VerifiedBadge badge={repostSource.users?.badge} size={12} />
                                        </div>
                                        <p className="repost-embedded-title">{repostSource.title?.length > 60 ? repostSource.title.substring(0, 60) + '...' : repostSource.title}</p>
                                        {repostSourcePreviewText && (
                                            <p className="repost-embedded-text">{repostSourcePreviewText}</p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="repost-unavailable">
                                        This post is no longer available
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                {isCanvasPost && (
                                    <CanvasPreview canvasDoc={journal?.canvas_doc} />
                                )}

                                {thumbnail && (
                                    <img
                                        className="card-image-banner"
                                        src={thumbnail}
                                        alt={journal?.title ? `${journal.title} cover image` : "Post cover image"}
                                        loading="lazy"
                                        onError={handleImageFallback}
                                        onClick={(e) => viewContent(e, journal.content, wholeText, journal.title, journal.users.id, journal.users.name, journal.users.image_url, journal.created_at, journal.id, journal.has_liked, journal.comment_count?.[0]?.count, journal.has_bookmarked, journal.like_count?.[0].count, journal.bookmark_count?.[0].count, journal.users.badge, journal?.post_type, journal?.canvas_doc)}
                                    />
                                )}

                                <div className="card-content">
                                    <div onClick={isCanvasPost ? undefined : (e) => viewContent(e, journal.content, wholeText, journal.title, journal.users.id, journal.users.name, journal.users.image_url, journal.created_at, journal.id, journal.has_liked, journal.comment_count?.[0]?.count, journal.has_bookmarked, journal.like_count?.[0].count, journal.bookmark_count?.[0].count, journal.users.badge, journal?.post_type, journal?.canvas_doc)} className="content-container">
                                        <div className="feed-text-content-container">
                                            <div className="feed-title-content">
                                                {isCanvasPost && (
                                                    <span className="canvas-type-badge">
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                                             strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                                                            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                                                            <path d="M2 2l7.586 7.586"/>
                                                            <circle cx="11" cy="11" r="2"/>
                                                        </svg>
                                                        Canvas
                                                    </span>
                                                )}
                                                <h2 className="feed-title">{journal.title.length > 55 ? `${journal.title.substring(0, 55)}...` : journal.title}</h2>
                                            </div>
                                            <p className="feed-text-content">{previewText}</p>
                                        </div>
                                    </div>

                                    {isCanvasPost && (
                                        <div className="canvas-card-actions">
                                            <button
                                                type="button"
                                                className="canvas-card-action-btn is-remix"
                                                onClick={(e) => handleRemixCanvas(e, journal)}
                                            >
                                                Remix this Canvas
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        <div className="card-icons-container">
                            <div className="user-info-child-container">
                                <div onClick={(e) => handleClickUserProfile(e, user?.userData?.[0].id, journal.users.id)} className={`user-avatar-container ${journal.users.badge === 'legend' ? 'avatar-ring-legend' : journal.users.badge === 'og' ? 'avatar-ring-og' : ''}`}>
                                    <img loading="lazy" className="user-info-avatar" src={journal.users.image_url || '/assets/profile.jpg'} alt={`${journal?.users?.name || "User"} profile picture`} />
                                </div>
                                <div onClick={(e) => handleClickUserProfile(e, user?.userData?.[0].id, journal.users.id)} className="user-name-container">
                                    <p className="user-newsfeed-name">{journal.users.name}</p>
                                    <VerifiedBadge badge={journal.users.badge} size={14} />
                                </div>
                                <div className="name-info-separator">•</div>
                                <p className="user-post-date">{formatPostDate(journal.created_at)}</p>

                                    {cardIcons && (
                                        cardIcons.map((icon, index) =>(
                                            <div key={index} className="icon-container">

                                                {icon.likeAction && (
                                                    <div onClick={(e) => icon.action(e, journal.id, journal.users.id, user?.userData?.[0].image_url, user?.userData?.[0].name, user?.userData?.[0].user_email)} id="card-icons" className={icon.className}>
                                                        {icon.likeAction && icon.likeAction(isLiked)}
                                                    </div>
                                                )}

                                                {icon.commentAction && (
                                                    <div onClick={(e) => icon.commentAction(e, journal.content, wholeText, journal.title, journal.users.id, journal.users.name, journal.users.image_url, journal.created_at, journal.id, journal.has_liked, journal.comment_count?.[0]?.count, journal.has_bookmarked, journal.like_count?.[0].count, journal.bookmark_count?.[0].count, journal.users.badge, journal?.post_type, journal?.canvas_doc)} id="card-icons" className={icon.className}>
                                                        {icon.label}
                                                    </div>
                                                )}

                                            {icon.bookmarkAction && (
                                                <div onClick={(e) => icon.bookmarkAction(e, journal.id)} id="card-icons" className={icon.className}>
                                                    {icon.checkBookrmark(isBookmarked)}
                                                </div>
                                            )}

                                            {icon.repostAction && journal.users.id !== userId && (
                                                <div onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    if(!session) return openAuthModal();
                                                    const journalForModal = journal.is_repost && journal.repost_source
                                                        ? { id: journal.repost_source.id, title: journal.repost_source.title, users: journal.repost_source.users }
                                                        : journal;
                                                    setRepostModalJournal(journalForModal);
                                                }} id="card-icons" className={icon.className}>
                                                    {icon.repostIcon}
                                                </div>
                                            )}

                                            {icon.iconView && (
                                                <div id="card-icons-view">
                                                    {icon.iconView}
                                                </div>
                                            )}

                                            {icon.countLike && icon.countLike(journal.like_count?.[0].count)}
                                            {icon.countComments && icon.countComments(journal.comment_count?.[0]?.count)}
                                            {icon.countBookmarks && icon.countBookmarks(journal.bookmark_count?.[0].count)}
                                            {icon.iconCount && icon.iconCount(journal?.views)}
                                        </div>
                                    ))
                                )}
                            </div>



                            <div className="reading-time-container">
                                <p className="reading-time-text">{CalculateText(wholeText)}</p>
                            </div>

                            <div className="user-post-settings">
                                <svg onClick={(e) => handleClickSettings(e, journal.id)} xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M240-400q-33 0-56.5-23.5T160-480q0-33 23.5-56.5T240-560q33 0 56.5 23.5T320-480q0 33-23.5 56.5T240-400Zm240 0q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm240 0q-33 0-56.5-23.5T640-480q0-33 23.5-56.5T720-560q33 0 56.5 23.5T800-480q0 33-23.5 56.5T720-400Z"/></svg>
                                {postIdSettings === journal.id && (
                                    <motion.div
                                    initial={{opacity:0 ,scale:0}}
                                    animate={{opacity:1, scale:1, transition: {type: "tween", duration: 0.3}}}
                                    exit={{opacity:0, scale:0, transition: {type: "tween", duration: 0.3}}}
                                    ref={modalRef} className="setting-modal"
                                    >
                                        <p onClick={() => console.log('clicked')}>{journal.title}</p>
                                    </motion.div>
                                )}
                            </div>
                        </div>
                        {showBookmarkedMessage === journal.id && (
                            <div
                            className="bookmarked-content-message-container"
                            >
                                {bookmarkedMessage}

                            </div>
                        )}
                    </motion.div>
                )
            })}
            </>
            )}

            {!isSearchMode && (
                <div className="inview" ref={ref}>
                    <MoonLoader loading={isFetchingNextPage} color="rgba(255, 255, 255, 0.64)" speedMultiplier={1} size={20}/>
                </div>
            )}
        </div>
       </AnimatePresence>

        {repostModalJournal && (
            <RepostModal
                journal={repostModalJournal}
                onClose={(result) => {
                    setRepostModalJournal(null);
                    if(result === 'success'){
                        setRepostToastMessage('Post was reposted');
                        setTimeout(() => setRepostToastMessage(''), 2500);
                    }
                }}
            />
        )}

        <AnimatePresence>
            {repostToastMessage && (
                <motion.div
                    className="repost-toast"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.2 }}
                >
                    {repostToastMessage}
                </motion.div>
            )}
        </AnimatePresence>
        </>
    )
}

export default PostCards;
