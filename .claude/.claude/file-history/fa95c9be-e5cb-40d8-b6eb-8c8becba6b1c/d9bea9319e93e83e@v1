import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../../../../Context/useAuth';
import { getDrafts, deleteJournal } from '../../../../../API/Api';
import { authedGet } from '../../../../../API/apiHelpers';
import './DraftList.css';

const DraftList = () => {
    const { session, user } = useAuth();
    const userId = user?.userData?.[0]?.id || null;
    const queryClient = useQueryClient();
    const { handleOpenTextEditor } = useOutletContext();

    const { data, isLoading } = useQuery({
        queryKey: ['journal-drafts', userId],
        queryFn: () => getDrafts(session?.access_token),
        enabled: !!session?.access_token && !!userId,
    });

    const drafts = data?.data || [];

    const handleResumeDraft = useCallback(async (draft) => {
        try {
            const result = await authedGet(
                session?.access_token,
                `/journal/${encodeURIComponent(draft.id)}/content`,
                'failed to fetch draft content'
            );
            const journal = result?.journal;
            if (journal) {
                handleOpenTextEditor({
                    draftId: draft.id,
                    draftContent: journal.content,
                    initialTitle: journal.title || '',
                });
            }
        } catch (err) {
            console.error('Failed to load draft:', err);
        }
    }, [handleOpenTextEditor, session?.access_token]);

    const handleDeleteDraft = useCallback(async (e, draftId) => {
        e.stopPropagation();
        try {
            await deleteJournal(draftId, session?.access_token);
            queryClient.invalidateQueries({ queryKey: ['journal-drafts'] });
        } catch (err) {
            console.error('Failed to delete draft:', err);
        }
    }, [session?.access_token, queryClient]);

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    if (isLoading) {
        return (
            <div className="draft-list-container">
                <h2 className="draft-list-title">Drafts</h2>
                <div className="draft-list-loading">Loading drafts...</div>
            </div>
        );
    }

    return (
        <div className="draft-list-container">
            <h2 className="draft-list-title">Drafts</h2>

            {drafts.length === 0 ? (
                <div className="draft-list-empty">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <polyline points="10 9 9 9 8 9"/>
                    </svg>
                    <p>No drafts yet</p>
                    <span>Start writing and your work will be saved automatically</span>
                </div>
            ) : (
                <div className="draft-list-items">
                    {drafts.map((draft) => (
                        <div
                            key={draft.id}
                            className="draft-list-item"
                            onClick={() => handleResumeDraft(draft)}
                        >
                            <div className="draft-list-item-content">
                                <span className="draft-list-item-title">
                                    {draft.title?.trim() || 'Untitled'}
                                </span>
                                <span className="draft-list-item-date">
                                    Edited {formatDate(draft.updated_at || draft.created_at)}
                                </span>
                            </div>
                            <button
                                className="draft-list-item-delete"
                                onClick={(e) => handleDeleteDraft(e, draft.id)}
                                aria-label="Delete draft"
                                title="Delete draft"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M19 6l-2 14H7L5 6"/>
                                    <path d="M10 11v6"/>
                                    <path d="M14 11v6"/>
                                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                                </svg>
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DraftList;
