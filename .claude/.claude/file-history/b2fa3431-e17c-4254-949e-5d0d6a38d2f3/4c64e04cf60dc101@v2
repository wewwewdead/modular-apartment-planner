import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../Context/useAuth';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getStories } from '../../../../API/StoryApi';
import { motion } from 'framer-motion';
import { BeatLoader } from 'react-spinners';
import './StoryBrowser.css';

const STATUS_LABELS = { ongoing: 'Ongoing', completed: 'Completed', hiatus: 'Hiatus' };
const STATUS_FILTERS = [
    { value: null, label: 'All' },
    { value: 'ongoing', label: 'Ongoing' },
    { value: 'completed', label: 'Completed' },
    { value: 'hiatus', label: 'Hiatus' },
];

const StoryCard = ({ story, onClick }) => {
    const author = story.users;
    return (
        <motion.div
            className="story-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -3 }}
            onClick={onClick}
        >
            <div className="story-card-cover">
                {story.cover_url ? (
                    <img src={story.cover_url} alt={story.title} loading="lazy" />
                ) : (
                    <div className="story-card-cover-placeholder">
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="var(--text-muted)">
                            <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/>
                        </svg>
                    </div>
                )}
            </div>
            <div className="story-card-info">
                <h3 className="story-card-title">{story.title}</h3>
                {author && (
                    <div className="story-card-author">
                        {author.image_url && <img src={author.image_url} alt="" className="story-card-author-avatar" />}
                        <span>{author.name}</span>
                    </div>
                )}
                <div className="story-card-meta">
                    <span className={`story-status-badge story-status-${story.status}`}>
                        {STATUS_LABELS[story.status] || story.status}
                    </span>
                    <span className="story-card-stats">
                        {(story.vote_count || 0)} votes &middot; {(story.read_count || 0)} reads
                    </span>
                </div>
                {story.tags && story.tags.length > 0 && (
                    <div className="story-card-tags">
                        {story.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="story-card-tag">{tag}</span>
                        ))}
                    </div>
                )}
            </div>
        </motion.div>
    );
};

const StoryBrowser = () => {
    const navigate = useNavigate();
    const { session } = useAuth();
    const token = session?.access_token;
    const [searchParams, setSearchParams] = useSearchParams();
    const statusFilter = searchParams.get('status') || null;

    const {
        data,
        isLoading,
        hasNextPage,
        fetchNextPage,
        isFetchingNextPage,
    } = useInfiniteQuery({
        queryKey: ['storiesBrowse', statusFilter],
        queryFn: ({ pageParam = null }) => getStories(12, pageParam, statusFilter, null, token),
        getNextPageParam: (lastPage) => {
            if (!lastPage?.hasMore || !lastPage.data?.length) return undefined;
            return lastPage.data[lastPage.data.length - 1].created_at;
        },
        initialPageParam: null,
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60 * 5,
    });

    const stories = useMemo(() => data?.pages?.flatMap(p => p.data) || [], [data]);

    return (
        <div className="story-browser">
            <div className="story-browser-header">
                <h2 className="story-browser-title">Stories</h2>
                {session && (
                    <div className="story-browser-header-actions">
                        <button
                            className="story-browser-my-btn"
                            onClick={() => navigate('/home/stories/library')}
                        >
                            My Library
                        </button>
                        <button
                            className="story-browser-my-btn"
                            onClick={() => navigate('/home/stories/dashboard')}
                        >
                            My Stories
                        </button>
                        <button
                            className="story-browser-new-btn"
                            onClick={() => navigate('/home/stories/new')}
                        >
                            + Write
                        </button>
                    </div>
                )}
            </div>

            <div className="story-browser-filters">
                {STATUS_FILTERS.map(f => (
                    <button
                        key={f.label}
                        className={`story-filter-btn ${statusFilter === f.value ? 'story-filter-btn-active' : ''}`}
                        onClick={() => {
                            if (f.value) {
                                setSearchParams({ status: f.value });
                            } else {
                                setSearchParams({});
                            }
                        }}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <div className="story-browser-loading">
                    <BeatLoader size={10} color="var(--text-muted)" />
                </div>
            ) : stories.length === 0 ? (
                <div className="story-browser-empty">
                    <p>No stories found.</p>
                </div>
            ) : (
                <>
                    <div className="story-browser-grid">
                        {stories.map(story => (
                            <StoryCard
                                key={story.id}
                                story={story}
                                onClick={() => navigate(`/home/stories/${story.id}`)}
                            />
                        ))}
                    </div>
                    {hasNextPage && (
                        <div className="story-browser-load-more">
                            <button
                                className="story-browser-load-more-btn"
                                onClick={() => fetchNextPage()}
                                disabled={isFetchingNextPage}
                            >
                                {isFetchingNextPage ? (
                                    <BeatLoader size={8} color="var(--text-secondary)" />
                                ) : (
                                    'Load more'
                                )}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default StoryBrowser;
