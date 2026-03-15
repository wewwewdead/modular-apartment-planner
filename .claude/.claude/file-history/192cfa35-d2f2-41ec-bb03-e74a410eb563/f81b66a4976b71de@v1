import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { addJournalCollection, getNotCollectedJournals } from "../../../API/Api";
import { useAuth } from "../../Context/useAuth";
import { useEffect, useState } from "react";
import ParseContent from "../HomePage/postCards/parseData";
import { HashLoader, MoonLoader } from "react-spinners";
import { useInView } from 'react-intersection-observer';

const NotCollectedJournalList = ({collectionId, onClose}) =>{
    const queryClient = useQueryClient();

    const [selectedPost, setSelectedPost] = useState(new Map());

    const {ref, inView} = useInView({threshold: 0.2})

    const {user, session} = useAuth();
    const [isSaving, setIsSaving] = useState(false);

    const {data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage} = useInfiniteQuery({
        queryKey: ['getNotCollected', user?.userData[0].id, collectionId],
        queryFn: ({queryKey, pageParam}) => getNotCollectedJournals(pageParam, 5, queryKey[1], queryKey[2], session?.access_token),
        getNextPageParam: (lastPage) => {
            if(lastPage.hasMore){
                const lastNotCollected = lastPage?.data[lastPage?.data?.length - 1];
                return new Date(lastNotCollected?.created_at).toISOString();
            } else {
                return undefined;
            }
        },
        enabled: !!collectionId,
        refetchOnWindowFocus: false
    })

    const handleClick = (e, collected, journal) =>{
        e.stopPropagation();
        if(collected){
            return;
        }
        setSelectedPost((prev) => {
            const newMap  = new Map(prev);
            if(newMap.has(journal.id)){
                newMap.delete(journal.id);
            } else {
                newMap.set(journal.id, journal);
            }
            return newMap;
        })

    }

    const isSelected = (journalId) =>{
        return selectedPost.has(journalId);
    }

    const unMount = () =>{
        onClose();
    }

    const handleClickSave = async(e) =>{
        e.stopPropagation();
        const journalIds = Array.from(selectedPost.values());
        const journalIdsArray = journalIds.flatMap((journal) => journal.id);

        const formdata = new FormData();
        formdata.append('journalIds', journalIdsArray);
        formdata.append('collectionId', collectionId);
        try {
            setIsSaving(true);
            const message = await addJournalCollection(session?.access_token, formdata);

            if(message){
                console.log(message);
            }
            setIsSaving(false);
            queryClient.invalidateQueries(['getCollectionJournals', collectionId, session?.access_token])
            onClose();
        } catch (error) {
            setIsSaving(false);
            onClose();
            throw new Error('error saving journals in to collections');
        }


    }

    useEffect(() =>{
        if(inView && !isFetchingNextPage && hasNextPage){
            fetchNextPage();
        }
    }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage])

    const notCollectedJournals = data?.pages?.flatMap((page) => page.data) || [];

    if(notCollectedJournals.length === 0 && !isLoading){
        return(
            <>
            <div className="notCollectedJournalList">
                <div className="close-bttn-container">
                <div onClick={() => unMount()} className="close-bttn" role="button" tabIndex={0} aria-label="Close" onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') unMount() }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="28px" height="28px" viewBox="0 0 24 24" fill="none">
                        <g id="Menu / Close_SM">
                            <path id="Vector" d="M16 16L12 12M12 12L8 8M12 12L16 8M12 12L8 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </g>
                    </svg>
                </div>
                </div>
                <div className="no-collections-container">
                    <svg className="empty-state-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                    </svg>
                    <h3 className="empty-state-title">No posts available</h3>
                    <p className="empty-state-description">All your journals have already been collected or you haven't written any yet.</p>
                </div>
            </div>
            </>
        )
    }

    if(isLoading){
        return(
            <div className="notCollectedJournalList">
                <div className="notCollectedJournalList-loading-container">
                    <MoonLoader loading={isLoading} color="var(--loader-color)" size={25}/>
                </div>
            </div>
        )
    }

    return(
        <>
        <div className="notCollectedJournalList">
            {isSaving && (
                <div className="saving-loding-container">
                    Saving...
                    <HashLoader loading={isSaving}/>
                </div>
            )}
            <div className="close-bttn-container">
                <div onClick={() => unMount()} className="close-bttn" role="button" tabIndex={0} aria-label="Close" onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') unMount() }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="28px" height="28px" viewBox="0 0 24 24" fill="none">
                        <g id="Menu / Close_SM">
                            <path id="Vector" d="M16 16L12 12M12 12L8 8M12 12L16 8M12 12L8 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </g>
                    </svg>
                </div>
            </div>

            <div className="not-collected-list-container">
                {notCollectedJournals.map((journal) => {
                    const parseContent = ParseContent(journal?.content);

                    return(
                        <div onClick={(e) => {handleClick(e, journal.hasCollected, journal)}} className={isSelected(journal.id) ? "collected-cards" : "not-collected-cards"} key={journal.id} role="button" tabIndex={0} onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') handleClick(e, journal.hasCollected, journal) }}>
                            {isSelected(journal.id) && (
                                <div className="selection-check">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                </div>
                            )}
                            <div className="not-collected-title">
                                <p>{journal?.title}</p>
                                {journal.hasCollected && (
                                    <div className="if-collected-text">already collected</div>
                                )}

                            </div>

                            <div className="not-collected-text">
                                {parseContent?.slicedText}
                            </div>
                        </div>
                    )
                })}
                <div className="in-view" ref={ref}/>
            </div>

            <div className="save-button-container">
                <button onClick={(e) => handleClickSave(e)} className="btn-collection btn-collection--primary">
                    Save
                </button>
                <div>
                    Selected: <span style={{color: 'var(--accent-purple)', fontWeight: 700}}>{selectedPost.size}</span>
                </div>
            </div>
        </div>
        </>
    )
}

export default NotCollectedJournalList;
