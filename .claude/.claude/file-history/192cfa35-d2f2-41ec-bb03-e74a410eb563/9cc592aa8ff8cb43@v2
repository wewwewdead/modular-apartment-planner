import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getCollectionJournals,} from "../../../API/Api";
import { useLocation, useNavigate } from "react-router-dom";
import ParseContent from "../HomePage/postCards/parseData";
import { useAuth } from "../../Context/useAuth";
import { MoonLoader } from "react-spinners";
import { handleCLickContent } from "../../../helpers/handleClicks";
import { useState } from "react";
import NotCollectedJournalList from "./NotCollectedJournals";
import { useInView } from "react-intersection-observer";
import { useAddViewsMutation} from "../../utils/useMutation";
import { handleImageFallback } from "../../utils/handleImageFallback";


const CollectionJournals = () =>{
    const location = useLocation();
    const collectionData = location.state;
    const navigate = useNavigate();

    const {ref, inView} = useInView({threshold: 0.2})

    const {session, user} = useAuth();

    const scrollToTop = useRef();
    const [showNotCollected, setShowNotCollected] = useState(false);

    const {
        data,
        isLoading,
        hasNextPage,
        isFetchingNextPage,
        fetchNextPage
    } = useInfiniteQuery({
        queryKey: ['getCollectionJournals', collectionData?.collectionId, session?.access_token],
        queryFn: ({queryKey, pageParam}) => getCollectionJournals(queryKey[1], pageParam, 5, queryKey[2]),
        getNextPageParam: (lastPage) => {
            if(lastPage?.hasMore){
                const lastCollected = lastPage?.data[lastPage?.data?.length - 1];
                return lastCollected?.id;
            } else {
                return undefined;
            }
        },
        enabled: !!collectionData?.collectionId,
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60 * 5,
    })

    const handleClickBack = (e) =>{
        e.stopPropagation();
        window.history.back();
    }

    const handleClickCollection = handleCLickContent(navigate);

    const mutaViews = useAddViewsMutation(session);
    const viewContent = (e, content, wholeText, title, userId, name, image_url, created_at, journalId, hasLiked, commentsCount, hasBookMarked, likesCount, bookmarkCount) =>{
        e.stopPropagation();
        const formdata = new FormData();
        formdata.append('journalId', journalId);

        mutaViews.mutate(formdata);
        handleClickCollection(e, content, wholeText, title, userId, name, image_url, created_at, journalId, hasLiked, commentsCount, hasBookMarked, likesCount, bookmarkCount);
    }

    const clickAddJournalCollection = (e, userId, collectionId) =>{
        e.stopPropagation();
        setShowNotCollected(true)
    }

    const clickCloseAddJournalCollection = () =>{
        setShowNotCollected(false)
    }
    useEffect(() =>{
        if(inView && hasNextPage && !isFetchingNextPage){
            fetchNextPage();
        }
    }, [fetchNextPage, isFetchingNextPage, hasNextPage, inView])

    if(isLoading){
        return(
            <>
            <div className='collection-header'>
                <div onClick={(e) => handleClickBack(e)} className='back-button' role="button" tabIndex={0} aria-label="Go back" onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') handleClickBack(e) }}>
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M360-240 120-480l240-240 56 56-144 144h568v80H272l144 144-56 56Z"/></svg>
                </div>
                <p className='collections-header-text'>Browse your collections</p>
            </div>

            <div className="collection-journal-cards-container">
                <div className="no-collections-container">
                    <MoonLoader loading={isLoading} color="var(--loader-color)" size={25}/>
                </div>
            </div>
            </>
        )
    }

    const journals = data?.pages?.flatMap((page) => page.data) || [];


    if(journals.length === 0){
        return(
            <>
            {showNotCollected &&(
                <NotCollectedJournalList onClose={clickCloseAddJournalCollection} collectionId={collectionData?.collectionId}/>
            )}

            <div className='collection-header'>
                <div onClick={(e) => handleClickBack(e)} className='back-button' role="button" tabIndex={0} aria-label="Go back" onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') handleClickBack(e) }}>
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M360-240 120-480l240-240 56 56-144 144h568v80H272l144 144-56 56Z"/></svg>
                </div>
                <p className='collections-header-text'>Browse your collections</p>
            </div>

            <div className="collection-journal-cards-container">
                <div className="add-collection-container">
                    <div onClick={(e) => clickAddJournalCollection(e, user?.userData[0]?.id, collectionData?.collectionId)} className="btn-collection btn-collection--primary" role="button" tabIndex={0} aria-label="Add collection" onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') clickAddJournalCollection(e, user?.userData[0]?.id, collectionData?.collectionId) }}>
                        Add collection
                    </div>
                </div>

                <div className="collection-Name-description">
                    <div className="container1">
                        <div className="collection-name">
                            {collectionData?.collectionName}
                        </div>
                        <div className="collection-description-container">
                            {collectionData?.collectionDescription}
                        </div>
                    </div>

                    <div className="container2">
                        <svg className="bookshelf" xmlns="http://www.w3.org/2000/svg" width="200px" height="200px" viewBox="0 0 128 128" fill="none">
                            <path d="M29.1457 72.5776C29.1457 69.2639 31.832 66.5776 35.1457 66.5776H108.946C109.997 66.5776 110.54 68.3297 109.788 69.0637C107.907 70.899 105.928 73.7536 105.928 77.6383C105.928 81.6481 108.037 84.6208 109.969 86.5028C110.713 87.2276 110.182 88.9049 109.143 88.9049H35.1457C31.832 88.9049 29.1457 86.2186 29.1457 82.9049V72.5776Z" fill="currentColor"/>
                            <path d="M71.1729 30.4597C71.1729 36.225 66.8957 42.9865 58.3412 42.9865C49.7867 42.9865 45.5095 36.225 45.5095 30.4597C45.5095 24.2441 49.5601 22.895 53.9506 23.0261C55.7526 23.0799 58.3412 24.4518 58.3412 24.4518C58.3412 24.4518 60.9298 23.0799 62.7318 23.0261C67.1223 22.895 71.1729 24.1962 71.1729 30.4597Z" fill="var(--bg-primary)" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M62.1373 39.2439C63.4739 38.727 66.3931 36.6989 67.3769 32.7211" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M58.6725 24.0348C56.036 24.0597 53.6247 22.2716 52.988 17.1707C55.4999 18.1498 59.591 17.691 58.6725 24.0348Z" fill="var(--bg-primary)" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M58.7155 23.9529C59.8917 22.4826 61.6561 17.938 60.1323 14.6232" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M51.2845 32.1699C50.7356 31.1412 50.5807 29.4444 51.1411 28.1398" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M22.0248 50.1057C22.0248 46.792 24.7111 44.1057 28.0248 44.1057H99.5532C99.5532 44.1057 94.0142 47.6809 93.4375 54.4374C92.8608 61.1939 99.5532 64.7221 99.5532 64.7221H28.0248C24.7111 64.7221 22.0248 62.0358 22.0248 58.7221V50.1057Z" fill="var(--bg-primary)"/>
                            <path fillRule="evenodd" clipRule="evenodd" d="M100.642 45.7835C100.641 45.7841 100.64 45.7847 100.639 45.7853L100.62 45.7985C100.594 45.8159 100.55 45.8465 100.49 45.8901C100.37 45.9774 100.187 46.1163 99.9599 46.3056C99.5043 46.6858 98.8826 47.2611 98.2445 48.0225C96.964 49.5504 95.6735 51.7572 95.4303 54.6075C95.2062 57.2327 96.3737 59.274 97.7457 60.7536C98.4291 61.4907 99.1345 62.0535 99.6696 62.4311C99.9352 62.6185 100.154 62.7567 100.3 62.8446C100.372 62.8885 100.426 62.9195 100.459 62.9376C100.475 62.9467 100.485 62.9525 100.49 62.9551L100.488 62.9543L100.487 62.9536C100.489 62.9545 100.491 62.9553 100.492 62.9562C101.301 63.3865 101.715 64.3122 101.495 65.2025C101.274 66.0951 100.473 66.7221 99.5532 66.7221H28.0248C23.6065 66.7221 20.0248 63.1404 20.0248 58.7221V50.1057C20.0248 45.6874 23.6065 42.1057 28.0248 42.1057H99.5532C100.44 42.1057 101.221 42.6897 101.472 43.5404C101.722 44.3886 101.385 45.2999 100.644 45.7819C100.643 45.7825 100.643 45.783 100.642 45.7835ZM96.8803 62.7221C98.2728 64.0471 99.5532 64.7221 99.5532 64.7221H28.0248C24.7111 64.7221 22.0248 62.0358 22.0248 58.7221V50.1057C22.0248 46.792 24.7111 44.1057 28.0248 44.1057H99.5532C99.5532 44.1057 98.5035 44.7832 97.2705 46.1057C95.6711 47.8212 93.7632 50.6221 93.4375 54.4374C93.1131 58.2385 95.0894 61.0179 96.8803 62.7221Z" fill="currentColor"/>
                            <path d="M16.8921 96.7604C16.8921 93.4467 19.5784 90.7604 22.8921 90.7604H94.4205C94.4205 90.7604 89.3969 93.9012 88.5625 100.937C87.7282 107.974 94.4205 111.377 94.4205 111.377H22.8921C19.5784 111.377 16.8921 108.69 16.8921 105.377V96.7604Z" fill="var(--bg-primary)"/>
                            <path fillRule="evenodd" clipRule="evenodd" d="M95.4857 92.4531C95.4855 92.4532 95.4859 92.453 95.4857 92.4531C95.4846 92.4538 95.4835 92.4545 95.4824 92.4552C95.4823 92.4552 95.4824 92.4551 95.4824 92.4552M92.1875 92.7604C93.3915 91.4037 94.4205 90.7604 94.4205 90.7604H22.8921C19.5784 90.7604 16.8921 93.4467 16.8921 96.7604V105.377C16.8921 108.69 19.5784 111.377 22.8921 111.377H94.4205C94.4205 111.377 93.1224 110.717 91.7409 109.377C89.9856 107.674 88.0956 104.875 88.5625 100.937C89.0192 97.0857 90.7313 94.4013 92.1875 92.7604ZM95.3285 109.595C95.3305 109.596 95.3324 109.597 95.3344 109.598C95.3353 109.598 95.3351 109.598 95.3344 109.598C96.1541 110.019 96.5804 110.946 96.3654 111.843C96.1498 112.742 95.3455 113.377 94.4205 113.377H22.8921C18.4738 113.377 14.8921 109.795 14.8921 105.377V96.7604C14.8921 92.3421 18.4738 88.7604 22.8921 88.7604H94.4205C95.3126 88.7604 96.0969 89.3513 96.3429 90.2089C96.5879 91.0626 96.2404 91.9751 95.4909 92.4498C95.4893 92.4508 95.4872 92.4521 95.4857 92.4531M95.3331 109.597C95.3291 109.595 95.3192 109.59 95.3038 109.581C95.2729 109.564 95.2204 109.535 95.1494 109.493C95.0072 109.41 94.793 109.277 94.5329 109.095C94.0088 108.729 93.3203 108.18 92.6603 107.452C91.3488 106.006 90.2196 103.947 90.5486 101.173C90.9122 98.1065 92.182 95.9092 93.3531 94.4758C93.9408 93.7565 94.5017 93.2327 94.9049 92.8959C95.1059 92.7279 95.266 92.6079 95.3681 92.5346C95.4191 92.4981 95.4555 92.4733 95.475 92.4603L95.4857 92.4531L95.4836 92.4544L95.4824 92.4552M95.3331 109.597L95.332 109.597L95.3298 109.595" fill="currentColor"/>
                            <path d="M35.1372 72.6205H81.7591" stroke="var(--bg-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M35.1372 77.7415H60.5868" stroke="var(--bg-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M76.9472 43.4194H85.234V55.6798C85.234 56.5707 84.1569 57.0169 83.5269 56.3869L81.7977 54.6577C81.4072 54.2672 80.774 54.2672 80.3835 54.6577L78.6543 56.3869C78.0243 57.0169 76.9472 56.5707 76.9472 55.6798V43.4194Z" fill="currentColor"/>
                            <path d="M21.45 95.9478H68.0719" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M21.45 101.069H46.8996" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M27.4382 49.4528H66.5749" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </div>

                </div>

                <div className="no-collections-container">
                    <svg className="empty-state-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                        <line x1="9" y1="10" x2="15" y2="10"/>
                    </svg>
                    <h3 className="empty-state-title">No journals yet</h3>
                    <p className="empty-state-description">Start building your collection by adding journals you've written.</p>
                    <div onClick={(e) => clickAddJournalCollection(e, user?.userData[0]?.id, collectionData?.collectionId)} className="btn-collection btn-collection--primary" role="button" tabIndex={0} aria-label="Add your first journal" onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') clickAddJournalCollection(e, user?.userData[0]?.id, collectionData?.collectionId) }}>
                        Add your first journal
                    </div>
                </div>
            </div>
            </>
        )
    }
    return (
        <>
        {showNotCollected &&(
            <NotCollectedJournalList onClose={clickCloseAddJournalCollection} collectionId={collectionData?.collectionId}/>
        )}


        <div ref={scrollToTop}/>
        <div className='collection-header'>
            <div onClick={(e) => handleClickBack(e)} className='back-button' role="button" tabIndex={0} aria-label="Go back" onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') handleClickBack(e) }}>
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M360-240 120-480l240-240 56 56-144 144h568v80H272l144 144-56 56Z"/></svg>
            </div>
            <p className='collections-header-text'>Browse your collections</p>
        </div>

        <div className="collection-journal-cards-container">
            <div className="add-collection-container">
                <div onClick={(e) => clickAddJournalCollection(e, user?.userData[0].id, collectionData?.collectionId)} className="btn-collection btn-collection--primary" role="button" tabIndex={0} aria-label="Add collection" onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') clickAddJournalCollection(e, user?.userData[0].id, collectionData?.collectionId) }}>
                    Add collection
                </div>
            </div>

            <div className="collection-Name-description">
                <div className="container1">
                    <div className="collection-name">
                        {collectionData?.collectionName}
                    </div>
                    <div className="collection-description-container">
                        {collectionData?.collectionDescription}
                    </div>
                </div>
                <div className="container2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="200px" height="200px" viewBox="0 0 128 128" fill="none">
                        <path d="M29.1457 72.5776C29.1457 69.2639 31.832 66.5776 35.1457 66.5776H108.946C109.997 66.5776 110.54 68.3297 109.788 69.0637C107.907 70.899 105.928 73.7536 105.928 77.6383C105.928 81.6481 108.037 84.6208 109.969 86.5028C110.713 87.2276 110.182 88.9049 109.143 88.9049H35.1457C31.832 88.9049 29.1457 86.2186 29.1457 82.9049V72.5776Z" fill="currentColor"/>
                        <path d="M71.1729 30.4597C71.1729 36.225 66.8957 42.9865 58.3412 42.9865C49.7867 42.9865 45.5095 36.225 45.5095 30.4597C45.5095 24.2441 49.5601 22.895 53.9506 23.0261C55.7526 23.0799 58.3412 24.4518 58.3412 24.4518C58.3412 24.4518 60.9298 23.0799 62.7318 23.0261C67.1223 22.895 71.1729 24.1962 71.1729 30.4597Z" fill="var(--bg-primary)" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M62.1373 39.2439C63.4739 38.727 66.3931 36.6989 67.3769 32.7211" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M58.6725 24.0348C56.036 24.0597 53.6247 22.2716 52.988 17.1707C55.4999 18.1498 59.591 17.691 58.6725 24.0348Z" fill="var(--bg-primary)" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M58.7155 23.9529C59.8917 22.4826 61.6561 17.938 60.1323 14.6232" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M51.2845 32.1699C50.7356 31.1412 50.5807 29.4444 51.1411 28.1398" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M22.0248 50.1057C22.0248 46.792 24.7111 44.1057 28.0248 44.1057H99.5532C99.5532 44.1057 94.0142 47.6809 93.4375 54.4374C92.8608 61.1939 99.5532 64.7221 99.5532 64.7221H28.0248C24.7111 64.7221 22.0248 62.0358 22.0248 58.7221V50.1057Z" fill="var(--bg-primary)"/>
                        <path fillRule="evenodd" clipRule="evenodd" d="M100.642 45.7835C100.641 45.7841 100.64 45.7847 100.639 45.7853L100.62 45.7985C100.594 45.8159 100.55 45.8465 100.49 45.8901C100.37 45.9774 100.187 46.1163 99.9599 46.3056C99.5043 46.6858 98.8826 47.2611 98.2445 48.0225C96.964 49.5504 95.6735 51.7572 95.4303 54.6075C95.2062 57.2327 96.3737 59.274 97.7457 60.7536C98.4291 61.4907 99.1345 62.0535 99.6696 62.4311C99.9352 62.6185 100.154 62.7567 100.3 62.8446C100.372 62.8885 100.426 62.9195 100.459 62.9376C100.475 62.9467 100.485 62.9525 100.49 62.9551L100.488 62.9543L100.487 62.9536C100.489 62.9545 100.491 62.9553 100.492 62.9562C101.301 63.3865 101.715 64.3122 101.495 65.2025C101.274 66.0951 100.473 66.7221 99.5532 66.7221H28.0248C23.6065 66.7221 20.0248 63.1404 20.0248 58.7221V50.1057C20.0248 45.6874 23.6065 42.1057 28.0248 42.1057H99.5532C100.44 42.1057 101.221 42.6897 101.472 43.5404C101.722 44.3886 101.385 45.2999 100.644 45.7819C100.643 45.7825 100.643 45.783 100.642 45.7835ZM96.8803 62.7221C98.2728 64.0471 99.5532 64.7221 99.5532 64.7221H28.0248C24.7111 64.7221 22.0248 62.0358 22.0248 58.7221V50.1057C22.0248 46.792 24.7111 44.1057 28.0248 44.1057H99.5532C99.5532 44.1057 98.5035 44.7832 97.2705 46.1057C95.6711 47.8212 93.7632 50.6221 93.4375 54.4374C93.1131 58.2385 95.0894 61.0179 96.8803 62.7221Z" fill="currentColor"/>
                        <path d="M16.8921 96.7604C16.8921 93.4467 19.5784 90.7604 22.8921 90.7604H94.4205C94.4205 90.7604 89.3969 93.9012 88.5625 100.937C87.7282 107.974 94.4205 111.377 94.4205 111.377H22.8921C19.5784 111.377 16.8921 108.69 16.8921 105.377V96.7604Z" fill="var(--bg-primary)"/>
                        <path fillRule="evenodd" clipRule="evenodd" d="M95.4857 92.4531C95.4855 92.4532 95.4859 92.453 95.4857 92.4531C95.4846 92.4538 95.4835 92.4545 95.4824 92.4552C95.4823 92.4552 95.4824 92.4551 95.4824 92.4552M92.1875 92.7604C93.3915 91.4037 94.4205 90.7604 94.4205 90.7604H22.8921C19.5784 90.7604 16.8921 93.4467 16.8921 96.7604V105.377C16.8921 108.69 19.5784 111.377 22.8921 111.377H94.4205C94.4205 111.377 93.1224 110.717 91.7409 109.377C89.9856 107.674 88.0956 104.875 88.5625 100.937C89.0192 97.0857 90.7313 94.4013 92.1875 92.7604ZM95.3285 109.595C95.3305 109.596 95.3324 109.597 95.3344 109.598C95.3353 109.598 95.3351 109.598 95.3344 109.598C96.1541 110.019 96.5804 110.946 96.3654 111.843C96.1498 112.742 95.3455 113.377 94.4205 113.377H22.8921C18.4738 113.377 14.8921 109.795 14.8921 105.377V96.7604C14.8921 92.3421 18.4738 88.7604 22.8921 88.7604H94.4205C95.3126 88.7604 96.0969 89.3513 96.3429 90.2089C96.5879 91.0626 96.2404 91.9751 95.4909 92.4498C95.4893 92.4508 95.4872 92.4521 95.4857 92.4531M95.3331 109.597C95.3291 109.595 95.3192 109.59 95.3038 109.581C95.2729 109.564 95.2204 109.535 95.1494 109.493C95.0072 109.41 94.793 109.277 94.5329 109.095C94.0088 108.729 93.3203 108.18 92.6603 107.452C91.3488 106.006 90.2196 103.947 90.5486 101.173C90.9122 98.1065 92.182 95.9092 93.3531 94.4758C93.9408 93.7565 94.5017 93.2327 94.9049 92.8959C95.1059 92.7279 95.266 92.6079 95.3681 92.5346C95.4191 92.4981 95.4555 92.4733 95.475 92.4603L95.4857 92.4531L95.4836 92.4544L95.4824 92.4552M95.3331 109.597L95.332 109.597L95.3298 109.595" fill="currentColor"/>
                        <path d="M35.1372 72.6205H81.7591" stroke="var(--bg-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M35.1372 77.7415H60.5868" stroke="var(--bg-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M76.9472 43.4194H85.234V55.6798C85.234 56.5707 84.1569 57.0169 83.5269 56.3869L81.7977 54.6577C81.4072 54.2672 80.774 54.2672 80.3835 54.6577L78.6543 56.3869C78.0243 57.0169 76.9472 56.5707 76.9472 55.6798V43.4194Z" fill="currentColor"/>
                        <path d="M21.45 95.9478H68.0719" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M21.45 101.069H46.8996" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M27.4382 49.4528H66.5749" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </div>

            </div>

            <div className="collection-journal-cards">
            {journals.map((journal) =>{
                const parseContent = ParseContent(journal.journals.content)

                return(
                    <div onClick={(e) => viewContent(e, journal?.journals.content, parseContent?.wholeText, journal?.journals.title, journal?.journals?.users?.id, journal?.journals?.users?.name, journal?.journals?.users?.image_url, journal?.journals.created_at, journal?.journals.id, journal.hasLiked, journal?.journals?.comments[0]?.count, journal?.hasBookMarked, journal?.journals.likes[0]?.count, journal?.journals?.bookmarks[0]?.count)} key={journal.journals?.id} className="collections">
                        <div className="journal-collection-image-container">
                            <img className="journal-collection-image" src={parseContent?.firstImage?.src || "/assets/no-image.png"} alt={journal?.journals?.title ? `${journal.journals.title} cover image` : "Collection post cover image"} onError={handleImageFallback} />
                        </div>
                        <div className="collections-title text-truncate">
                            {journal.journals?.title}
                        </div>
                        <div className="collections-text text-truncate-2">
                            {parseContent?.wholeText}
                        </div>
                    </div>
                    )
                })}
                <div className="inview-container" ref={ref}/>
            </div>

        </div>

        </>
    )
}
export default CollectionJournals;
