import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../../Context/useAuth";
import { getVisitedProfileMedia } from "../../../../API/Api";

const PROFILE_MEDIA_PAGE_SIZE = 5;

const VisitedProfileMediaSection = () => {
    const location = useLocation();
    const stateData = location.state;
    const queryUserId = new URLSearchParams(location.search).get("userId");
    const visitedUserId = stateData?.userId || queryUserId;
    const { session } = useAuth();

    const [selectedMedia, setSelectedMedia] = useState(null);
    const { ref: inViewRef, inView } = useInView({ threshold: 0.1 });

    const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
        queryKey: ["visitedProfileMedia", visitedUserId],
        queryFn: ({ pageParam }) =>
            getVisitedProfileMedia(session?.access_token, visitedUserId, pageParam, PROFILE_MEDIA_PAGE_SIZE),
        initialPageParam: null,
        getNextPageParam: (lastPage) => (lastPage?.hasMore ? lastPage?.nextCursor : undefined),
        enabled: Boolean(visitedUserId && session?.access_token),
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60 * 10,
    });

    const pages = data?.pages ?? [];
    const mediaItems = pages.flatMap((page) => page?.data ?? []);
    const unavailableBuckets = [...new Set(pages.flatMap((page) => page?.unavailableBuckets ?? []))];
    const hasMedia = mediaItems.length > 0;

    useEffect(() => {
        if (inView && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
        }
    }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

    useEffect(() => {
        if (!selectedMedia) return;

        const handleEscape = (event) => {
            if (event.key === "Escape") {
                setSelectedMedia(null);
            }
        };

        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [selectedMedia]);

    const profileParentContainer = typeof document !== "undefined" ? document.querySelector(".profile-parent-container") : null;

    return (
        <section className="profile-media-section" aria-label="Visited profile media">
            <div className="profile-media-header-row">
                <h2 className="profile-media-heading">
                    Posts <span className="profile-media-count">({mediaItems.length})</span>
                </h2>
            </div>

            {unavailableBuckets.length > 0 && <p className="profile-media-warning">Unable to list: {unavailableBuckets.join(", ")}.</p>}

            {isLoading && (
                <div className="profile-media-grid">
                    {Array.from({ length: 9 }).map((_, index) => (
                        <div key={`visited-media-loading-${index}`} className="profile-media-grid-item profile-media-grid-loading-item" />
                    ))}
                </div>
            )}

            {!isLoading && isError && <p className="profile-media-empty-state">Unable to load media right now.</p>}

            {!isLoading && !isError && !hasMedia && <p className="profile-media-empty-state">No media found yet.</p>}

            {!isLoading && !isError && hasMedia && (
                <div className="profile-media-grid">
                    {mediaItems.map((item) => (
                        <div key={item.id} className="profile-media-grid-item">
                            <button
                                className="profile-media-grid-image-button"
                                type="button"
                                onClick={() => setSelectedMedia(item)}
                                title={`View ${item.bucket} image full size`}
                            >
                                <img className="profile-media-image" src={item.url} alt={`${item.bucket} media`} loading="lazy" />
                            </button>
                        </div>
                    ))}
                    {isFetchingNextPage &&
                        Array.from({ length: PROFILE_MEDIA_PAGE_SIZE }).map((_, index) => (
                            <div key={`visited-media-loading-next-${index}`} className="profile-media-grid-item profile-media-grid-loading-item" />
                        ))}
                </div>
            )}

            {!isLoading && hasMedia && hasNextPage && <div ref={inViewRef} className="profile-media-infinite-sentinel" />}

            {selectedMedia &&
                profileParentContainer &&
                createPortal(
                    <div className="profile-media-lightbox-overlay" onClick={() => setSelectedMedia(null)} role="presentation">
                        <div
                            className="profile-media-lightbox-dialog"
                            role="dialog"
                            aria-modal="true"
                            aria-label="Full size media preview"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <button
                                className="profile-media-lightbox-close"
                                type="button"
                                onClick={() => setSelectedMedia(null)}
                                aria-label="Close image preview"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" height="22" viewBox="0 -960 960 960" width="22" fill="currentColor">
                                    <path d="m291-240-51-51 189-189-189-189 51-51 189 189 189-189 51 51-189 189 189 189-51 51-189-189-189 189Z" />
                                </svg>
                            </button>
                            <img className="profile-media-lightbox-image" src={selectedMedia.url} alt={`${selectedMedia.bucket} media full size`} />
                        </div>
                    </div>,
                    profileParentContainer
                )}
        </section>
    );
};

export default VisitedProfileMediaSection;
