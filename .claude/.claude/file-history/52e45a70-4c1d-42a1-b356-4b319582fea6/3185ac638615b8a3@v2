import './profilepostcards.css';
import { createPortal } from 'react-dom';
import { useAuth } from '../../../../Context/useAuth';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { deleteJournal, deleteJournalImage, getUserJournals } from '../../../../../API/Api';
import { useEffect, useCallback } from 'react';
import { FadeLoader, MoonLoader } from 'react-spinners';
import ParseContent from '../parseData';
import { useInView } from 'react-intersection-observer';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { handleCLickContent } from '../../../../../helpers/handleClicks';
import { useNavigate } from 'react-router-dom';
import EditJournal from './editJournal';
import { useAddViewsMutation, useUpdateJournalPrivacyMutation } from '../../../../utils/useMutation';
import VerifiedBadge from '../../../Badge/VerifiedBadge';
import { handleImageFallback } from '../../../../utils/handleImageFallback';
import { getCanvasPreview } from '../../../../utils/canvasDoc';
import CanvasPreview from '../CanvasPreview/CanvasPreview';

const ProfilePostCards = () =>{
    const queryClient = useQueryClient();
    const {user, session}= useAuth();
    const navigate = useNavigate();

    const [showEditor, setShowEditor] = useState(null);

    const {ref, inView} = useInView({
        threshold: 0.2
    })

    const settingsList = [
        {
            label: 'Delete journal',
            className: 'delete-button',
            actionDelete: (e, journalId) => handleClickDeleteJournal(e, journalId),
            icon:
            <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" fill="none">
                <path d="M10 12V17" stroke="rgb(255, 48, 48)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 12V17" stroke="rgb(255, 48, 48)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4 7H20" stroke="rgb(255, 48, 48)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M6 10V18C6 19.6569 7.34315 21 9 21H15C16.6569 21 18 19.6569 18 18V10" stroke="rgb(255, 48, 48)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5V7H9V5Z" stroke="rgb(255, 48, 48)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
        },
        {
            label: 'Edit journal',
            className: 'edit-button',
            actionEdit: (e, journalContent, journalId, journalTitle) => handleClickEdit(e, journalContent, journalId, journalTitle), // still in progress
            icon: 
            <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" fill="none">
                <path d="M18.3785 8.44975L11.4637 15.3647C11.1845 15.6439 10.8289 15.8342 10.4417 15.9117L7.49994 16.5L8.08829 13.5582C8.16572 13.1711 8.35603 12.8155 8.63522 12.5363L15.5501 5.62132M18.3785 8.44975L19.7927 7.03553C20.1832 6.64501 20.1832 6.01184 19.7927 5.62132L18.3785 4.20711C17.988 3.81658 17.3548 3.81658 16.9643 4.20711L15.5501 5.62132M18.3785 8.44975L15.5501 5.62132" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 20H19" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
        },
        {
            label: 'Only me',
            className: 'only-me-bttn',
            actionOnlyMe: (e, privacy, journalId) => {handleEditJournalPrivacy(e, privacy, journalId)},
            icon: 
            <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 16 16" fill="none">
                <g fill="#000000">
                    <path fillRule="evenodd" d="M5.58 7C5.835 5.124 6.667 3.335 8 1.836a10.074 10.074 0 011.806 2.878.75.75 0 101.388-.568 11.412 11.412 0 00-1.322-2.372A6.503 6.503 0 0114.5 8 .75.75 0 0016 8a8 8 0 10-11.31 7.285.75.75 0 10.622-1.365A6.504 6.504 0 011.519 8.5h2.503c.04.563.122 1.12.248 1.668a.75.75 0 101.462-.336c-.1-.438-.17-.883-.205-1.332H7A.75.75 0 007 7H5.58zM4.07 7H1.576a6.508 6.508 0 014.552-5.226A11.095 11.095 0 004.068 7z" clipRule="evenodd"/>
                    <path d="M11.75 12.25a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0v-.5z"/>
                    <path fillRule="evenodd" d="M8.518 9.012c.035-.627.13-1.235.366-1.738.174-.37.435-.704.816-.94C10.08 6.101 10.52 6 11 6c.48 0 .921.1 1.3.334.381.236.642.57.816.94.236.503.331 1.111.366 1.738A2.25 2.25 0 0115.5 11.25v2.5A2.25 2.25 0 0113.25 16h-4.5a2.25 2.25 0 01-2.25-2.25v-2.5a2.25 2.25 0 012.018-2.238zM10.022 9c.032-.481.102-.838.22-1.087a.662.662 0 01.245-.302c.09-.055.243-.111.513-.111s.423.056.513.111c.087.054.17.141.246.302.117.249.187.606.219 1.087h-1.956zm3.228 1.5a.75.75 0 01.75.75v2.5a.75.75 0 01-.75.75h-4.5a.75.75 0 01-.75-.75v-2.5a.75.75 0 01.75-.75h4.5z" clipRule="evenodd"/>
                </g>
            </svg>
        },
        {
            label: 'public',
            className: 'public-post-bttn',
            actionPublic: (e, privacy, journalId) => {handleEditJournalPrivacy(e, privacy, journalId)},
            icon:
            <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 16 16" fill="none"><path fill="#000000" fillRule="evenodd" d="M8 0a8 8 0 100 16A8 8 0 008 0zM6.128 1.774A6.508 6.508 0 001.576 7H4.07a11.095 11.095 0 012.06-5.226zm3.744 0A11.096 11.096 0 0111.932 7h2.492a6.508 6.508 0 00-4.552-5.226zM10.42 7C10.165 5.124 9.333 3.335 8 1.836 6.667 3.335 5.835 5.124 5.58 7h4.84zM5.527 8.5h4.946C10.31 10.557 9.451 12.533 8 14.164 6.55 12.533 5.691 10.557 5.527 8.5zm-1.505 0H1.52a6.505 6.505 0 004.61 5.726C4.896 12.525 4.163 10.555 4.021 8.5zm5.85 5.726c1.231-1.701 1.964-3.671 2.106-5.726h2.503a6.505 6.505 0 01-4.61 5.726z" clipRule="evenodd"/></svg>
        }
    ]

    const [showSettings, setShowSettings] = useState(null);
    const [showConfirmationBttn, setShowConfirmationBttn] = useState(null);
    const [journalData, setJournalData] = useState(null);
    const [isDeletingJournal, setIsDeletingJournal] = useState(false);
    const [journalIsDeleted, setJournalIsDeleted] = useState(false);
    const [viewMode, setViewMode] = useState('grid');
    
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

    
    const clickContent = handleCLickContent(navigate);
    const mutateViews = useAddViewsMutation(session);
    const viewContent = (e, jsonbContent,wholeText, title, userId, name, avatar, created_at, journalId, isLiked, commentsCount, isBookmarked, likesCount, bookmarksCount, badge, postType = null, canvasDoc = null) => {
        const formadata = new FormData();

        formadata.append('journalId', journalId);
        mutateViews.mutate(formadata);
        clickContent(e, jsonbContent,wholeText, title, userId, name, avatar, created_at, journalId, isLiked, commentsCount, isBookmarked, likesCount, bookmarksCount, badge, postType, canvasDoc)
    }

    const mutatePrivacy = useUpdateJournalPrivacyMutation(session);
    const handleEditJournalPrivacy = (e, privacy, journalId) =>{
        e.stopPropagation();
        const onlyme = privacy === 'public' ? 'private' : 'public'
        const formdata = new FormData();

        formdata.append('journalId', journalId);
        formdata.append('privacy', onlyme);
        mutatePrivacy.mutate(formdata);    
    }

    const handleClickSettings = (e, journalId) =>{
        e.stopPropagation();
        setShowSettings(showSettings === journalId ? null : journalId)
    }

    const handleClickDeleteJournal = (e, journalId) =>{
        e.stopPropagation();
        setShowConfirmationBttn(showConfirmationBttn === journalId ? null : journalId)
        setShowSettings(null)
    }

    const handleConfirmDeleteJournal = async(e, journalId, token, image_url) =>{
        e.stopPropagation();

        const imageUrlArray = [image_url];
        const queryKey = ['userJournals', user?.userData?.[0].id];
        let previousUserJournals = null;
        // console.log({
        //     journalId: journalId,
        //     image_url: imageUrlArray,
        //     token: token
        // })

        try {
            setIsDeletingJournal(true);
            previousUserJournals = queryClient.getQueryData(queryKey);

            queryClient.setQueryData(queryKey, (old) => {
                if (!old || !Array.isArray(old.pages)) return old;

                return {
                    ...old,
                    pages: old.pages.map((page) => ({
                        ...page,
                        data: Array.isArray(page?.data)
                            ? page.data.filter((journal) => journal?.id !== journalId)
                            : page?.data
                    }))
                };
            });

            const deleteJournalPromise = deleteJournal(journalId, token,)
            const deleteImageJournalPromise = image_url ? deleteJournalImage(token, imageUrlArray) : Promise.resolve(null);

            const [deletePostJournal, deletePostJournalImage] = await Promise.allSettled([
                deleteJournalPromise,
                deleteImageJournalPromise,
            ])
            if(deletePostJournal || deletePostJournalImage){
                console.log({deletePostJournal: deletePostJournal, deletePostJournalImage: deletePostJournalImage})
            }

            if(deletePostJournal.status !== 'fulfilled'){
                queryClient.setQueryData(queryKey, previousUserJournals);
                throw deletePostJournal.reason || new Error('failed to delete journal');
            }

            setJournalIsDeleted(true)
            queryClient.invalidateQueries({ queryKey: queryKey });
            queryClient.invalidateQueries({ queryKey: ['journals'] });
            queryClient.invalidateQueries({ queryKey: ['visitedProfileJournals'] });

            setTimeout(() =>{
                setIsDeletingJournal(false)
                setJournalIsDeleted(false)
                setShowConfirmationBttn(null)
            }, 1500)

        } catch (error) {
            if(previousUserJournals){
                queryClient.setQueryData(queryKey, previousUserJournals);
            }
            console.error("Error deleting journal:", error);
            setIsDeletingJournal(false);
        }
    }

    const handleClickEdit = (e, journalContent, journalId, journalTitle) =>{
        e.stopPropagation();
        setShowSettings(null)
        const data = {
            content: journalContent,
            id: journalId,
            title: journalTitle
        }
        setJournalData(data);
        setShowEditor(showEditor === journalId ? null : journalId);
    }

    const handleClickCloseEditor = () => {
        setShowEditor(null)
    }

    useEffect(() =>{
        console.log(data)
    }, [data])

    useEffect(() =>{
        const handleClickOutsideSettings = (e) => {
            e.stopPropagation();
            if(showSettings !== null && !e.target.closest('.user-post-settings')){
                setShowSettings(null)
            }
        }
        
        document.addEventListener('click', handleClickOutsideSettings);

        return () => {
            document.removeEventListener('click', handleClickOutsideSettings)
        }
    }, [showSettings])


    const isLoadingMore = isFetchingNextPage || !hasNextPage
    useEffect(() =>{
        if(inView && !isLoadingMore){
            fetchNextPage();
        }
    }, [fetchNextPage, isLoadingMore, inView])

    const handleToggleView = useCallback(() => {
        setViewMode((prev) => (prev === 'list' ? 'grid' : 'list'));
    }, []);


    const journals = data?.pages.flatMap((page) => page.data) || [];
    if(isLoading){
        return(
            <>
            <div className='profile-postcards-loading-container'>
                <MoonLoader loading={isLoading} color="var(--loader-color)" size={20} speedMultiplier={0.5}/>
            </div>
            </>
        )
    }
    if(data && journals?.length === 0){
        return(
            <div className='profile-postcards-loading-container'>
                No post available!
            </div>
        )
    }
    return(
        <>
        <div className='profile-postcards-parent-container'>
            <div className="postcards-header-row">
                <h2 className="postcards-heading">
                    Posts <span className="postcards-count">({journals.length})</span>
                </h2>
                <div className="postcards-header-actions">
                    <button
                        className={`postcards-view-toggle-btn ${viewMode === 'grid' ? 'is-active' : ''}`}
                        onClick={handleToggleView}
                        title={viewMode === 'grid' ? 'Switch to list' : 'Switch to grid'}
                    >
                        {viewMode === 'grid' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M120-520v-320h320v320H120Zm0 400v-320h320v320H120Zm400-400v-320h320v320H520Zm0 400v-320h320v320H520Z"/></svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M120-200v-560h720v560H120Z"/></svg>
                        )}
                    </button>
                </div>
            </div>

            {viewMode === 'grid' ? (
                <div className="postcards-grid-view">
                    {journals.map((journal) => {
                        const isCanvasPost = journal?.post_type === 'canvas';
                        const parsedContent = ParseContent(journal?.content);
                        const canvasPreview = isCanvasPost ? getCanvasPreview(journal?.canvas_doc) : null;
                        const wholeText = isCanvasPost ? canvasPreview?.wholeText || '' : parsedContent?.wholeText || '';
                        const previewText = isCanvasPost ? canvasPreview?.slicedText || '' : parsedContent?.slicedText || '';
                        const thumbnail = isCanvasPost ? null : parsedContent?.firstImage?.src;
                        return (
                            <motion.div
                                key={journal.id}
                                className={`postcards-grid-item${isCanvasPost ? ' is-canvas-card' : ''}`}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.25, ease: 'easeOut' }}
                                onClick={(e) => viewContent(e, journal.content, wholeText, journal.title, journal.users.id, journal.users.name, journal.users.image_url, journal.created_at, journal.id, journal.has_liked, journal.comment_count?.[0].count, journal.has_bookmarked, journal.like_count?.[0].count, journal.bookmark_count?.[0].count, journal.users.badge, journal?.post_type, journal?.canvas_doc)}
                            >
                                {showConfirmationBttn === journal.id && (
                                    <AnimatePresence>
                                    <div className="confirmation-delete-bg">
                                        {journalIsDeleted && (
                                            <motion.div
                                                className='journal-is-deleted-message-container'
                                                initial={{opacity: 0, scale: 0}}
                                                animate={{opacity: 1, scale: 1, transition:{type: 'tween', duration: 0.1}}}
                                                exit={{y: -900, opacity: 0, transition:{type:'tween', duration: 0.5, ease: 'easeOut'}}}
                                            >
                                                Journal deleted successfuly!
                                                <svg xmlns="http://www.w3.org/2000/svg" height="44px" viewBox="0 -960 960 960" width="44px" fill="#00d61dff"><path d="M268-240 42-466l57-56 170 170 56 56-57 56Zm226 0L268-466l56-57 170 170 368-368 56 57-424 424Zm0-226-57-56 198-198 57 56-198 198Z"/></svg>
                                            </motion.div>
                                        )}

                                        {isDeletingJournal && (
                                            <div className='delete-journal-loader-container'>
                                                <FadeLoader loading={isDeletingJournal} speedMultiplier={2}/>
                                                <p style={{margin: '0', padding: '0', fontWeight: 760}}>Deleting the journal...</p>
                                            </div>
                                        )}

                                        <motion.div
                                            className="confirmation-delete-container"
                                            initial={{opacity:0 ,scale:0}}
                                            animate={{opacity:1, scale:1, transition: {type: "tween", duration: 0.1}}}
                                            exit={{opacity:0, scale:0, transition: {type: "tween", duration: 0.1}}}
                                        >
                                            <div className="confirmation-delete-heading">
                                                Do you want to delete the journal?
                                            </div>
                                            <div className="confirm-buttons-container">
                                                <div onClick={(e) => handleConfirmDeleteJournal(e, journal.id, session?.access_token, parsedContent?.firstImage?.src)} className="confirm-buttons-yes">Yes</div>
                                                <div onClick={() => setShowConfirmationBttn(null)} className="confirm-buttons-cancel">Cancel</div>
                                            </div>
                                        </motion.div>
                                    </div>
                                    </AnimatePresence>
                                )}

                                {isCanvasPost ? (
                                    <div className="postcards-grid-img-wrap">
                                        <CanvasPreview canvasDoc={journal?.canvas_doc} />
                                    </div>
                                ) : thumbnail ? (
                                    <div className="postcards-grid-img-wrap">
                                        <img className="postcards-grid-thumb" src={thumbnail} alt={journal?.title ? `${journal.title} cover image` : "Post cover image"} loading="lazy" onError={handleImageFallback} />
                                    </div>
                                ) : null}
                                <div className="postcards-grid-body">
                                    <h3 className="postcards-grid-title">{journal.title.length > 32 ? `${journal.title.substring(0, 32)}...` : journal.title}</h3>
                                    {previewText && (
                                        <p className="postcards-grid-snippet">{previewText.length > 50 ? `${previewText.substring(0, 50)}...` : previewText}</p>
                                    )}
                                    <div className="postcards-grid-body-footer">
                                        <div className="user-post-privacy">
                                            {journal.privacy === 'public' && (
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14px" height="14px" viewBox="0 0 16 16" fill="none"><path fill="currentColor" fillRule="evenodd" d="M8 0a8 8 0 100 16A8 8 0 008 0zM6.128 1.774A6.508 6.508 0 001.576 7H4.07a11.095 11.095 0 012.06-5.226zm3.744 0A11.096 11.096 0 0111.932 7h2.492a6.508 6.508 0 00-4.552-5.226zM10.42 7C10.165 5.124 9.333 3.335 8 1.836 6.667 3.335 5.835 5.124 5.58 7h4.84zM5.527 8.5h4.946C10.31 10.557 9.451 12.533 8 14.164 6.55 12.533 5.691 10.557 5.527 8.5zm-1.505 0H1.52a6.505 6.505 0 004.61 5.726C4.896 12.525 4.163 10.555 4.021 8.5zm5.85 5.726c1.231-1.701 1.964-3.671 2.106-5.726h2.503a6.505 6.505 0 01-4.61 5.726z" clipRule="evenodd"/></svg>
                                            )}
                                            {journal.privacy === 'private' && (
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14px" height="14px" viewBox="0 0 24 24" fill="none">
                                                    <path d="M7 10.0288C7.47142 10 8.05259 10 8.8 10H15.2C15.9474 10 16.5286 10 17 10.0288M7 10.0288C6.41168 10.0647 5.99429 10.1455 5.63803 10.327C5.07354 10.6146 4.6146 11.0735 4.32698 11.638C4 12.2798 4 13.1198 4 14.8V16.2C4 17.8802 4 18.7202 4.32698 19.362C4.6146 19.9265 5.07354 20.3854 5.63803 20.673C6.27976 21 7.11984 21 8.8 21H15.2C16.8802 21 17.7202 21 18.362 20.673C18.9265 20.3854 19.3854 19.9265 19.673 19.362C20 18.7202 20 17.8802 20 16.2V14.8C20 13.1198 20 12.2798 19.673 11.638C19.3854 11.0735 18.9265 10.6146 18.362 10.327C18.0057 10.1455 17.5883 10.0647 17 10.0288M7 10.0288V8C7 5.23858 9.23858 3 12 3C14.7614 3 17 5.23858 17 8V10.0288" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                </svg>
                                            )}
                                        </div>
                                        <div className="user-post-settings">
                                            <svg onClick={(e) => handleClickSettings(e, journal.id)} xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M240-400q-33 0-56.5-23.5T160-480q0-33 23.5-56.5T240-560q33 0 56.5 23.5T320-480q0 33-23.5 56.5T240-400Zm240 0q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm240 0q-33 0-56.5-23.5T640-480q0-33 23.5-56.5T720-560q33 0 56.5 23.5T800-480q0 33-23.5 56.5T720-400Z"/></svg>
                                        </div>
                                    </div>
                                </div>

                                {showSettings === journal.id && (
                                    <AnimatePresence>
                                        <motion.div
                                            initial={{opacity:0, scale:0, x: "-50%", y: "-50%"}}
                                            animate={{opacity:1, scale:1, x: "-50%", y: "-50%", transition: {type: "tween", duration: 0.1}}}
                                            exit={{opacity:0, scale:0, x: "-50%", y: "-50%", transition: {type: "tween", duration: 0.1}}}
                                            className='post-settings-container'
                                        >
                                            {settingsList.map((setting, index) => (
                                                <div className='setting-buttons' key={index}>
                                                    {setting.actionDelete && (
                                                        <div className={setting.className} onClick={(e) => setting.actionDelete(e, journal.id)}>
                                                            {setting.icon}
                                                            {setting.label}
                                                        </div>
                                                    )}
                                                    {setting.actionEdit && journal?.post_type !== 'canvas' && (
                                                        <div className={setting.className} onClick={(e) => setting.actionEdit(e, journal.content, journal.id, journal.title)}>
                                                            {setting.icon}
                                                            {setting.label}
                                                        </div>
                                                    )}
                                                    {journal.privacy === 'public' && setting.actionOnlyMe && (
                                                        <div onClick={(e) => setting.actionOnlyMe(e, journal.privacy, journal.id)} className={setting.className}>
                                                            {setting.icon}
                                                            {setting.label}
                                                        </div>
                                                    )}
                                                    {journal.privacy === 'private' && setting.actionPublic && (
                                                        <div onClick={(e) => {setting.actionPublic(e, journal.privacy, journal.id)}} className={setting.className}>
                                                            {setting.icon}
                                                            {setting.label}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </motion.div>
                                    </AnimatePresence>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            ) : (
            <div className="postcards-list-view">
            {journals.map((journal, index) => {
                const isCanvasPost = journal?.post_type === 'canvas';
                const parsedContent =  ParseContent(journal?.content);
                const canvasPreview = isCanvasPost ? getCanvasPreview(journal?.canvas_doc) : null;
                const wholeText = isCanvasPost ? canvasPreview?.wholeText || '' : parsedContent?.wholeText || '';
                const previewText = isCanvasPost ? canvasPreview?.slicedText || '' : parsedContent?.slicedText || '';
                const thumbnail = isCanvasPost ? null : parsedContent?.firstImage?.src;
                return (
                    <motion.div
                        key={journal.id}
                        className='profile-postcards-child-container'
                        initial={{opacity: 0, y: 12}}
                        animate={{opacity: 1, y: 0}}
                        transition={{duration: 0.3, ease: 'easeOut'}}
                    >

                        <div className={`profile-postcards${isCanvasPost ? ' is-canvas-card' : ''}`}>

                            {isCanvasPost && (
                                <CanvasPreview canvasDoc={journal?.canvas_doc} />
                            )}

                            {showConfirmationBttn === journal.id && (
                                <AnimatePresence>
                                <div className="confirmation-delete-bg">

                                    {journalIsDeleted && (
                                            <motion.div
                                            className='journal-is-deleted-message-container'
                                            initial={{opacity: 0, scale: 0}}
                                            animate={{opacity: 1, scale: 1, transition:{type: 'tween', duration: 0.1}}}
                                            exit={{y: -900, opacity: 0, transition:{type:'tween', duration: 0.5, ease: 'easeOut'}}}
                                            >
                                                Journal deleted successfuly!
                                                <svg xmlns="http://www.w3.org/2000/svg" height="44px" viewBox="0 -960 960 960" width="44px" fill="#00d61dff"><path d="M268-240 42-466l57-56 170 170 56 56-57 56Zm226 0L268-466l56-57 170 170 368-368 56 57-424 424Zm0-226-57-56 198-198 57 56-198 198Z"/></svg>
                                            </motion.div>
                                    )}

                                    {isDeletingJournal && (
                                        <div className='delete-journal-loader-container'>
                                            <FadeLoader loading={isDeletingJournal} speedMultiplier={2}/>
                                            <p style={{margin: '0', padding: '0', fontWeight: 760}}>Deleting the journal...</p>
                                        </div>
                                    )}

                                        <motion.div
                                        className="confirmation-delete-container"
                                        initial={{opacity:0 ,scale:0}}
                                        animate={{opacity:1, scale:1, transition: {type: "tween", duration: 0.1}}}
                                        exit={{opacity:0, scale:0, transition: {type: "tween", duration: 0.1}}}
                                        >
                                            <div className="confirmation-delete-heading">
                                                Do you want to delete the journal?
                                            </div>
                                            <div className="confirm-buttons-container">
                                                <div onClick={(e) => handleConfirmDeleteJournal(e, journal.id, session?.access_token, parsedContent?.firstImage?.src)} className="confirm-buttons-yes">Yes</div>
                                                <div onClick={() => setShowConfirmationBttn(null)} className="confirm-buttons-cancel">Cancel</div>
                                            </div>
                                        </motion.div>

                                </div>
                                </AnimatePresence>
                            )}

                            {thumbnail && (
                                <img
                                    className="card-image-banner"
                                    src={thumbnail}
                                    alt={journal?.title ? `${journal.title} cover image` : "Post cover image"}
                                    loading="lazy"
                                    onError={handleImageFallback}
                                    onClick={(e) => viewContent(e, journal.content, wholeText, journal.title, journal.users.id, journal.users.name, journal.users.image_url, journal.created_at, journal.id, journal.has_liked, journal.comment_count?.[0].count, journal.has_bookmarked, journal.like_count?.[0].count, journal.bookmark_count?.[0].count, journal.users.badge, journal?.post_type, journal?.canvas_doc)}
                                />
                            )}

                            <div className='user-profile-card-content'>
                                <div onClick={(e) => viewContent(
                                    e,
                                    journal.content,
                                    wholeText,
                                    journal.title,
                                    journal.users.id,
                                    journal.users.name,
                                    journal.users.image_url,
                                    journal.created_at,
                                    journal.id,
                                    journal.has_liked,
                                    journal.comment_count?.[0].count,
                                    journal.has_bookmarked,
                                    journal.like_count?.[0].count,
                                    journal.bookmark_count?.[0].count,
                                    journal.users.badge,
                                    journal?.post_type,
                                    journal?.canvas_doc
                                )}
                                    className="content-container">

                                    <div className='feed-text-content-container'>
                                        <div className='feed-title-content'>
                                            <h2 className="feed-title-profile-page">{journal.title.length > 55 ? `${journal.title.substring(0, 55)}...` : journal.title}</h2>
                                        </div>
                                        <p className="feed-text-content-profile-page">{previewText}</p>
                                    </div>
                                </div>

                                <div className="card-icons-container">
                                    <div className='user-info-child-container'>
                                        <div className={`user-avatar-container ${user?.userData?.[0]?.badge === 'legend' ? 'avatar-ring-legend' : user?.userData?.[0]?.badge === 'og' ? 'avatar-ring-og' : ''}`}>
                                            <img src={user?.userData?.[0].image_url || '/assets/profile.jpg'} alt="user-profile" loading='lazy' className="user-info-avatar" />
                                        </div>
                                        <div className="user-name-container">
                                            <p className="user-newsfeed-name-profile-page">{user?.userData?.[0].name}</p>
                                            <VerifiedBadge badge={user?.userData?.[0]?.badge} size={14} />
                                        </div>
                                        <div className="name-info-separator">•</div>
                                        <p className="user-post-date">{new Date(journal.created_at).toLocaleDateString('en-US', {
                                            month: 'long',
                                            day: 'numeric',
                                            year: 'numeric'
                                        })}
                                        </p>
                                        <div className="name-info-separator">•</div>
                                        <div className="user-post-privacy">
                                            {journal.privacy === 'public' &&(
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14px" height="14px" viewBox="0 0 16 16" fill="none"><path fill="currentColor" fillRule="evenodd" d="M8 0a8 8 0 100 16A8 8 0 008 0zM6.128 1.774A6.508 6.508 0 001.576 7H4.07a11.095 11.095 0 012.06-5.226zm3.744 0A11.096 11.096 0 0111.932 7h2.492a6.508 6.508 0 00-4.552-5.226zM10.42 7C10.165 5.124 9.333 3.335 8 1.836 6.667 3.335 5.835 5.124 5.58 7h4.84zM5.527 8.5h4.946C10.31 10.557 9.451 12.533 8 14.164 6.55 12.533 5.691 10.557 5.527 8.5zm-1.505 0H1.52a6.505 6.505 0 004.61 5.726C4.896 12.525 4.163 10.555 4.021 8.5zm5.85 5.726c1.231-1.701 1.964-3.671 2.106-5.726h2.503a6.505 6.505 0 01-4.61 5.726z" clipRule="evenodd"/></svg>
                                            )}
                                            {journal.privacy === 'private' &&(
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14px" height="14px" viewBox="0 0 24 24" fill="none">
                                                    <path d="M7 10.0288C7.47142 10 8.05259 10 8.8 10H15.2C15.9474 10 16.5286 10 17 10.0288M7 10.0288C6.41168 10.0647 5.99429 10.1455 5.63803 10.327C5.07354 10.6146 4.6146 11.0735 4.32698 11.638C4 12.2798 4 13.1198 4 14.8V16.2C4 17.8802 4 18.7202 4.32698 19.362C4.6146 19.9265 5.07354 20.3854 5.63803 20.673C6.27976 21 7.11984 21 8.8 21H15.2C16.8802 21 17.7202 21 18.362 20.673C18.9265 20.3854 19.3854 19.9265 19.673 19.362C20 18.7202 20 17.8802 20 16.2V14.8C20 13.1198 20 12.2798 19.673 11.638C19.3854 11.0735 18.9265 10.6146 18.362 10.327C18.0057 10.1455 17.5883 10.0647 17 10.0288M7 10.0288V8C7 5.23858 9.23858 3 12 3C14.7614 3 17 5.23858 17 8V10.0288" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                </svg>
                                            )}
                                        </div>

                                        <div className="user-post-settings">
                                        <svg onClick={(e) => handleClickSettings(e, journal.id)}  xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M240-400q-33 0-56.5-23.5T160-480q0-33 23.5-56.5T240-560q33 0 56.5 23.5T320-480q0 33-23.5 56.5T240-400Zm240 0q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm240 0q-33 0-56.5-23.5T640-480q0-33 23.5-56.5T720-560q33 0 56.5 23.5T800-480q0 33-23.5 56.5T720-400Z"/></svg>
                                    </div>
                                </div>

                            </div>

                            {showSettings === journal.id && (
                                <AnimatePresence>
                                    <motion.div
                                    initial={{opacity:0 ,scale:0}}
                                    animate={{opacity:1, scale:1, transition: {type: "tween", duration: 0.1}}}
                                    exit={{opacity:0, scale:0, transition: {type: "tween", duration: 0.1}}}
                                    className='post-settings-container'
                                    >
                                        {settingsList.map((setting, index) => (
                                            <div className='setting-buttons' key={index}>
                                                {setting.actionDelete && (
                                                    <div className={setting.className} onClick={(e) => setting.actionDelete(e, journal.id)}>
                                                        {setting.icon}
                                                        {setting.label}
                                                    </div>
                                                )}

                                                {setting.actionEdit && journal?.post_type !== 'canvas' &&(
                                                    <div className={setting.className} onClick={(e) => setting.actionEdit(e, journal.content, journal.id, journal.title)}>
                                                        {setting.icon}
                                                        {setting.label}
                                                    </div>
                                                )}
                                                {journal.privacy === 'public' && setting.actionOnlyMe &&(
                                                    <div onClick={(e) => setting.actionOnlyMe(e, journal.privacy, journal.id)} className={setting.className}>
                                                        {setting.icon}
                                                        {setting.label}
                                                    </div>
                                                )}

                                                {journal.privacy === 'private' && setting.actionPublic &&(
                                                    <div onClick={(e) => {setting.actionPublic(e, journal.privacy, journal.id)}} className={setting.className}>
                                                        {setting.icon}
                                                        {setting.label}
                                                    </div>
                                                )}
                                            </div>
                                                ))}
                                </motion.div>
                            </AnimatePresence>
                            )}

                        </div>
                    </div>

            </motion.div>
            )

        })}

            </div>
            )}

            <div ref={ref} className='in-view-container'>
                {isFetchingNextPage && (
                    <MoonLoader loading={isFetchingNextPage} color="var(--loader-color)" size={20}/>
                )}
            </div>
        </div>

        {showEditor !== null && createPortal(
            <AnimatePresence>
                <EditJournal journalData={journalData ?? {}} onClose={handleClickCloseEditor} />
            </AnimatePresence>,
            document.querySelector('.profile-parent-container') || document.body
        )}
        </>
    )
}

export default ProfilePostCards;
