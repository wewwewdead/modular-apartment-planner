import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const TopPosts = ({ data }) => {
    const navigate = useNavigate();

    if (!data?.length) return null;

    return (
        <div className="analytics-chart-card analytics-top-posts-card">
            <h3 className="analytics-chart-title">Top performing posts</h3>
            <div className="analytics-top-posts-list">
                {data.map((post, i) => (
                    <motion.div
                        key={post.journal_id}
                        className="analytics-top-post-row"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: i * 0.04 }}
                        onClick={() => navigate(`/home/post/${post.journal_id}`)}
                    >
                        <span className="analytics-post-rank">#{i + 1}</span>
                        <div className="analytics-post-info">
                            <span className="analytics-post-title">
                                {post.title || 'Untitled'}
                            </span>
                            <span className="analytics-post-stats">
                                {post.views} views &middot; {post.reactions} reactions &middot; {post.comments} comments
                            </span>
                        </div>
                        <span className="analytics-post-score">{post.score}</span>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};

export default TopPosts;
