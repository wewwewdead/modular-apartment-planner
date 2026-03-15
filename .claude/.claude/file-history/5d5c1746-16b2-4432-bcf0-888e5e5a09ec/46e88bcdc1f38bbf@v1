import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import ImageNode from "../Editor/nodes/ImageNode";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import './contentviewer.css'
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MoonLoader } from "react-spinners";
import CalculateText from "../postCards/calculateReadingTime";
import ParseContent from "../postCards/parseData";
import { useBookMarkMutation, useFollowMutation, useLikeMutation } from "../../../utils/useMutation";
import { useAuth } from "../../../Context/useAuth";
import CommentSection from "../../comments/comments";
import CanvasViewer from "../Canvas/CanvasViewer";
import debounce from "../../../../helpers/debounce";
import formatCounts from "../../../../helpers/fomatCounts";
import { handleClickProfile, handleCLickContent } from "../../../../helpers/handleClicks";
import { getFollowsData, getJournalById } from "../../../../API/Api";
import { useQuery } from "@tanstack/react-query";
import VerifiedBadge from "../../Badge/VerifiedBadge";
import { getCanvasWholeText, parseCanvasDoc } from "../../../utils/canvasDoc";
import RepostModal from "../../RepostModal/RepostModal";
import ShareMenu from "../../ShareMenu/ShareMenu";
import getShareUrl from "../../../utils/getShareUrl";

const normalizeInteractionFlag = (value) => {
    if(typeof value === 'boolean') return value;
    if(typeof value === 'string'){
        const normalized = value.trim().toLowerCase();
        if(normalized === 'true') return true;
        if(normalized === 'false') return false;
    }
    if(typeof value === 'number'){
        return value === 1;
    }
    return Boolean(value);
};

const normalizeCount = (value) => {
    const number = Number(value);
    if(!Number.isFinite(number) || number < 0){
        return 0;
    }
    return number;
};

const getNextToggleCount = (isActive, currentCount) => {
    return isActive
        ? Math.max(0, currentCount - 1)
        : currentCount + 1;
};

const ContentView = () => {
    const navigate = useNavigate();
    const [showBackButton, setShowBackButton] = useState(true);
    const { session, user, openAuthModal } = useAuth();

    const timeOutRef = useRef();
    const timeOutRefBookmark = useRef();
    const likeInFlightRef = useRef(false);
    const bookmarkInFlightRef = useRef(false);

    const [showCommentsContainer, setShowCommentsContainer] = useState(false);
    const [isLiked, setIsliked] = useState(false);
    const [likesCount, setLikesCount] = useState(0);
    const [isBookmarked, setIsBookmarked] = useState(false);
    const [bookmarkCounts, setBookmarkCounts] = useState(0);

    const [bookmarkedMessage, setBookmarkedMessage] = useState('');
    const [showRepostModal, setShowRepostModal] = useState(false);
    const [showShareMenu, setShowShareMenu] = useState(false);

    const contentRef = useRef();

    const theme = {
        paragraph: 'editor-paragraph',
        heading: {
            h1: 'editor-heading-h1',
            h2: 'editor-heading-h2',
            h3: 'editor-heading-h3',
        },
        quote: 'editor-quote',
        text: {
            bold: 'editor-text-bold',
            italic: 'editor-text-italic',
            underline: 'editor-text-underline',
        }
    }

    const location = useLocation();
    const { journalId } = useParams();
    const statePostData = location.state;
    const shouldFetchPost = !!journalId && (!statePostData || !statePostData?.postType);

    const { data: fetchedJournalData, isLoading: isLoadingJournalById } = useQuery({
        queryKey: ['journalById', journalId, user?.userData?.[0]?.id],
        queryFn: ({ queryKey }) => getJournalById(queryKey[1], queryKey[2]),
        enabled: shouldFetchPost,
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
    });

    const postData = useMemo(() => {
        const journal = fetchedJournalData?.journal;
        if(journal){
            const postType = journal?.post_type || 'text';
            const parsedContent = ParseContent(journal?.content);
            const canvasDoc = postType === 'canvas' ? parseCanvasDoc(journal?.canvas_doc) : null;
            const wholeText = postType === 'canvas'
                ? getCanvasWholeText(canvasDoc)
                : (parsedContent?.wholeText || '');

            return {
                postType: postType,
                content: journal?.content,
                canvasDoc: canvasDoc,
                wholeText: wholeText,
                title: journal?.title,
                userId: journal?.users?.id || journal?.user_id,
                name: journal?.users?.name,
                avatar: journal?.users?.image_url,
                created_at: journal?.created_at,
                journalId: journal?.id,
                isLiked: journal?.has_liked,
                commentsCount: journal?.comment_count?.[0]?.count || 0,
                isBookmarked: journal?.has_bookmarked,
                likesCount: journal?.like_count?.[0]?.count || 0,
                bookmarksCount: journal?.bookmark_count?.[0]?.count || 0,
                badge: journal?.users?.badge,
                isRepost: journal?.is_repost === true,
                repostCaption: journal?.repost_caption || '',
                repostSource: journal?.repost_source || null
            };
        }

        if(!statePostData){
            return null;
        }

        const inferredPostType = statePostData?.postType || (statePostData?.canvasDoc ? 'canvas' : 'text');
        const parsedContent = ParseContent(statePostData?.content);
        const canvasDoc = inferredPostType === 'canvas' ? parseCanvasDoc(statePostData?.canvasDoc) : null;

        return {
            postType: inferredPostType,
            content: statePostData?.content,
            canvasDoc: canvasDoc,
            wholeText: inferredPostType === 'canvas'
                ? (statePostData?.wholeText || getCanvasWholeText(canvasDoc))
                : (statePostData?.wholeText || parsedContent?.wholeText || ''),
            title: statePostData?.title,
            userId: statePostData?.userId,
            name: statePostData?.name,
            avatar: statePostData?.avatar,
            created_at: statePostData?.created_at,
            journalId: statePostData?.journalId,
            isLiked: statePostData?.isLiked,
            commentsCount: statePostData?.commentsCount || 0,
            isBookmarked: statePostData?.isBookmarked,
            likesCount: statePostData?.likesCount || 0,
            bookmarksCount: statePostData?.bookmarksCount || 0,
            badge: statePostData?.badge,
            isRepost: statePostData?.isRepost === true,
            repostCaption: statePostData?.repostCaption || '',
            repostSource: statePostData?.repostSource || null
        };
    }, [fetchedJournalData, statePostData]);

    const { data: followsData, isLoading: isLoadingFollows } = useQuery({
        queryKey: ['followsData', user?.userData?.[0]?.id, postData?.userId],
        queryFn: ({ queryKey }) => getFollowsData(queryKey[1], queryKey[2]),
        staleTime: 1000 * 60 * 60,
        cacheTime: 1000 * 60 * 60,
        enabled: !!user?.userData?.[0]?.id && !!postData?.userId,
    });

    const handleclickUserProfile = handleClickProfile(navigate);
    const viewContent = handleCLickContent(navigate);

    const mutationLike = useLikeMutation(session, user?.userData?.[0]?.id);
    const handleClickLike = async (e, journalId, receiverId, senderImageUrl, sendername, senderEmail) => {
        e.stopPropagation();
        if(likeInFlightRef.current){
            return;
        }
        if(!session){
            openAuthModal?.();
            return;
        }
        const wasLiked = normalizeInteractionFlag(isLiked);
        likeInFlightRef.current = true;
        setIsliked(!wasLiked);
        setLikesCount((prevCount) => getNextToggleCount(wasLiked, normalizeCount(prevCount)));
        mutationLike.mutate(
            { journalId, receiverId, senderImageUrl, sendername, senderEmail },
            {
                onSettled: () => {
                    likeInFlightRef.current = false;
                }
            }
        );
    }

    const mutationBookmark = useBookMarkMutation(session, user?.userData?.[0]?.id);
    const handleClickBookmark = async (e, journalId) => {
        e.stopPropagation();
        if(bookmarkInFlightRef.current){
            return;
        }
        if(!session){
            openAuthModal?.();
            return;
        }
        const wasBookmarked = normalizeInteractionFlag(isBookmarked);
        bookmarkInFlightRef.current = true;
        setIsBookmarked(!wasBookmarked);
        setBookmarkCounts((prevCount) => getNextToggleCount(wasBookmarked, normalizeCount(prevCount)));
        let response = null;
        try {
            response = await mutationBookmark.mutateAsync({ journalId });
        } finally {
            bookmarkInFlightRef.current = false;
        }
        
        if(timeOutRefBookmark.current){
            clearTimeout(timeOutRefBookmark.current);
        }
        if (response?.message === 'success') {
            setBookmarkedMessage('Post was added to your Bookmarks'); 
        } else if(response?.message === 'deleted'){
            setBookmarkedMessage('Post was removed from your Bookmarks');
        }
            
        timeOutRefBookmark.current = setTimeout(() => {
            setBookmarkedMessage('');
        }, 1500);

    }
    const debounceClickBookmark = debounce(handleClickBookmark, 100);

    const mutationFollow = useFollowMutation(session);
    const handleClickFollow = async (e, followingId, followerId) => {
        e.stopPropagation();
        if(!session) return openAuthModal();
        mutationFollow.mutate({ followingId, followerId });
    }
    const debounceClickFollow = debounce(handleClickFollow, 100);

    const handleBackLocation = (e) => {
        e.stopPropagation();
        window.history.back();
    }

    const hanldeClickComments = (e) => {
        e.stopPropagation();
        if(!session) return openAuthModal();
        setShowCommentsContainer(true);
    }

    const handleRemixCanvas = (e) => {
        e.stopPropagation();
        if(!session){
            return;
        }

        const sourceTitle = typeof postData?.title === 'string' ? postData.title.trim() : '';
        const remixTitle = sourceTitle.toLowerCase().startsWith('remix:')
            ? sourceTitle
            : `Remix: ${sourceTitle || 'Canvas'}`;

        navigate('/home', {
            state: {
                openEditor: true,
                editorMode: 'canvas',
                initialTitle: remixTitle,
                initialCanvasDoc: postData?.canvasDoc || null,
                remixSource: {
                    journalId: postData?.journalId,
                    authorName: postData?.name || 'Unknown'
                }
            }
        });
    }

    const handleCLoseComments = () => {
        setShowCommentsContainer(false);
    }

    useEffect(() => {
        if (!postData) return;
        setLikesCount(normalizeCount(postData?.likesCount));
        setBookmarkCounts(normalizeCount(postData?.bookmarksCount));
        setIsliked(normalizeInteractionFlag(postData?.isLiked));
        setIsBookmarked(normalizeInteractionFlag(postData?.isBookmarked));
    }, [postData?.likesCount, postData?.bookmarksCount, postData?.isLiked, postData?.isBookmarked]);

    useEffect(() => {
        if (postData?.title) {
            document.title = `${postData.title} | Iskrib`;
            return () => {
                document.title = 'Iskrib';
            };
        }

        document.title = 'Iskrib';
    }, [postData?.title]);

    useEffect(() => {
        const hideBackBttn = () => {
            setShowBackButton(false);
            if (timeOutRef.current) {
                clearTimeout(timeOutRef.current);
            }
            timeOutRef.current = setTimeout(() => {
                setShowBackButton(true);
            }, 300);
        }

        document.addEventListener('scroll', hideBackBttn, true);
        return () => {
            if (timeOutRef.current) {
                clearTimeout(timeOutRef.current);
            }
            document.removeEventListener('scroll', hideBackBttn, true);
        }
    }, []);

    if (isLoadingJournalById || isLoadingFollows) {
        return (
            <div className="cv-loading">
                <MoonLoader loading={isLoadingJournalById || isLoadingFollows} color="var(--loader-color)" size={25} />
            </div>
        )
    }

    if (!postData) {
        return (
            <div className="cv-loading">
                <p>Post is unavailable.</p>
                <button onClick={handleBackLocation} className="cv-back-btn" style={{ marginTop: "12px" }}>
                    Go back
                </button>
            </div>
        )
    }

    return (
        <>
            {showCommentsContainer && (
                <AnimatePresence>
                    <CommentSection onclose={handleCLoseComments} postId={postData?.journalId} receiverId={postData?.userId} />
                </AnimatePresence>
            )}

            <div ref={contentRef} className="cv-container">
                {/* Back header */}
                <AnimatePresence>
                    {showBackButton && (
                        <motion.div
                            className="cv-header"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1, transition: { duration: 0.15 } }}
                            exit={{ opacity: 0, transition: { duration: 0.15 } }}
                        >
                            <button onClick={handleBackLocation} className="cv-back-btn">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960">
                                    <path d="M360-240 120-480l240-240 56 56-144 144h568v80H272l144 144-56 56Z" />
                                </svg>
                            </button>
                            <p className="cv-header-label">Post</p>
                        </motion.div>
                    )}
                </AnimatePresence>

                <article className="cv-article">
                    {postData?.isRepost ? (
                        <>
                            {/* ── Repost view: quote on top, original post nested below ── */}

                            {/* Reposter quote section */}
                            <div className="cv-repost-quote-section">
                                <div className="cv-repost-badge">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="var(--text-faint)">
                                        <path d="M7 7h10l-1.293-1.293a1 1 0 0 1 1.414-1.414l3 3a1 1 0 0 1 0 1.414l-3 3a1 1 0 0 1-1.414-1.414L17 9H7a1 1 0 0 1-1-1V5a1 1 0 0 1 2 0v2zm10 10H7l1.293 1.293a1 1 0 0 1-1.414 1.414l-3-3a1 1 0 0 1 0-1.414l3-3a1 1 0 1 1 1.414 1.414L7 15h10a1 1 0 0 1 1 1v3a1 1 0 0 1-2 0v-2z"/>
                                    </svg>
                                    <span
                                        onClick={(e) => handleclickUserProfile(e, user?.userData?.[0]?.id, postData?.userId)}
                                        className="cv-repost-badge-name"
                                    >
                                        {postData?.name}
                                    </span>
                                    <VerifiedBadge badge={postData?.badge} size={14} />
                                    <span className="cv-repost-badge-label">reposted</span>
                                    <span className="cv-repost-badge-date">
                                        {new Date(postData?.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </span>
                                </div>

                                {postData.repostCaption && (
                                    <p className="cv-repost-caption">{postData.repostCaption}</p>
                                )}
                            </div>

                            {/* Original post nested below */}
                            {postData.repostSource ? (
                                <div
                                    className="cv-repost-embedded"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const src = postData.repostSource;
                                        const srcParsed = ParseContent(src.content);
                                        viewContent(
                                            e,
                                            src.content,
                                            srcParsed?.wholeText || '',
                                            src.title,
                                            src.users?.id,
                                            src.users?.name,
                                            src.users?.image_url,
                                            src.created_at,
                                            src.id,
                                            false, 0, false, 0, 0,
                                            src.users?.badge,
                                            src.post_type,
                                            src.canvas_doc
                                        );
                                    }}
                                >
                                    <div className="cv-repost-embedded-meta">
                                        <img className="cv-repost-embedded-avatar" src={postData.repostSource.users?.image_url || '/assets/profile.jpg'} alt="original author" />
                                        <span className="cv-repost-embedded-name">{postData.repostSource.users?.name}</span>
                                        <VerifiedBadge badge={postData.repostSource.users?.badge} size={14} />
                                        <span className="cv-repost-embedded-date">
                                            {new Date(postData.repostSource.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </span>
                                    </div>
                                    <h2 className="cv-repost-embedded-title">{postData.repostSource.title}</h2>
                                    <div className="cv-repost-embedded-content">
                                        {postData.repostSource.post_type === 'canvas' ? (
                                            <CanvasViewer canvasDoc={parseCanvasDoc(postData.repostSource.canvas_doc)} />
                                        ) : postData.repostSource.content ? (
                                            <LexicalComposer initialConfig={{
                                                namespace: "RepostSourceViewer",
                                                theme: theme,
                                                editable: false,
                                                editorState: postData.repostSource.content,
                                                nodes: [HeadingNode, ImageNode, QuoteNode],
                                                onError(error) { throw error; },
                                            }}>
                                                <RichTextPlugin
                                                    contentEditable={<ContentEditable />}
                                                    ErrorBoundary={LexicalErrorBoundary}
                                                />
                                            </LexicalComposer>
                                        ) : null}
                                    </div>
                                </div>
                            ) : (
                                <div className="cv-repost-unavailable">
                                    This post is no longer available
                                </div>
                            )}

                            {/* Action bar */}
                            <div className="cv-actions">
                                <button
                                    className="cv-action-btn"
                                    onClick={(e) => handleClickLike(e, postData?.journalId, postData?.userId, user?.userData?.[0]?.image_url, user?.userData?.[0]?.name, user?.userData?.[0]?.user_email)}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
                                        <path fillRule="evenodd" clipRule="evenodd" d="M15.9977 5.63891C16.2695 4.34931 15.433 3.00969 14.2102 2.59462C13.6171 2.37633 12.9892 2.4252 12.4662 2.60499C11.9449 2.78419 11.4461 3.12142 11.1369 3.58441L11.136 3.58573L7.49506 9.00272C8.05104 9.29585 8.43005 9.87954 8.43005 10.5518V21.3018H6.91003V21.3018H16.6801C18.2938 21.3018 19.2028 20.2977 19.8943 19.202C20.6524 18.0009 21.1453 16.7211 21.5116 15.5812C21.6808 15.0546 21.8252 14.5503 21.9547 14.0984L21.9863 13.9881C22.126 13.5007 22.2457 13.0904 22.366 12.7549C22.698 11.8292 22.5933 10.9072 22.067 10.2072C21.5476 9.5166 20.7005 9.15175 19.76 9.15175H15.76C15.6702 9.15175 15.6017 9.11544 15.5599 9.06803C15.5238 9.02716 15.4831 8.95058 15.502 8.81171L15.9977 5.63891Z" fill={isLiked ? 'rgb(235, 87, 87)' : "var(--icon-default)"} />
                                        <path d="M2.18005 10.6199C2.18005 10.03 2.62777 9.55176 3.18005 9.55176H6.68005C7.23234 9.55176 7.68005 10.03 7.68005 10.6199V21.3018H3.18005C2.62777 21.3018 2.18005 20.8235 2.18005 20.2336V10.6199Z" fill={isLiked ? 'rgb(235, 87, 87)' : "var(--icon-default)"} />
                                    </svg>
                                    <span>{formatCounts(likesCount)}</span>
                                </button>

                                <button className="cv-action-btn" onClick={hanldeClickComments}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="var(--icon-default)">
                                        <path fillRule="evenodd" clipRule="evenodd" d="M11.9862 0.763672C6.07454 0.763672 1.23621 5.36133 1.23621 11.1034C1.23621 13.5057 2.10188 15.7237 3.55066 17.4735C5.46882 19.8566 8.48271 21.3843 11.8522 21.4238L11.8878 21.4367C11.9902 21.4735 12.1385 21.5265 12.3236 21.5916C12.6936 21.7216 13.2115 21.9001 13.8035 22.0941C14.9799 22.4797 16.4767 22.9358 17.6892 23.1894C18.303 23.3178 18.9306 23.1718 19.4096 22.8608C19.8872 22.5507 20.3019 22.0126 20.3019 21.3173C20.3019 20.9046 20.1354 20.4987 19.9732 20.1857C19.8007 19.8529 19.5794 19.5251 19.371 19.2448C19.2691 19.1076 19.1676 18.9782 19.0724 18.8609C21.3193 16.9815 22.7362 14.2061 22.7362 11.1034C22.7362 7.55126 20.8865 4.4319 18.073 2.58609C16.3321 1.4227 14.2426 0.763672 11.9862 0.763672ZM18.3637 6.03728C18.1546 5.67972 17.6953 5.55937 17.3377 5.76847C16.9801 5.97757 16.8598 6.43694 17.0689 6.7945C17.8131 8.0671 18.2362 9.53599 18.2362 11.1034C18.2362 12.6662 17.8138 14.1316 17.0693 15.4016C16.8598 15.7589 16.9797 16.2184 17.337 16.4279C17.6943 16.6374 18.1538 16.5175 18.3633 16.1602C19.2385 14.6673 19.7362 12.941 19.7362 11.1034C19.7362 9.26158 19.238 7.53236 18.3637 6.03728Z" fill="var(--icon-default)" />
                                    </svg>
                                    <span>{formatCounts(postData?.commentsCount)}</span>
                                </button>

                                <button className="cv-action-btn" onClick={(e) => debounceClickBookmark(e, postData?.journalId)}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
                                        <path fillRule="evenodd" clipRule="evenodd" d="M8 1.25C5.37665 1.25 3.25 3.37665 3.25 6V20.4648C3.25 21.7269 4.27311 22.75 5.53518 22.75C5.98634 22.75 6.42739 22.6165 6.80278 22.3662L11.3066 19.3636C11.7265 19.0837 12.2735 19.0837 12.6934 19.3636L17.1972 22.3662C17.5726 22.6165 18.0137 22.75 18.4648 22.75C19.7269 22.75 20.75 21.7269 20.75 20.4648V6C20.75 3.37665 18.6234 1.25 16 1.25H8ZM9 6.75C8.58579 6.75 8.25 7.08579 8.25 7.5C8.25 7.91421 8.58579 8.25 9 8.25H15C15.4142 8.25 15.75 7.91421 15.75 7.5C15.75 7.08579 15.4142 6.75 15 6.75H9Z" fill={isBookmarked ? "rgb(72, 208, 135)" : "var(--icon-default)"} />
                                    </svg>
                                    <span>{formatCounts(bookmarkCounts)}</span>
                                </button>

                                <div style={{ position: 'relative', marginLeft: 'auto' }}>
                                    <button
                                        className="cv-action-btn"
                                        onClick={(e) => { e.stopPropagation(); setShowShareMenu((v) => !v); }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="var(--icon-default)">
                                            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
                                        </svg>
                                    </button>
                                    {showShareMenu && (
                                        <ShareMenu
                                            url={getShareUrl(postData?.journalId)}
                                            title={postData?.title || ''}
                                            onClose={() => setShowShareMenu(false)}
                                        />
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* ── Normal post view ── */}
                            <h1 className="cv-title">{postData?.title}</h1>

                            <div className="cv-meta">
                                <div
                                    onClick={(e) => handleclickUserProfile(e, user?.userData?.[0]?.id, postData?.userId)}
                                    className={`cv-avatar-wrap ${postData?.badge === 'legend' ? 'cv-avatar-ring-legend' : postData?.badge === 'og' ? 'cv-avatar-ring-og' : ''}`}
                                >
                                    <img src={postData?.avatar || '/assets/profile.jpg'} className="cv-avatar" alt="user avatar" />
                                </div>
                                <div className="cv-meta-info">
                                    <div className="cv-meta-top">
                                        <span
                                            onClick={(e) => handleclickUserProfile(e, user?.userData?.[0]?.id, postData?.userId)}
                                            className="cv-author-name"
                                        >
                                            {postData?.name}
                                        </span>
                                        <VerifiedBadge badge={postData?.badge} size={16} />
                                        {postData?.userId !== user?.userData?.[0]?.id && (
                                            <button
                                                onClick={(e) => debounceClickFollow(e, postData?.userId, user?.userData?.[0]?.id)}
                                                className={`cv-follow-btn ${followsData?.isFollowing ? 'cv-follow-btn--following' : ''}`}
                                            >
                                                {followsData?.isFollowing ? 'Following' : 'Follow'}
                                            </button>
                                        )}
                                    </div>
                                    <div className="cv-meta-bottom">
                                        <span className="cv-date">
                                            {new Date(postData?.created_at).toLocaleDateString('en-US', {
                                                month: 'long',
                                                day: '2-digit',
                                                year: 'numeric',
                                            })}
                                        </span>
                                        <span className="cv-meta-dot">&middot;</span>
                                        <span className="cv-read-time">{CalculateText(postData?.wholeText)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="cv-actions">
                                <button
                                    className="cv-action-btn"
                                    onClick={(e) => handleClickLike(e, postData?.journalId, postData?.userId, user?.userData?.[0]?.image_url, user?.userData?.[0]?.name, user?.userData?.[0]?.user_email)}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
                                        <path fillRule="evenodd" clipRule="evenodd" d="M15.9977 5.63891C16.2695 4.34931 15.433 3.00969 14.2102 2.59462C13.6171 2.37633 12.9892 2.4252 12.4662 2.60499C11.9449 2.78419 11.4461 3.12142 11.1369 3.58441L11.136 3.58573L7.49506 9.00272C8.05104 9.29585 8.43005 9.87954 8.43005 10.5518V21.3018H6.91003V21.3018H16.6801C18.2938 21.3018 19.2028 20.2977 19.8943 19.202C20.6524 18.0009 21.1453 16.7211 21.5116 15.5812C21.6808 15.0546 21.8252 14.5503 21.9547 14.0984L21.9863 13.9881C22.126 13.5007 22.2457 13.0904 22.366 12.7549C22.698 11.8292 22.5933 10.9072 22.067 10.2072C21.5476 9.5166 20.7005 9.15175 19.76 9.15175H15.76C15.6702 9.15175 15.6017 9.11544 15.5599 9.06803C15.5238 9.02716 15.4831 8.95058 15.502 8.81171L15.9977 5.63891Z" fill={isLiked ? 'rgb(235, 87, 87)' : "var(--icon-default)"} />
                                        <path d="M2.18005 10.6199C2.18005 10.03 2.62777 9.55176 3.18005 9.55176H6.68005C7.23234 9.55176 7.68005 10.03 7.68005 10.6199V21.3018H3.18005C2.62777 21.3018 2.18005 20.8235 2.18005 20.2336V10.6199Z" fill={isLiked ? 'rgb(235, 87, 87)' : "var(--icon-default)"} />
                                    </svg>
                                    <span>{formatCounts(likesCount)}</span>
                                </button>

                                <button className="cv-action-btn" onClick={hanldeClickComments}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="var(--icon-default)">
                                        <path fillRule="evenodd" clipRule="evenodd" d="M11.9862 0.763672C6.07454 0.763672 1.23621 5.36133 1.23621 11.1034C1.23621 13.5057 2.10188 15.7237 3.55066 17.4735C5.46882 19.8566 8.48271 21.3843 11.8522 21.4238L11.8878 21.4367C11.9902 21.4735 12.1385 21.5265 12.3236 21.5916C12.6936 21.7216 13.2115 21.9001 13.8035 22.0941C14.9799 22.4797 16.4767 22.9358 17.6892 23.1894C18.303 23.3178 18.9306 23.1718 19.4096 22.8608C19.8872 22.5507 20.3019 22.0126 20.3019 21.3173C20.3019 20.9046 20.1354 20.4987 19.9732 20.1857C19.8007 19.8529 19.5794 19.5251 19.371 19.2448C19.2691 19.1076 19.1676 18.9782 19.0724 18.8609C21.3193 16.9815 22.7362 14.2061 22.7362 11.1034C22.7362 7.55126 20.8865 4.4319 18.073 2.58609C16.3321 1.4227 14.2426 0.763672 11.9862 0.763672ZM18.3637 6.03728C18.1546 5.67972 17.6953 5.55937 17.3377 5.76847C16.9801 5.97757 16.8598 6.43694 17.0689 6.7945C17.8131 8.0671 18.2362 9.53599 18.2362 11.1034C18.2362 12.6662 17.8138 14.1316 17.0693 15.4016C16.8598 15.7589 16.9797 16.2184 17.337 16.4279C17.6943 16.6374 18.1538 16.5175 18.3633 16.1602C19.2385 14.6673 19.7362 12.941 19.7362 11.1034C19.7362 9.26158 19.238 7.53236 18.3637 6.03728Z" fill="var(--icon-default)" />
                                    </svg>
                                    <span>{formatCounts(postData?.commentsCount)}</span>
                                </button>

                                <button className="cv-action-btn" onClick={(e) => debounceClickBookmark(e, postData?.journalId)}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
                                        <path fillRule="evenodd" clipRule="evenodd" d="M8 1.25C5.37665 1.25 3.25 3.37665 3.25 6V20.4648C3.25 21.7269 4.27311 22.75 5.53518 22.75C5.98634 22.75 6.42739 22.6165 6.80278 22.3662L11.3066 19.3636C11.7265 19.0837 12.2735 19.0837 12.6934 19.3636L17.1972 22.3662C17.5726 22.6165 18.0137 22.75 18.4648 22.75C19.7269 22.75 20.75 21.7269 20.75 20.4648V6C20.75 3.37665 18.6234 1.25 16 1.25H8ZM9 6.75C8.58579 6.75 8.25 7.08579 8.25 7.5C8.25 7.91421 8.58579 8.25 9 8.25H15C15.4142 8.25 15.75 7.91421 15.75 7.5C15.75 7.08579 15.4142 6.75 15 6.75H9Z" fill={isBookmarked ? "rgb(72, 208, 135)" : "var(--icon-default)"} />
                                    </svg>
                                    <span>{formatCounts(bookmarkCounts)}</span>
                                </button>

                                {postData?.userId !== user?.userData?.[0]?.id && (
                                    <button
                                        className="cv-action-btn cv-action-btn--end"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if(!session) return openAuthModal?.();
                                            setShowRepostModal(true);
                                        }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="var(--icon-default)">
                                            <path d="M7 7h10l-1.293-1.293a1 1 0 0 1 1.414-1.414l3 3a1 1 0 0 1 0 1.414l-3 3a1 1 0 0 1-1.414-1.414L17 9H7a1 1 0 0 1-1-1V5a1 1 0 0 1 2 0v2zm10 10H7l1.293 1.293a1 1 0 0 1-1.414 1.414l-3-3a1 1 0 0 1 0-1.414l3-3a1 1 0 1 1 1.414 1.414L7 15h10a1 1 0 0 1 1 1v3a1 1 0 0 1-2 0v-2z"/>
                                        </svg>
                                        <span>Repost</span>
                                    </button>
                                )}

                                <div style={{ position: 'relative', marginLeft: postData?.userId === user?.userData?.[0]?.id ? 'auto' : '0' }}>
                                    <button
                                        className="cv-action-btn"
                                        onClick={(e) => { e.stopPropagation(); setShowShareMenu((v) => !v); }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="var(--icon-default)">
                                            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
                                        </svg>
                                    </button>
                                    {showShareMenu && (
                                        <ShareMenu
                                            url={getShareUrl(postData?.journalId)}
                                            title={postData?.title || ''}
                                            onClose={() => setShowShareMenu(false)}
                                        />
                                    )}
                                </div>
                            </div>

                            {postData?.postType === 'canvas' && (
                                <div className="cv-canvas-actions">
                                    <button
                                        type="button"
                                        className="cv-remix-btn"
                                        onClick={handleRemixCanvas}
                                        disabled={!session}
                                        title={session ? "Remix this canvas" : "Sign in to remix"}
                                    >
                                        Remix this Canvas
                                    </button>
                                </div>
                            )}

                            <div className="cv-body">
                                {postData?.postType === 'canvas' ? (
                                    <CanvasViewer canvasDoc={postData?.canvasDoc} />
                                ) : (
                                    <LexicalComposer initialConfig={{
                                        namespace: "ContentViewer",
                                        theme: theme,
                                        editable: false,
                                        editorState: postData?.content,
                                        nodes: [HeadingNode, ImageNode, QuoteNode],
                                        onError(error) { throw error; },
                                    }}>
                                        <RichTextPlugin
                                            contentEditable={<ContentEditable />}
                                            ErrorBoundary={LexicalErrorBoundary}
                                        />
                                    </LexicalComposer>
                                )}
                            </div>
                        </>
                    )}
                </article>

                {/* Toast notification */}
            <AnimatePresence>
                {(bookmarkedMessage) && (
                    <motion.div
                        className="cv-toast"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                        {bookmarkedMessage}
                    </motion.div>
                )}
            </AnimatePresence>
            </div>

            {showRepostModal && postData && (
                <RepostModal
                    journal={{
                        id: postData.journalId,
                        title: postData.title,
                        users: {
                            id: postData.userId,
                            name: postData.name,
                            image_url: postData.avatar,
                            badge: postData.badge
                        }
                    }}
                    onClose={(result) => {
                        setShowRepostModal(false);
                        if(result === 'success'){
                            setBookmarkedMessage('Post was reposted');
                            if(timeOutRefBookmark.current){
                                clearTimeout(timeOutRefBookmark.current);
                            }
                            timeOutRefBookmark.current = setTimeout(() => {
                                setBookmarkedMessage('');
                            }, 2500);
                        }
                    }}
                />
            )}
        </>
    )
}

export default ContentView;
