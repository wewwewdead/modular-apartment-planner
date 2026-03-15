import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../Context/useAuth';
import { useStoryDetail } from '../hooks/useStoryData';
import { useCreateStory, useUpdateStory } from '../hooks/useStoryMutations';
import { motion } from 'framer-motion';
import { BeatLoader } from 'react-spinners';
import './StoryEditor.css';

const TAG_SUGGESTIONS = [
    'Fantasy', 'Romance', 'Sci-Fi', 'Mystery', 'Thriller',
    'Horror', 'Adventure', 'Drama', 'Comedy', 'Poetry',
    'Slice of Life', 'Action', 'Historical', 'Fanfiction',
];

const StoryEditor = () => {
    const { storyId } = useParams();
    const isEdit = !!storyId;
    const navigate = useNavigate();
    const { session } = useAuth();
    const token = session?.access_token;

    const { data: existingStory, isLoading: loadingStory } = useStoryDetail(
        isEdit ? storyId : null,
        token
    );

    const createMutation = useCreateStory(token);
    const updateMutation = useUpdateStory(token);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState('ongoing');
    const [privacy, setPrivacy] = useState('public');
    const [tags, setTags] = useState([]);
    const [tagInput, setTagInput] = useState('');
    const [coverPreview, setCoverPreview] = useState(null);
    const [coverFile, setCoverFile] = useState(null);
    const coverInputRef = useRef(null);

    useEffect(() => {
        if (isEdit && existingStory) {
            setTitle(existingStory.title || '');
            setDescription(existingStory.description || '');
            setStatus(existingStory.status || 'ongoing');
            setPrivacy(existingStory.privacy || 'public');
            setTags(existingStory.tags || []);
            if (existingStory.cover_url) {
                setCoverPreview(existingStory.cover_url);
            }
        }
    }, [isEdit, existingStory]);

    const handleCoverChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setCoverFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setCoverPreview(reader.result);
            reader.readAsDataURL(file);
        }
    };

    const handleAddTag = (tag) => {
        const trimmed = tag.trim();
        if (trimmed && !tags.includes(trimmed) && tags.length < 10) {
            setTags([...tags, trimmed]);
        }
        setTagInput('');
    };

    const handleRemoveTag = (tag) => {
        setTags(tags.filter(t => t !== tag));
    };

    const handleTagKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            handleAddTag(tagInput);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim()) return;

        const formData = new FormData();
        formData.append('title', title.trim());
        formData.append('description', description.trim());
        formData.append('status', status);
        formData.append('privacy', privacy);
        formData.append('tags', JSON.stringify(tags));
        if (coverFile) {
            formData.append('image', coverFile);
        }

        try {
            if (isEdit) {
                await updateMutation.mutateAsync({ storyId, formData });
                navigate(`/home/stories/${storyId}/manage`);
            } else {
                const newStory = await createMutation.mutateAsync(formData);
                navigate(`/home/stories/${newStory.id}/manage`);
            }
        } catch (err) {
            console.error('Failed to save story:', err);
        }
    };

    const isSaving = createMutation.isPending || updateMutation.isPending;

    if (isEdit && loadingStory) {
        return (
            <div className="story-editor-page">
                <div className="story-editor-loading">
                    <BeatLoader size={10} color="var(--text-muted)" />
                </div>
            </div>
        );
    }

    return (
        <motion.div
            className="story-editor-page"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
        >
            <div className="story-editor-container">
                <div className="story-editor-header">
                    <button className="story-editor-back" onClick={() => navigate(-1)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="var(--text-secondary)">
                            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                        </svg>
                    </button>
                    <h2>{isEdit ? 'Edit Story' : 'New Story'}</h2>
                </div>

                <form onSubmit={handleSubmit} className="story-editor-form">
                    {/* Cover image */}
                    <div
                        className="story-editor-cover"
                        onClick={() => coverInputRef.current?.click()}
                    >
                        {coverPreview ? (
                            <img src={coverPreview} alt="Cover preview" />
                        ) : (
                            <div className="story-editor-cover-placeholder">
                                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="var(--text-muted)">
                                    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                                </svg>
                                <span>Add cover image</span>
                            </div>
                        )}
                        <input
                            ref={coverInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleCoverChange}
                            style={{ display: 'none' }}
                        />
                    </div>

                    {/* Title */}
                    <div className="story-editor-field">
                        <label className="story-editor-label">
                            Title
                            <span className="story-editor-counter">{title.length}/200</span>
                        </label>
                        <input
                            type="text"
                            className="story-editor-input"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={200}
                            placeholder="Give your story a title"
                            required
                        />
                    </div>

                    {/* Description */}
                    <div className="story-editor-field">
                        <label className="story-editor-label">
                            Description
                            <span className="story-editor-counter">{description.length}/2000</span>
                        </label>
                        <textarea
                            className="story-editor-textarea"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            maxLength={2000}
                            placeholder="What is your story about?"
                            rows={4}
                        />
                    </div>

                    {/* Status & Privacy */}
                    <div className="story-editor-row">
                        <div className="story-editor-field story-editor-field-half">
                            <label className="story-editor-label">Status</label>
                            <select
                                className="story-editor-select"
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                            >
                                <option value="ongoing">Ongoing</option>
                                <option value="completed">Completed</option>
                                <option value="hiatus">Hiatus</option>
                            </select>
                        </div>
                        <div className="story-editor-field story-editor-field-half">
                            <label className="story-editor-label">Privacy</label>
                            <select
                                className="story-editor-select"
                                value={privacy}
                                onChange={(e) => setPrivacy(e.target.value)}
                            >
                                <option value="public">Public</option>
                                <option value="private">Private</option>
                            </select>
                        </div>
                    </div>

                    {/* Tags */}
                    <div className="story-editor-field">
                        <label className="story-editor-label">Tags ({tags.length}/10)</label>
                        <div className="story-editor-tags-container">
                            {tags.map((tag) => (
                                <span key={tag} className="story-editor-tag">
                                    {tag}
                                    <button
                                        type="button"
                                        className="story-editor-tag-remove"
                                        onClick={() => handleRemoveTag(tag)}
                                    >
                                        &times;
                                    </button>
                                </span>
                            ))}
                            {tags.length < 10 && (
                                <input
                                    type="text"
                                    className="story-editor-tag-input"
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyDown={handleTagKeyDown}
                                    placeholder="Add a tag..."
                                />
                            )}
                        </div>
                        <div className="story-editor-tag-suggestions">
                            {TAG_SUGGESTIONS
                                .filter(s => !tags.includes(s))
                                .slice(0, 8)
                                .map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        className="story-editor-tag-suggestion"
                                        onClick={() => handleAddTag(s)}
                                    >
                                        + {s}
                                    </button>
                                ))}
                        </div>
                    </div>

                    {/* Submit */}
                    <button
                        type="submit"
                        className="story-editor-submit"
                        disabled={!title.trim() || isSaving}
                    >
                        {isSaving ? (
                            <BeatLoader size={8} color="var(--bg-primary)" />
                        ) : (
                            isEdit ? 'Save Changes' : 'Create Story'
                        )}
                    </button>
                </form>
            </div>
        </motion.div>
    );
};

export default StoryEditor;
