import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../Context/useAuth';
import { useChapter } from '../hooks/useStoryData';
import { useUpdateChapter } from '../hooks/useStoryMutations';
import { motion } from 'framer-motion';
import { BeatLoader, BarLoader } from 'react-spinners';

import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { $getRoot } from 'lexical';

import ImageNode from '../../HomePage/Editor/nodes/ImageNode';
import ImagePlugin from '../../HomePage/Editor/nodes/Plugins/ImagePlugin';
import ToolBar from '../../HomePage/Editor/Toolbar';

import './ChapterEditor.css';

const editorTheme = {
    paragraph: 'editor-paragraph',
    heading: {
        h1: 'editor-heading-h1',
        h2: 'editor-heading-h2',
        h3: 'editor-heading-h3',
    },
    quote: 'editor-quote',
    text: {
        bold: 'editor-text-bold',
        italic: 'editor-text-italic',
        underline: 'editor-text-underline',
    },
};

const ChapterEditorInner = ({ chapter, storyId, chapterId, token, onBack }) => {
    const [editor] = useLexicalComposerContext();
    const navigate = useNavigate();
    const updateChapter = useUpdateChapter(token);

    const [chapterTitle, setChapterTitle] = useState(chapter?.title || '');
    const [editorState, setEditorState] = useState(null);
    const [wordCount, setWordCount] = useState(chapter?.word_count || 0);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const saveTimerRef = useRef(null);
    const uploadedImgPathsRef = useRef([]);

    // Load existing content into editor
    useEffect(() => {
        if (chapter?.content && editor) {
            try {
                const content = typeof chapter.content === 'string'
                    ? chapter.content
                    : JSON.stringify(chapter.content);
                const state = editor.parseEditorState(content);
                editor.setEditorState(state);
            } catch (err) {
                console.error('Failed to load chapter content:', err);
            }
        }
    }, [chapter?.id, editor]);

    const onchange = useCallback((state) => {
        const jsonStr = JSON.stringify(state.toJSON());
        setEditorState(jsonStr);
        setHasChanges(true);

        state.read(() => {
            const root = $getRoot();
            const text = root.getTextContent().trim();
            setWordCount(text ? text.split(/\s+/).length : 0);
        });
    }, []);

    // Auto-save every 30 seconds
    useEffect(() => {
        if (!hasChanges || !editorState) return;

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            handleSave(false);
        }, 30000);

        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, [editorState, hasChanges]);

    const handleSave = async (showFeedback = true) => {
        if (!editorState) return;
        if (showFeedback) setIsSaving(true);

        try {
            await updateChapter.mutateAsync({
                storyId,
                chapterId,
                data: {
                    title: chapterTitle.trim() || 'Untitled Chapter',
                    content: editorState,
                },
            });
            setHasChanges(false);
        } catch (err) {
            console.error('Failed to save chapter:', err);
        } finally {
            if (showFeedback) setIsSaving(false);
        }
    };

    const handlePublish = async () => {
        if (!editorState) return;
        setIsSaving(true);
        try {
            await updateChapter.mutateAsync({
                storyId,
                chapterId,
                data: {
                    title: chapterTitle.trim() || 'Untitled Chapter',
                    content: editorState,
                    status: 'published',
                },
            });
            setHasChanges(false);
            navigate(`/home/stories/${storyId}/manage`);
        } catch (err) {
            console.error('Failed to publish chapter:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const addUploadImagesPath = useCallback((paths) => {
        if (Array.isArray(paths)) {
            uploadedImgPathsRef.current = paths;
        } else if (paths) {
            uploadedImgPathsRef.current.push(paths);
        }
    }, []);

    return (
        <>
            <div className="chapter-editor-header">
                <button className="chapter-editor-back" onClick={onBack}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="var(--text-secondary)">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                    </svg>
                </button>
                <input
                    className="chapter-editor-title-input"
                    type="text"
                    value={chapterTitle}
                    onChange={(e) => {
                        setChapterTitle(e.target.value);
                        setHasChanges(true);
                    }}
                    placeholder="Chapter title..."
                    maxLength={200}
                />
                <div className="chapter-editor-header-actions">
                    <button
                        className="chapter-editor-save-btn"
                        onClick={() => handleSave(true)}
                        disabled={!hasChanges || isSaving}
                    >
                        {isSaving ? <BeatLoader size={6} color="var(--text-secondary)" /> : 'Save'}
                    </button>
                    <button
                        className="chapter-editor-publish-btn"
                        onClick={handlePublish}
                        disabled={isSaving}
                    >
                        Publish
                    </button>
                </div>
            </div>

            <div className="chapter-editor-loader">
                {isSaving && (
                    <BarLoader loading={true} width="100%" height={3} color="var(--accent-purple)" speedMultiplier={0.7} />
                )}
            </div>

            <div className="toolbar-wrapper">
                <ToolBar addUploadedImagePath={addUploadImagesPath} />
            </div>

            <div className="chapter-editor-shell">
                <RichTextPlugin
                    contentEditable={
                        <ContentEditable
                            className="editor-input chapter-editor-content"
                            aria-placeholder="Start writing your chapter..."
                            placeholder={<div className="editor-placeholder">Start writing your chapter...</div>}
                        />
                    }
                    ErrorBoundary={LexicalErrorBoundary}
                />
                <ImagePlugin addUploadedImagePath={addUploadImagesPath} />
                <HistoryPlugin />
                <OnChangePlugin onChange={onchange} />
            </div>

            <div className="chapter-editor-footer">
                <span className="chapter-editor-word-count">
                    {wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}
                </span>
                {hasChanges && (
                    <span className="chapter-editor-unsaved">Unsaved changes</span>
                )}
            </div>
        </>
    );
};

const ChapterEditor = () => {
    const { storyId, chapterId } = useParams();
    const navigate = useNavigate();
    const { session } = useAuth();
    const token = session?.access_token;

    const { data: chapter, isLoading } = useChapter(storyId, chapterId, token);

    const editorConfig = {
        namespace: 'ChapterEditor',
        theme: editorTheme,
        nodes: [ImageNode, HeadingNode, QuoteNode],
        onError(error) {
            console.error('Lexical error:', error);
        },
        editable: true,
    };

    if (isLoading) {
        return (
            <div className="chapter-editor-page">
                <div className="chapter-editor-loading">
                    <BeatLoader size={10} color="var(--text-muted)" />
                </div>
            </div>
        );
    }

    return (
        <motion.div
            className="chapter-editor-page"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
        >
            <LexicalComposer initialConfig={editorConfig}>
                <ChapterEditorInner
                    chapter={chapter}
                    storyId={storyId}
                    chapterId={chapterId}
                    token={token}
                    onBack={() => navigate(`/home/stories/${storyId}/manage`)}
                />
            </LexicalComposer>
        </motion.div>
    );
};

export default ChapterEditor;
