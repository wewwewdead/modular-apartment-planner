import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import { useAuth } from "../../../Context/useAuth";
import { deleteProfileMediaImage, getProfileMedia } from "../../../../API/Api";

const PROFILE_MEDIA_PAGE_SIZE = 5;

const ProfileMediaSection = () => {
    const { user, session } = useAuth();
    const queryClient = useQueryClient();
    const userId = user?.userData?.[0]?.id;
    const [selectedMedia, setSelectedMedia] = useState(null);
    const [activeMenuId, setActiveMenuId] = useState(null);
    const [deleteCandidate, setDeleteCandidate] = useState(null);
    const { ref: inViewRef, inView } = useInView({ threshold: 0.1 });

    const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
        queryKey: ["profileMedia", userId],
        queryFn: ({ pageParam }) => getProfileMedia(session?.access_token, pageParam, PROFILE_MEDIA_PAGE_SIZE),
        initialPageParam: null,
        getNextPageParam: (lastPage) => (lastPage?.hasMore ? lastPage?.nextCursor : undefined),
        enabled: Boolean(userId && session?.access_token),
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60 * 10,
    });

    const pages = data?.pages ?? [];
    const mediaItems = pages.flatMap((page) => page?.data ?? []);
    const unavailableBuckets = [...new Set(pages.flatMap((page) => page?.unavailableBuckets ?? []))];
    const hasMedia = mediaItems.length > 0;

    const deleteMediaMutation = useMutation({
        mutationFn: (targetMedia) =>
            deleteProfileMediaImage(session?.access_token, {
                bucket: targetMedia.bucket,
                path: targetMedia.path,
                url: targetMedia.url,
            }),
        onSuccess: (response, targetMedia) => {
            setDeleteCandidate(null);
            setActiveMenuId(null);

            if (selectedMedia?.id === targetMedia?.id) {
                setSelectedMedia(null);
            }

            queryClient.setQueryData(["profileMedia", userId], (oldData) => {
                if (!oldData || !Array.isArray(oldData.pages)) {
                    return oldData;
                }

                return {
                    ...oldData,
                    pages: oldData.pages.map((page) => ({
                        ...page,
                        data: Array.isArray(page?.data) ? page.data.filter((item) => item.id !== targetMedia.id) : page?.data,
                    })),
                };
            });

            queryClient.invalidateQueries({ queryKey: ["profileMedia", userId] });

            if (response?.clearedAvatar || response?.clearedBackground) {
                queryClient.invalidateQueries({ queryKey: ["userData", session?.user?.id] });
            }
        },
    });

    const handleOpenMedia = (item) => {
        if (!item?.url) return;
        setSelectedMedia(item);
    };

    const handleToggleSettingsMenu = (event, mediaId) => {
        event.stopPropagation();
        setActiveMenuId((currentId) => (currentId === mediaId ? null : mediaId));
    };

    const handleOpenDeleteModal = (event, item) => {
        event.stopPropagation();
        setDeleteCandidate(item);
        setActiveMenuId(null);
    };

    const handleCloseDeleteModal = () => {
        setDeleteCandidate(null);
    };

    const handleConfirmDelete = () => {
        if (!deleteCandidate || deleteMediaMutation.isPending) {
            return;
        }

        deleteMediaMutation.mutate(deleteCandidate);
    };

    const handleCloseMedia = () => {
        setSelectedMedia(null);
    };

    const profileParentContainer = typeof document !== "undefined" ? document.querySelector(".profile-parent-container") : null;

    useEffect(() => {
        if (inView && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
        }
    }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

    useEffect(() => {
        const handleWindowClick = (event) => {
            if (!event.target.closest(".profile-media-item-actions")) {
                setActiveMenuId(null);
            }
        };

        window.addEventListener("click", handleWindowClick);
        return () => window.removeEventListener("click", handleWindowClick);
    }, []);

    useEffect(() => {
        if (!selectedMedia && !deleteCandidate) return;

        const handleEscape = (event) => {
            if (event.key === "Escape") {
                if (deleteCandidate) {
                    handleCloseDeleteModal();
                    return;
                }

                handleCloseMedia();
            }
        };

        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [selectedMedia, deleteCandidate]);

    return (
        <section className="profile-media-section" aria-label="Profile media">
            <div className="profile-media-header-row">
                <h2 className="profile-media-heading">
                    Posts <span className="profile-media-count">({mediaItems.length})</span>
                </h2>
            </div>

            {unavailableBuckets.length > 0 && <p className="profile-media-warning">Unable to list: {unavailableBuckets.join(", ")}.</p>}

            {isLoading && (
                <div className="profile-media-grid">
                    {Array.from({ length: 9 }).map((_, index) => (
                        <div key={`media-loading-${index}`} className="profile-media-grid-item profile-media-grid-loading-item" />
                    ))}
                </div>
            )}

            {!isLoading && isError && <p className="profile-media-empty-state">Unable to load your media right now.</p>}

            {!isLoading && !isError && !hasMedia && <p className="profile-media-empty-state">No media found in your buckets yet.</p>}

            {!isLoading && !isError && hasMedia && (
                <div className="profile-media-grid">
                    {mediaItems.map((item) => (
                        <div key={item.id} className="profile-media-grid-item">
                            <button
                                className="profile-media-grid-image-button"
                                type="button"
                                onClick={() => handleOpenMedia(item)}
                                title={`View ${item.bucket} image full size`}
                            >
                                <img
                                    className="profile-media-image"
                                    src={item.cardUrl || item.url}
                                    alt={`${item.bucket} media`}
                                    loading="lazy"
                                />
                            </button>
                            <div className="profile-media-item-actions">
                                <button
                                    className="profile-media-item-settings-btn"
                                    type="button"
                                    onClick={(event) => handleToggleSettingsMenu(event, item.id)}
                                    aria-label="Open image settings"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor">
                                        <path d="M240-400q-33 0-56.5-23.5T160-480q0-33 23.5-56.5T240-560q33 0 56.5 23.5T320-480q0 33-23.5 56.5T240-400Zm240 0q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm240 0q-33 0-56.5-23.5T640-480q0-33 23.5-56.5T720-560q33 0 56.5 23.5T800-480q0 33-23.5 56.5T720-400Z" />
                                    </svg>
                                </button>
                                {activeMenuId === item.id && (
                                    <div className="profile-media-item-settings-menu" role="menu" aria-label="Image actions">
                                        <button className="profile-media-item-delete-btn" type="button" onClick={(event) => handleOpenDeleteModal(event, item)}>
                                            Delete image
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {isFetchingNextPage &&
                        Array.from({ length: PROFILE_MEDIA_PAGE_SIZE }).map((_, index) => (
                            <div key={`media-loading-next-${index}`} className="profile-media-grid-item profile-media-grid-loading-item" />
                        ))}
                </div>
            )}

            {!isLoading && hasMedia && hasNextPage && <div ref={inViewRef} className="profile-media-infinite-sentinel" />}

            {selectedMedia &&
                profileParentContainer &&
                createPortal(
                <div className="profile-media-lightbox-overlay" onClick={handleCloseMedia} role="presentation">
                    <div className="profile-media-lightbox-dialog" role="dialog" aria-modal="true" aria-label="Full size media preview" onClick={(event) => event.stopPropagation()}>
                        <button className="profile-media-lightbox-close" type="button" onClick={handleCloseMedia} aria-label="Close image preview">
                            <svg xmlns="http://www.w3.org/2000/svg" height="22" viewBox="0 -960 960 960" width="22" fill="currentColor">
                                <path d="m291-240-51-51 189-189-189-189 51-51 189 189 189-189 51 51-189 189 189 189-51 51-189-189-189 189Z" />
                            </svg>
                        </button>
                        <img
                            className="profile-media-lightbox-image"
                            src={selectedMedia.originalUrl || selectedMedia.detailUrl || selectedMedia.url}
                            alt={`${selectedMedia.bucket} media full size`}
                        />
                    </div>
                </div>
                , profileParentContainer)}

            {deleteCandidate &&
                profileParentContainer &&
                createPortal(
                <div className="profile-media-delete-confirm-overlay" onClick={handleCloseDeleteModal} role="presentation">
                    <div className="profile-media-delete-confirm-dialog" role="dialog" aria-modal="true" aria-label="Delete media image" onClick={(event) => event.stopPropagation()}>
                        <h3 className="profile-media-delete-confirm-title">Delete image?</h3>
                        <p className="profile-media-delete-confirm-copy">
                            This image will be deleted permanently. This action can&apos;t be undone.
                        </p>
                        {deleteMediaMutation.isError && <p className="profile-media-delete-confirm-error">Failed to delete image. Try again.</p>}
                        <div className="profile-media-delete-confirm-actions">
                            <button type="button" className="profile-media-delete-cancel-btn" onClick={handleCloseDeleteModal} disabled={deleteMediaMutation.isPending}>
                                Cancel
                            </button>
                            <button type="button" className="profile-media-delete-confirm-btn" onClick={handleConfirmDelete} disabled={deleteMediaMutation.isPending}>
                                {deleteMediaMutation.isPending ? "Deleting..." : "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
                , profileParentContainer)}
        </section>
    );
};

export default ProfileMediaSection;
