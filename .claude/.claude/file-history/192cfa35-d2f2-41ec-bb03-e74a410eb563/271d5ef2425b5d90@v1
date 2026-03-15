import { useEffect, useMemo, useState } from "react";
import { MoonLoader } from "react-spinners";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useInView } from "react-intersection-observer";
import { getCanvasGallery } from "../../../../API/Api";
import { useAuth } from "../../../Context/useAuth";
import formatPostDate from "../../../../helpers/formatDateString";
import { handleClickProfile } from "../../../../helpers/handleClicks";
import VerifiedBadge from "../../Badge/VerifiedBadge";
import { getCanvasPreview } from "../../../utils/canvasDoc";
import CanvasPreview from "../postCards/CanvasPreview/CanvasPreview";
import CalculateText from "../postCards/calculateReadingTime";
import "./gallery.css";

const CANVAS_GALLERY_PAGE_SIZE = 5;

const GalleryPage = () => {
    const navigate = useNavigate();
    const {session, user, openAuthModal} = useAuth();
    const handleClickUserProfileOriginal = handleClickProfile(navigate);
    const userId = user?.userData?.[0]?.id || null;
    const [sortMode, setSortMode] = useState('hottest');
    const {ref: inViewRef, inView} = useInView({threshold: 0.1});

    const {
        data,
        isLoading,
        isFetching,
        isFetchingNextPage,
        fetchNextPage,
        hasNextPage
    } = useInfiniteQuery({
        queryKey: ['canvasGallery', userId, sortMode],
        queryFn: ({pageParam = null}) => getCanvasGallery(userId, CANVAS_GALLERY_PAGE_SIZE, sortMode, pageParam),
        initialPageParam: null,
        getNextPageParam: (lastPage) => (lastPage?.hasMore ? lastPage?.nextCursor : undefined),
        refetchOnWindowFocus: false,
        staleTime: 1000 * 45
    });

    useEffect(() => {
        if(inView && hasNextPage && !isFetchingNextPage){
            fetchNextPage();
        }
    }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

    const journals = useMemo(() => (
        (data?.pages || [])
            .flatMap((page) => page?.data || [])
            .filter((journal) => journal?.post_type === "canvas")
    ), [data?.pages]);

    const handleOpenCanvas = (journalId) => {
        if(!session){
            openAuthModal();
            return;
        }
        navigate(`/home/post/${journalId}`);
    };

    const handleClickUserProfile = (event, clickedUserId) => {
        event.stopPropagation();
        if(!session){
            openAuthModal();
            return;
        }
        handleClickUserProfileOriginal(event, userId, clickedUserId);
    };

    const handleRemixCanvas = (event, journal) => {
        event.stopPropagation();
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
    };

    if(isLoading){
        return (
            <div className="gallery-loading-state">
                <MoonLoader loading={isLoading} color="var(--loader-color)" size={20} />
            </div>
        );
    }

    return (
        <div className="gallery-page-root">
            <div className="gallery-top-bar">
                <div className="gallery-title-shell">
                    <h2 className="gallery-title">Gallery</h2>
                    <p className="gallery-subtitle">Canvas posts arranged as visual pieces</p>
                </div>

                <div className="gallery-sort-shell">
                    <button
                        type="button"
                        className={`gallery-sort-btn ${sortMode === 'hottest' ? 'is-active' : ''}`}
                        onClick={() => setSortMode('hottest')}
                    >
                        Hottest
                    </button>
                    <button
                        type="button"
                        className={`gallery-sort-btn ${sortMode === 'newest' ? 'is-active' : ''}`}
                        onClick={() => setSortMode('newest')}
                    >
                        Newest
                    </button>
                </div>
            </div>

            {isFetching && !isFetchingNextPage && (
                <div className="gallery-refresh-pill">Refreshing...</div>
            )}

            {journals.length === 0 ? (
                <div className="gallery-empty-state">No public canvases yet.</div>
            ) : (
                <>
                    <div className="gallery-cards">
                        {journals.map((journal) => {
                            const canvasPreview = getCanvasPreview(journal?.canvas_doc);
                            const previewText = canvasPreview?.slicedText || 'No text added to this canvas yet.';
                            const wholeText = canvasPreview?.wholeText || '';

                            return (
                            <article
                                key={journal.id}
                                className="gallery-canvas-card"
                                onClick={() => handleOpenCanvas(journal.id)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(event) => {
                                    if(event.key === 'Enter' || event.key === ' '){
                                        event.preventDefault();
                                        handleOpenCanvas(journal.id);
                                    }
                                }}
                            >
                                <CanvasPreview canvasDoc={journal?.canvas_doc} />
                                <div className="gallery-canvas-content">
                                    <div className="gallery-content-container">
                                        <div className="gallery-feed-text-content-container">
                                            <div className="gallery-feed-title-content">
                                                <span className="gallery-canvas-type-badge">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                                         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                                                        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                                                        <path d="M2 2l7.586 7.586"/>
                                                        <circle cx="11" cy="11" r="2"/>
                                                    </svg>
                                                    Canvas
                                                </span>
                                                <h3 className="gallery-feed-title">
                                                    {journal?.title?.length > 55 ? `${journal.title.substring(0, 55)}...` : (journal?.title || 'Untitled Canvas')}
                                                </h3>
                                            </div>
                                            <p className="gallery-feed-text-content">
                                                {previewText}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="gallery-canvas-actions">
                                        <button
                                            type="button"
                                            className="gallery-canvas-action-btn is-remix"
                                            onClick={(event) => handleRemixCanvas(event, journal)}
                                        >
                                            Remix this Canvas
                                        </button>
                                    </div>
                                </div>

                                <div className="gallery-card-footer">
                                    <div
                                        className="gallery-user-info-child-container"
                                        onClick={(event) => handleClickUserProfile(event, journal?.users?.id)}
                                    >
                                        <div className={`gallery-user-avatar-container ${journal?.users?.badge === 'legend' ? 'avatar-ring-legend' : journal?.users?.badge === 'og' ? 'avatar-ring-og' : ''}`}>
                                            <img
                                                loading="lazy"
                                                className="gallery-user-info-avatar"
                                                src={journal?.users?.image_url || '/assets/profile.jpg'}
                                                alt={`${journal?.users?.name || "User"} profile picture`}
                                            />
                                        </div>
                                        <div className="gallery-user-name-container">
                                            <p className="gallery-user-newsfeed-name">{journal?.users?.name || 'Unknown'}</p>
                                            <VerifiedBadge badge={journal?.users?.badge} size={14} />
                                        </div>
                                        <div className="gallery-name-info-separator">•</div>
                                        <p className="gallery-user-post-date">{formatPostDate(journal?.created_at)}</p>
                                    </div>

                                    <div className="gallery-reading-time-container">
                                        <p className="gallery-reading-time-text">{CalculateText(wholeText)}</p>
                                    </div>

                                    <div className="gallery-card-score">
                                        <span>Hot score</span>
                                        <span>{journal?.hot_score || 0}</span>
                                    </div>
                                </div>
                            </article>
                        )})}
                    </div>

                    {isFetchingNextPage && (
                        <div className="gallery-next-loading">
                            <MoonLoader loading={isFetchingNextPage} color="var(--loader-color)" size={16} />
                        </div>
                    )}

                    {hasNextPage && <div ref={inViewRef} className="gallery-infinite-sentinel" />}
                </>
            )}
        </div>
    );
}

export default GalleryPage;
