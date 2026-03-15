import ParseContent from '../HomePage/postCards/parseData';
import { deleteCollection, getCollections } from '../../../API/Api';
import { useAuth } from '../../Context/useAuth';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { FadeLoader, MoonLoader } from 'react-spinners';
import formatPostDate from '../../../helpers/formatDateString';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useUpdateCollectionPrivacyMutation } from '../../utils/useMutation';

const GradientHeaderIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#ffffff' }}>
        <path d="M18,2 C19.3807,2 20.5,3.11929 20.5,4.5 L20.5,18.75 C20.5,19.1642 20.1642,19.5 19.75,19.5 L5.5,19.5 C5.5,20.0523 5.94772,20.5 6.5,20.5 L19.75,20.5 C20.1642,20.5 20.5,20.8358 20.5,21.25 C20.5,21.6642 20.1642,22 19.75,22 L6.5,22 C5.11929,22 4,20.8807 4,19.5 L4,4.5 C4,3.11929 5.11929,2 6.5,2 L18,2 Z"/>
    </svg>
);

const CollectionCards = () =>{
    const {user, session} = useAuth();
    const {ref, inView} = useInView({threshold: 0.2})
    const queryClient = useQueryClient();

    const [settingId, setSettingId] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDeleted, setIsDeleted] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState('');

    const [showUpdatePrivacyMessageId, setShowUpdatePrivacyMessageId] = useState('');

    const navigate = useNavigate();

    const settingsList = [
            {
                icon:
                <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 16 16" fill="none">
                    <g fill="currentColor">
                        <path fillRule="evenodd" d="M5.58 7C5.835 5.124 6.667 3.335 8 1.836a10.074 10.074 0 011.806 2.878.75.75 0 101.388-.568 11.412 11.412 0 00-1.322-2.372A6.503 6.503 0 0114.5 8 .75.75 0 0016 8a8 8 0 10-11.31 7.285.75.75 0 10.622-1.365A6.504 6.504 0 011.519 8.5h2.503c.04.563.122 1.12.248 1.668a.75.75 0 101.462-.336c-.1-.438-.17-.883-.205-1.332H7A.75.75 0 007 7H5.58zM4.07 7H1.576a6.508 6.508 0 014.552-5.226A11.095 11.095 0 004.068 7z" clipRule="evenodd"/>
                        <path d="M11.75 12.25a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0v-.5z"/>
                        <path fillRule="evenodd" d="M8.518 9.012c.035-.627.13-1.235.366-1.738.174-.37.435-.704.816-.94C10.08 6.101 10.52 6 11 6c.48 0 .921.1 1.3.334.381.236.642.57.816.94.236.503.331 1.111.366 1.738A2.25 2.25 0 0115.5 11.25v2.5A2.25 2.25 0 0113.25 16h-4.5a2.25 2.25 0 01-2.25-2.25v-2.5a2.25 2.25 0 012.018-2.238zM10.022 9c.032-.481.102-.838.22-1.087a.662.662 0 01.245-.302c.09-.055.243-.111.513-.111s.423.056.513.111c.087.054.17.141.246.302.117.249.187.606.219 1.087h-1.956zm3.228 1.5a.75.75 0 01.75.75v2.5a.75.75 0 01-.75.75h-4.5a.75.75 0 01-.75-.75v-2.5a.75.75 0 01.75-.75h4.5z" clipRule="evenodd"/>
                    </g>
                </svg>,
                actionOnlyMe: (e, userId, collectionId, isPublic) => {togglePrivacy(e, userId, collectionId, isPublic)},
                label: 'Only me',
            },
            {
                icon:
                <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 16 16" fill="none"><path fill="currentColor" fillRule="evenodd" d="M8 0a8 8 0 100 16A8 8 0 008 0zM6.128 1.774A6.508 6.508 0 001.576 7H4.07a11.095 11.095 0 012.06-5.226zm3.744 0A11.096 11.096 0 0111.932 7h2.492a6.508 6.508 0 00-4.552-5.226zM10.42 7C10.165 5.124 9.333 3.335 8 1.836 6.667 3.335 5.835 5.124 5.58 7h4.84zM5.527 8.5h4.946C10.31 10.557 9.451 12.533 8 14.164 6.55 12.533 5.691 10.557 5.527 8.5zm-1.505 0H1.52a6.505 6.505 0 004.61 5.726C4.896 12.525 4.163 10.555 4.021 8.5zm5.85 5.726c1.231-1.701 1.964-3.671 2.106-5.726h2.503a6.505 6.505 0 01-4.61 5.726z" clipRule="evenodd"/></svg>,
                actionPublic: (e, userId, collectionId, isPublic) => {togglePrivacy(e, userId, collectionId, isPublic)},
                label: 'Public',
            },
            {
                icon:
                <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" fill="none">
                    <path d="M10 12V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 12V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M4 7H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M6 10V18C6 19.6569 7.34315 21 9 21H15C16.6569 21 18 19.6569 18 18V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5V7H9V5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>,
                actionDelete: (e, collectionId) => {setConfirmDeleteId(collectionId); setSettingId('');},
                label: 'Delete'

            }
        ]

    const {
        data,
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage,
        isLoading
    } = useInfiniteQuery({
        queryKey: ['getCollections', user?.userData?.[0].id],
        queryFn: ({pageParam, queryKey}) => getCollections(queryKey[1], pageParam, 5, session?.access_token),
        getNextPageParam: (lastPage) => {
            if(lastPage?.hasMore){
                const lastJournal = lastPage.data[lastPage?.data?.length - 1];
                return new Date(lastJournal?.created_at).toISOString();
            } else{
                return undefined;
            }
        },
        enabled: !!user?.userData?.[0].id,
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60 * 5
    })

    const handleClickCards = (e, collectionId, collectionName, collectionDescription) =>{
        e.stopPropagation();
        navigate(
            '/home/collectionCards',{
                state: {
                    collectionId: collectionId,
                    collectionName: collectionName,
                    collectionDescription:collectionDescription
                }
            }
        )

    }

    const mutateCollectionPrivacy = useUpdateCollectionPrivacyMutation(session);

    const togglePrivacy = (e, userId, collectionId, isPublic) =>{
        e.stopPropagation();

        const privacy = isPublic === 'private' ? 'public' : 'private';

        const formdata = new FormData();
        formdata.append('collectionId', collectionId)
        formdata.append('userId', userId)
        formdata.append('isPublic', privacy)
        mutateCollectionPrivacy.mutate(formdata);

        setShowUpdatePrivacyMessageId(collectionId === showUpdatePrivacyMessageId ? '' : collectionId);
        let timer;
        clearTimeout(timer);
        timer = setTimeout(() => {
            setShowUpdatePrivacyMessageId('')
        }, 2500);
    }


    const handleClickSettings = (e, collectionId) =>{
        e.stopPropagation();
        setSettingId(settingId === collectionId ? '' : collectionId);
    }

    const handleDeleteCollection = async(e, collectionId) =>{
        e.stopPropagation();
        setConfirmDeleteId('');
        try {
            let timer;
            setIsDeleting(true);
            const message = await deleteCollection(session?.access_token, collectionId);
            if(message){
                console.log(message)
            }
            queryClient.invalidateQueries(['getCollectionJournals', collectionId, session?.access_token])
            clearTimeout(timer);
            setIsDeleted(true)
            setIsDeleting(false)

            timer = setTimeout(() => {
                setIsDeleted(false)
            }, 2500);

        } catch (error) {
            queryClient.invalidateQueries(['getCollectionJournals', collectionId, session?.access_token])
            setIsDeleting(false)
            throw new Error(error)

        }
    }

    useEffect(()=> {
        if(!isFetchingNextPage && hasNextPage && inView){
            fetchNextPage();
        }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage, inView])

    useEffect(() =>{
        const handleClickOutside = (e) =>{
            if(settingId !== null && !e.target.closest('.setting-bttn')){
                setSettingId('')
            }
        }

        document.addEventListener('click', handleClickOutside);

        return() => {
            document.removeEventListener('click', handleClickOutside);
        }
    }, [])

    const collections = data?.pages?.flatMap((page) => page.data) || [];

    if(isLoading){
        return(
            <div className='collection-cards-loading-container'>
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="skeleton-card" />
                ))}
            </div>

        )
    }

    return(
        <>
        {isDeleted && (
            <AnimatePresence>
            <motion.div
            className='deleted-message-container'
            initial={{opacity: 0, y: 12}}
            animate={{opacity: 1, y: 0}}
            transition={{type: 'tween', duration: 0.15}}
            >
                The collection was deleted
            </motion.div>
            </AnimatePresence>
        )}

        {showUpdatePrivacyMessageId && (
            <div className='update-privacy-message-container'>
                {collections.find(c => c.id === showUpdatePrivacyMessageId)?.is_public === 'private' ? 'Collection privacy was updated to private.' : 'Collection privacy was updated to public.'}
            </div>
        )}

        <div className="collection-cards-container">
            {isDeleting && (
                <div className='deleting-collection-loading-container'>
                    <FadeLoader radius={0} loading={isDeleting}/>
                </div>
            )}

            {collections?.map((collection) => {
                const accentIndex = collection.id ? collection.id.toString().charCodeAt(0) % 4 : 0;
                return(
                    <div key={collection?.id} className='collection-cards'>
                        {confirmDeleteId === collection.id && (
                            <div className='delete-confirm-overlay'>
                                <p>Delete this collection?</p>
                                <div className='delete-confirm-actions'>
                                    <button className='btn-collection btn-collection--danger' onClick={(e) => handleDeleteCollection(e, collection.id)}>Delete</button>
                                    <button className='btn-collection btn-collection--secondary' onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(''); }}>Cancel</button>
                                </div>
                            </div>
                        )}

                        <div className='setting-bttn' aria-label="Collection settings" role="button" tabIndex={0} onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') handleClickSettings(e, collection?.id) }}>

                            {settingId === collection.id && (
                                <div className='collection-settings-container'>

                                    {settingsList?.map((setting) => (
                                        <div key={setting.label}>
                                            {setting.actionDelete && (
                                                <div key={setting.label} className='collection-settings-bttn collection-settings-bttn--danger' role="button" tabIndex={0} onClick={(e) => setting.actionDelete(e, collection?.id)} onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') setting.actionDelete(e, collection?.id) }}>
                                                    {setting.icon}
                                                    {setting.label}
                                                </div>
                                            )}
                                            {setting.actionOnlyMe && collection.is_public === 'public' && (
                                                <div key={setting.label} className='collection-settings-bttn' role="button" tabIndex={0} onClick={(e) => setting.actionOnlyMe(e, user?.userData[0].id, collection?.id, collection.is_public)} onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') setting.actionOnlyMe(e, user?.userData[0].id, collection?.id, collection.is_public) }}>
                                                    {setting.icon}
                                                    {setting.label}
                                                </div>
                                            )}
                                            {setting.actionPublic && collection.is_public === 'private' && (
                                                <div key={setting.label} className='collection-settings-bttn' role="button" tabIndex={0} onClick={(e) => setting.actionPublic(e, user?.userData[0].id, collection.id, collection.is_public)} onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') setting.actionPublic(e, user?.userData[0].id, collection.id, collection.is_public) }}>
                                                    {setting.icon}
                                                    {setting.label}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <svg onClick={(e) => handleClickSettings(e, collection?.id)} xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" width="20px" height="20px" viewBox="0 0 24 24" version="1.1" aria-label="Settings">
                                <title>more_1_fill</title>
                                    <g id="页面-1" stroke="none" strokeWidth="1" fill="none" fillRule="evenodd">
                                        <g id="System" transform="translate(-96.000000, -336.000000)" fillRule="nonzero">
                                            <g id="more_1_fill" transform="translate(96.000000, 336.000000)">
                                                <path d="M24,0 L24,24 L0,24 L0,0 L24,0 Z M12.5934901,23.257841 L12.5819402,23.2595131 L12.5108777,23.2950439 L12.4918791,23.2987469 L12.4918791,23.2987469 L12.4767152,23.2950439 L12.4056548,23.2595131 C12.3958229,23.2563662 12.3870493,23.2590235 12.3821421,23.2649074 L12.3780323,23.275831 L12.360941,23.7031097 L12.3658947,23.7234994 L12.3769048,23.7357139 L12.4804777,23.8096931 L12.4953491,23.8136134 L12.4953491,23.8136134 L12.5071152,23.8096931 L12.6106902,23.7357139 L12.6232938,23.7196733 L12.6232938,23.7196733 L12.6266527,23.7031097 L12.609561,23.275831 C12.6075724,23.2657013 12.6010112,23.2592993 12.5934901,23.257841 L12.5934901,23.257841 Z M12.8583906,23.1452862 L12.8445485,23.1473072 L12.6598443,23.2396597 L12.6498822,23.2499052 L12.6498822,23.2499052 L12.6471943,23.2611114 L12.6650943,23.6906389 L12.6699349,23.7034178 L12.6699349,23.7034178 L12.678386,23.7104931 L12.8793402,23.8032389 C12.8914285,23.8068999 12.9022333,23.8029875 12.9078286,23.7952264 L12.9118235,23.7811639 L12.8776777,23.1665331 C12.8752882,23.1545897 12.8674102,23.1470016 12.8583906,23.1452862 L12.8583906,23.1452862 Z M12.1430473,23.1473072 C12.1332178,23.1423925 12.1221763,23.1452606 12.1156365,23.1525954 L12.1099173,23.1665331 L12.0757714,23.7811639 C12.0751323,23.7926639 12.0828099,23.8018602 12.0926481,23.8045676 L12.108256,23.8032389 L12.3092106,23.7104931 L12.3186497,23.7024347 L12.3186497,23.7024347 L12.3225043,23.6906389 L12.340401,23.2611114 L12.337245,23.2485176 L12.337245,23.2485176 L12.3277531,23.2396597 L12.1430473,23.1473072 Z" id="MingCute" fillRule="nonzero">

                                                </path>
                                                <path d="M5,10 C6.10457,10 7,10.8954 7,12 C7,13.1046 6.10457,14 5,14 C3.89543,14 3,13.1046 3,12 C3,10.8954 3.89543,10 5,10 Z M12,10 C13.1046,10 14,10.8954 14,12 C14,13.1046 13.1046,14 12,14 C10.8954,14 10,13.1046 10,12 C10,10.8954 10.8954,10 12,10 Z M19,10 C20.1046,10 21,10.8954 21,12 C21,13.1046 20.1046,14 19,14 C17.8954,14 17,13.1046 17,12 C17,10.8954 17.8954,10 19,10 Z" id="形状" fill="currentColor">

                                                </path>
                                            </g>
                                        </g>
                                    </g>
                        </svg>
                        </div>
                        <div onClick={(e) => handleClickCards(e, collection?.id, collection?.name, collection?.description)} className='collection-gradient-header' data-accent={accentIndex}>
                            <GradientHeaderIcon />
                        </div>
                        <div onClick={(e) => handleClickCards(e, collection?.id, collection?.name, collection?.description)} className='collection-name-container text-truncate'>
                            {collection?.name}
                        </div>


                        <div className='collection-date-created'>
                            Created {formatPostDate(collection?.created_at)}
                            <span className={`privacy-badge ${collection.is_public === 'public' ? 'privacy-badge--public' : 'privacy-badge--private'}`}>
                                {collection.is_public === 'public' ? 'Public' : 'Private'}
                            </span>
                        </div>

                    </div>
                )
            })}
        <div ref={ref} className='collection-cards-inview-container'>
            {isFetchingNextPage && (
                <MoonLoader loading={isFetchingNextPage} color="var(--loader-color)" size={15}/>
            )}
        </div>

        </div>

        </>
    )
}

export default CollectionCards;
