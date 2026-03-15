import React, { useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../Context/useAuth';
import { useStoryDetail } from '../hooks/useStoryData';
import { useCreateChapter, useUpdateChapter, useDeleteChapter, useReorderChapters } from '../hooks/useStoryMutations';
import { motion, AnimatePresence } from 'framer-motion';
import { BeatLoader } from 'react-spinners';
import './StoryChapterManager.css';

const StoryChapterManager = () => {
    const { storyId } = useParams();
    const navigate = useNavigate();
    const { session } = useAuth();
    const token = session?.access_token;

    const { data: story, isLoading } = useStoryDetail(storyId, token);
    const createChapter = useCreateChapter(token);
    const updateChapter = useUpdateChapter(token);
    const deleteChapter = useDeleteChapter(token);
    const reorderChapters = useReorderChapters(token);

    const [draggedIdx, setDraggedIdx] = useState(null);
    const [showNewChapterInput, setShowNewChapterInput] = useState(false);
    const [newChapterTitle, setNewChapterTitle] = useState('');

    const chapters = story?.chapters || [];

    const handleAddChapter = () => {
        const title = newChapterTitle.trim() || `Chapter ${chapters.length + 1}`;
        createChapter.mutate({ storyId, title }, {
            onSuccess: () => {
                setNewChapterTitle('');
                setShowNewChapterInput(false);
            },
        });
    };

    const handleNewChapterKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddChapter();
        } else if (e.key === 'Escape') {
            setShowNewChapterInput(false);
            setNewChapterTitle('');
        }
    };

    const handleToggleStatus = (chapter) => {
        const newStatus = chapter.status === 'published' ? 'draft' : 'published';
        updateChapter.mutate({
            storyId,
            chapterId: chapter.id,
            data: { status: newStatus },
        });
    };

    const handleDeleteChapter = (e, chapter) => {
        e.stopPropagation();
        if (window.confirm(`Delete "${chapter.title}"? This cannot be undone.`)) {
            deleteChapter.mutate({ storyId, chapterId: chapter.id });
        }
    };

    // Drag & drop reorder
    const handleDragStart = useCallback((idx) => {
        setDraggedIdx(idx);
    }, []);

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
    }, []);

    const handleDrop = useCallback((targetIdx) => {
        if (draggedIdx === null || draggedIdx === targetIdx) {
            setDraggedIdx(null);
            return;
        }
        const reordered = [...chapters];
        const [moved] = reordered.splice(draggedIdx, 1);
        reordered.splice(targetIdx, 0, moved);
        const chapterOrder = reordered.map(c => c.id);
        reorderChapters.mutate({ storyId, chapterOrder });
        setDraggedIdx(null);
    }, [draggedIdx, chapters, storyId, reorderChapters]);

    if (isLoading) {
        return (
            <div className="chapter-manager">
                <div className="chapter-manager-loading">
                    <BeatLoader size={10} color="var(--text-muted)" />
                </div>
            </div>
        );
    }

    if (!story) {
        return (
            <div className="chapter-manager">
                <p className="chapter-manager-error">Story not found.</p>
            </div>
        );
    }

    return (
        <motion.div
            className="chapter-manager"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
        >
            <div className="chapter-manager-header">
                <button className="chapter-manager-back" onClick={() => navigate('/home/stories/dashboard')}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="var(--text-secondary)">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                    </svg>
                </button>
                <div className="chapter-manager-title-section">
                    <h2 className="chapter-manager-title">{story.title}</h2>
                    <span className="chapter-manager-subtitle">
                        {chapters.length} chapter{chapters.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <button
                    className="chapter-manager-edit-story-btn"
                    onClick={() => navigate(`/home/stories/${storyId}/edit`)}
                >
                    Edit Details
                </button>
            </div>

            <div className="chapter-manager-actions">
                {showNewChapterInput ? (
                    <div className="chapter-manager-new-input-row">
                        <input
                            className="chapter-manager-new-title-input"
                            type="text"
                            value={newChapterTitle}
                            onChange={(e) => setNewChapterTitle(e.target.value)}
                            onKeyDown={handleNewChapterKeyDown}
                            placeholder={`Chapter ${chapters.length + 1}`}
                            maxLength={200}
                            autoFocus
                        />
                        <button
                            className="chapter-manager-add-btn"
                            onClick={handleAddChapter}
                            disabled={createChapter.isPending}
                        >
                            {createChapter.isPending ? (
                                <BeatLoader size={6} color="var(--bg-primary)" />
                            ) : (
                                'Add'
                            )}
                        </button>
                        <button
                            className="chapter-manager-cancel-btn"
                            onClick={() => { setShowNewChapterInput(false); setNewChapterTitle(''); }}
                        >
                            Cancel
                        </button>
                    </div>
                ) : (
                    <button
                        className="chapter-manager-add-btn"
                        onClick={() => setShowNewChapterInput(true)}
                    >
                        + Add Chapter
                    </button>
                )}
            </div>

            {chapters.length === 0 ? (
                <div className="chapter-manager-empty">
                    <p>No chapters yet. Add your first chapter to start writing.</p>
                </div>
            ) : (
                <div className="chapter-manager-list">
                    <AnimatePresence>
                        {chapters.map((chapter, idx) => (
                            <motion.div
                                key={chapter.id}
                                className={`chapter-manager-item ${draggedIdx === idx ? 'chapter-manager-item-dragging' : ''}`}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                draggable
                                onDragStart={() => handleDragStart(idx)}
                                onDragOver={handleDragOver}
                                onDrop={() => handleDrop(idx)}
                            >
                                <div className="chapter-manager-item-drag">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="var(--text-muted)">
                                        <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                                    </svg>
                                </div>

                                <div
                                    className="chapter-manager-item-content"
                                    onClick={() => navigate(`/home/stories/${storyId}/chapter/${chapter.id}/edit`)}
                                >
                                    <span className="chapter-manager-item-number">
                                        Ch. {chapter.chapter_number}
                                    </span>
                                    <span className="chapter-manager-item-title">
                                        {chapter.title}
                                    </span>
                                    <span className="chapter-manager-item-words">
                                        {(chapter.word_count || 0).toLocaleString()} words
                                    </span>
                                </div>

                                <div className="chapter-manager-item-actions">
                                    <button
                                        className={`chapter-status-toggle ${chapter.status === 'published' ? 'chapter-status-published' : 'chapter-status-draft'}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggleStatus(chapter);
                                        }}
                                        title={chapter.status === 'published' ? 'Unpublish' : 'Publish'}
                                    >
                                        {chapter.status === 'published' ? 'Published' : 'Draft'}
                                    </button>
                                    <button
                                        className="story-action-btn story-action-btn-danger"
                                        onClick={(e) => handleDeleteChapter(e, chapter)}
                                        title="Delete chapter"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                        </svg>
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </motion.div>
    );
};

export default StoryChapterManager;
