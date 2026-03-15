import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "../../Context/useAuth";
import ParseContent from "../HomePage/postCards/parseData";
import { getUserJournals } from "../../../API/Api";
import { useEffect, useState } from "react";
import { MoonLoader } from "react-spinners";
import { useInView } from 'react-intersection-observer';

const OlderPost = ({onSave, onClose}) =>{
    const {user, session} = useAuth();
    const [selectedPostMap, setSelectedPostMap] = useState(new Map());
    const {ref, inView} = useInView({threshold: 0.2})

    const handleClickContent = (e, journal) =>{
        e.stopPropagation();

        setSelectedPostMap((prev) => {
            const newMap = new Map(prev);

            if(newMap.has(journal.id)){
                newMap.delete(journal.id)
            } else {
                newMap.set(journal.id, journal)
            }
            return newMap
        })
    }

    const handleSave = (e) =>{
        e.stopPropagation()
        onSave(selectedPostMap)
    }

    const handleClose = (e) =>{
        e.stopPropagation();
        onClose();
    }

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
    } = useInfiniteQuery({
        queryKey: ['userJournals', user?.userData?.[0].id],
        queryFn: ({queryKey, pageParam}) => getUserJournals(pageParam, 5, queryKey[1], session?.access_token),
        getNextPageParam: (lastPage) =>{
            if(lastPage.hasMore){
                const lastJournal = lastPage?.data[lastPage?.data.length - 1];
                return new Date(lastJournal.created_at).toISOString();
            } else {
                return undefined;
            }
        },
        enabled: !!user?.userData?.[0].id,
        refetchOnWindowFocus: false,
    })

    useEffect(() =>{
        if(inView && hasNextPage && !isFetchingNextPage){
            fetchNextPage();
        }
    }, [inView, isFetchingNextPage, hasNextPage, fetchNextPage])


    const journals = data?.pages?.flatMap((page) => page.data) || [];

    const isSelected = (journalId) =>{
        return selectedPostMap.has(journalId);
    }

    if(isLoading){
        return(
            <div className="older-loading-container">
                <MoonLoader loading={isLoading} color="var(--loader-color)" size={25}/>
            </div>

        )
    }
    return(
        <>
        <div className="older-post-container">
            <div className="cards-container">
                {journals?.map((journal) => {
                    const parsedContent = ParseContent(journal?.content);
                    return(
                        <div onClick={(e) => handleClickContent(e, journal)} key={journal.id} className={isSelected(journal.id) ? "old-post-cards-selected" : "old-post-cards"} role="button" tabIndex={0} onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') handleClickContent(e, journal) }}>
                            {isSelected(journal.id) && (
                                <div className="selection-check">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                </div>
                            )}
                            <div className="collection-journal-title">
                                {journal.title}
                            </div>
                            <div className="collection-sliced-text">{parsedContent.slicedText}</div>
                        </div>
                    )

                })}
                <div ref={ref} className="inview-container">
                </div>
            </div>

            <div className="save-older-post-container">
                <div className="save-child-container">
                    <button onClick={(e) => handleSave(e)} className="btn-collection btn-collection--primary">
                        Save
                    </button>
                    <div>
                        <p className="selected-post">Selected: <span style={{color: 'var(--accent-purple)'}}>{selectedPostMap.size}</span></p>
                    </div>
                </div>

                <button onClick={(e) => handleClose(e)} className="btn-collection btn-collection--secondary">
                    Cancel
                </button>
            </div>

        </div>
        </>
    )
}

export default OlderPost;
