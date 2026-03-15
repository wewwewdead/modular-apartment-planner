import { useInfiniteQuery } from "@tanstack/react-query"
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom"
import { getCollections } from "../../../API/Api";
import { useAuth } from "../../Context/useAuth";
import './collection.css';
import formatPostDate from "../../../helpers/formatDateString";
import { useInView } from "react-intersection-observer";


const CollectionViewer = () =>{
    const location = useLocation();
    const userId = location.state?.userId || new URLSearchParams(location.search).get('userId');
    const navigate = useNavigate();
    const { session } = useAuth();

    const {ref, inView} = useInView({
        threshold: 0,
    })

    const {data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage} = useInfiniteQuery({
        queryKey: ['visitedProfileCollections', userId],
        queryFn: ({queryKey, pageParam = null}) => getCollections(queryKey[1], pageParam, 5, session?.access_token),
        getNextPageParam: (lastPage) =>{
            if(lastPage?.hasMore){
                const lastJournal = lastPage?.data[lastPage?.data?.length - 1]
                return new Date(lastJournal?.created_at).toISOString() ;
            } else {
                return undefined;
            }
        },
        enabled: !!userId,
        refetchOnWindowFocus: false
    })

    const handleClickCards = (e, collectionId, collectionName, collectionDescription, isPublic) =>{
        e.stopPropagation();
        if(isPublic === 'private'){
            return;
        }
        navigate('/home/userCollections', {
            state:
            {
                collectionId: collectionId,
                collectionName: collectionName,
                collectionDescription: collectionDescription

            }
        }
    )
    }

    useEffect(() =>{
        if(inView && !isFetchingNextPage && hasNextPage){
            fetchNextPage();
        }

    }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage])

    const collections = data?.pages.flatMap((page) => page.data) || [];

    if(isLoading){
        return(
            <div key={1} className="collection-container">
                <div className="collection-container-header">
                    <h3 className="collection-container-title">Collections</h3>
                </div>
                <div className="cv-grid">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="cv-skeleton" />
                    ))}
                </div>
            </div>
        )
    }

    if(collections.length === 0 && !isLoading){
        return(
            <div key={2} className="collection-container">
                <div className="collection-container-header">
                    <h3 className="collection-container-title">Collections</h3>
                </div>
                <div className="no-collections-container">
                    <div className="empty-state-icon-ring">
                        <svg xmlns="http://www.w3.org/2000/svg" height="28px" viewBox="0 -960 960 960" width="28px" fill="currentColor">
                            <path d="M240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h480q33 0 56.5 23.5T800-800v640q0 33-23.5 56.5T720-80H240Zm0-80h480v-640H240v640Zm240-40q8 0 14-6t6-14q0-8-6-14t-14-6q-8 0-14 6t-6 14q0 8 6 14t14 6Zm-120-80h240v-80H360v80Zm0-120h240v-80H360v80Z"/>
                        </svg>
                    </div>
                    <h3 className="empty-state-title">No collections yet</h3>
                    <p className="empty-state-description">This user hasn't created any collections.</p>
                </div>
            </div>
        )
    }

    return(
        <>
        <div className="collection-container">
            <div className="collection-container-header">
                <h3 className="collection-container-title">Collections</h3>
                <span className="collection-container-count">{collections.length}</span>
            </div>
            <div className="cv-grid">
                {collections?.map((collection) => {
                    const accentIndex = collection.id ? collection.id.toString().charCodeAt(0) % 4 : 0;
                    return (
                    <div key={collection.id} onClick={(e) => handleClickCards(e, collection.id, collection.name, collection.description, collection.is_public)} className="cv-card">

                        {collection.is_public === 'private' && (
                            <div className="collection-private-blocker">
                                <div className="private-blocker-content">
                                    <div className="private-blocker-icon">
                                        <svg xmlns="http://www.w3.org/2000/svg" height="22px" viewBox="0 -960 960 960" width="22px" fill="currentColor">
                                            <path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm240-200q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z"/>
                                        </svg>
                                    </div>
                                    <span className="private-blocker-label">Private</span>
                                </div>
                            </div>
                        )}

                        <div className="cv-gradient-header" data-accent={accentIndex}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M18,2 C19.3807,2 20.5,3.11929 20.5,4.5 L20.5,18.75 C20.5,19.1642 20.1642,19.5 19.75,19.5 L5.5,19.5 C5.5,20.0523 5.94772,20.5 6.5,20.5 L19.75,20.5 C20.1642,20.5 20.5,20.8358 20.5,21.25 C20.5,21.6642 20.1642,22 19.75,22 L6.5,22 C5.11929,22 4,20.8807 4,19.5 L4,4.5 C4,3.11929 5.11929,2 6.5,2 L18,2 Z"/>
                            </svg>
                            {collection.is_public === 'public' ? (
                                <span className="cv-badge cv-badge--public">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 -960 960 960" fill="currentColor"><path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z"/></svg>
                                    Public
                                </span>
                            ) : (
                                <span className="cv-badge cv-badge--private">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 -960 960 960" fill="currentColor"><path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Z"/></svg>
                                    Private
                                </span>
                            )}
                        </div>
                        <div className="cv-card-body">
                            <div className="cv-card-name text-truncate">
                                {collection.name}
                            </div>
                            <div className="cv-card-date">
                                {formatPostDate(collection.created_at)}
                            </div>
                            {collection.description && (
                                <div className="cv-card-description text-truncate-2">
                                    {collection.description}
                                </div>
                            )}
                        </div>
                    </div>
                    )
                })}
            </div>
        </div>
        <div ref={ref} className="viewer">
        </div>
        </>
    )
}

export default CollectionViewer;
