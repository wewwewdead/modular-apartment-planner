import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import supabase from '../utils/supabaseClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getNotificationsCount, getUserData } from '../../API/Api';


export const AuthContext = createContext();

export const AuthProvider = ({children}) => {
    const [loading, setLoading] = useState(true);
    const [showAuthModal, setShowAuthModal] = useState(false);

    const openAuthModal = useCallback(() => setShowAuthModal(true), []);
    const closeAuthModal = useCallback(() => setShowAuthModal(false), []);

    const queryClient = useQueryClient();

    const {data: authData, isLoading: isAuthLoading} = useQuery({
        queryKey: ['authsession'],
        queryFn: async() =>{
            const {data, error} = await supabase.auth.getSession();
            if(error) throw error;
            return data.session
        },
        staleTime: 1000 * 60 * 60,
        gcTime: 1000 * 60 * 60,
    })

    useEffect(() =>{
        let mounted = true;

        if(!isAuthLoading && mounted){
            setLoading(false)
        }
        const {data: listener} = supabase.auth.onAuthStateChange((_event, session) => {
            if(mounted){
                queryClient.setQueryData(['authsession'], session ?? null);
                setLoading(false)
            }
        })
        return() => {
            mounted = false;
            listener.subscription.unsubscribe();
        }

    }, [isAuthLoading, queryClient])

    const {data: userData, isLoading} = useQuery({
            queryKey: ['userData', authData?.user?.id],
            queryFn: ({queryKey}) => getUserData(queryKey[1]),
            enabled: !!authData?.access_token,
            staleTime: 1000 * 60 * 60,
            gcTime: 1000 * 60 * 60,
        })

    const {data: notifCount} = useQuery({
        queryKey: ['notifcounts', authData?.user?.id],
        queryFn: ({queryKey}) => getNotificationsCount(queryKey[1], authData?.access_token),
        enabled: !!authData?.access_token,
        staleTime: 1000 * 60 * 60,
        gcTime: 1000 * 60 * 60,
    })

    // Combined realtime subscription for both notification tables
    useEffect(() =>{
        if(!userData) return;

        const userId = userData?.userData?.[0]?.id;
        if (!userId) return;

        const handleNewNotif = () => {
            queryClient.setQueryData(['notifcounts', authData?.user?.id], (old) => ({count: (old?.count ? old?.count : 0) + 1}));
        };

        const channel = supabase
        .channel('all-notifications')
        .on('postgres_changes',
            {event: 'INSERT', schema: 'public', table: 'notifications', filter: `receiver_id=eq.${userId}`},
            handleNewNotif
        )
        .on('postgres_changes',
            {event: 'INSERT', schema: 'public', table: 'notification_opinions', filter: `receiver_id=eq.${userId}`},
            handleNewNotif
        )
        .subscribe();

        return () => {
            supabase.removeChannel(channel);
        }

    },[userData, authData?.user?.id, queryClient])


    const signOut = useCallback(async() =>{
        await supabase.auth.signOut({ scope: 'local' });
        queryClient.setQueryData(['authsession'], null)
        queryClient.clear();
    }, [queryClient])

    const requireAuth = useCallback((callback) => {
        if(authData){
            callback();
        } else {
            openAuthModal();
        }
    }, [authData, openAuthModal])

    const value = useMemo(() => ({
        session: authData,
        user: userData,
        loading: loading,
        isLoading: isLoading,
        notifCount: notifCount?.count,
        signOut,
        showAuthModal,
        openAuthModal,
        closeAuthModal,
        requireAuth
    }), [authData, userData, loading, isLoading, notifCount?.count, signOut, showAuthModal, openAuthModal, closeAuthModal, requireAuth])

    return <AuthContext.Provider value={value}>
        {children}
    </AuthContext.Provider>
}
