import { useQuery } from '@tanstack/react-query';
import { getWriterAnalytics } from '../../../API/Api';
import { useAuth } from '../../Context/useAuth';

const useAnalyticsData = (range = '30d') => {
    const { session } = useAuth();
    const userId = session?.user?.id;

    return useQuery({
        queryKey: ['writerAnalytics', userId, range],
        queryFn: () => getWriterAnalytics(session?.access_token, range),
        enabled: !!session?.access_token,
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
    });
};

export default useAnalyticsData;
