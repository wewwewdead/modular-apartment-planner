import { useQuery } from '@tanstack/react-query';
import { getStreak } from '../../../API/Api';

const useStreakData = (userId) => {
    return useQuery({
        queryKey: ['streak', userId],
        queryFn: () => getStreak(userId),
        enabled: !!userId,
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
    });
};

export default useStreakData;
