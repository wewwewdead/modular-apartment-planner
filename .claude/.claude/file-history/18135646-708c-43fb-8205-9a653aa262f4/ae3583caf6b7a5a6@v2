import { useEffect, useState, useCallback, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, $createTextNode } from 'lexical';
import { $createMentionNode } from '../MentionNode';
import { searchFollowingUsers } from '../../../../../../API/Api';
import { useAuth } from '../../../../../Context/useAuth';
import { createPortal } from 'react-dom';
import { handleImageFallback } from '../../../../../utils/handleImageFallback';

const MENTION_REGEX = /@([\w-]*)$/;
const DEBOUNCE_MS = 200;

export default function MentionPlugin() {
    const [editor] = useLexicalComposerContext();
    const { session } = useAuth();
    const [query, setQuery] = useState(null);
    const [results, setResults] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [menuPosition, setMenuPosition] = useState(null);
    const debounceRef = useRef(null);
    const menuRef = useRef(null);
    const triggerOffsetRef = useRef(null);

    const isOpen = query !== null && menuPosition !== null;

    const closeMenu = useCallback(() => {
        setQuery(null);
        setResults([]);
        setSelectedIndex(0);
        setMenuPosition(null);
        triggerOffsetRef.current = null;
    }, []);

    const insertMention = useCallback((user) => {
        editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;

            const anchor = selection.anchor;
            const anchorNode = anchor.getNode();
            const textContent = anchorNode.getTextContent();

            // Find the @ trigger position
            const matchUpToCursor = textContent.substring(0, anchor.offset);
            const match = matchUpToCursor.match(MENTION_REGEX);
            if (!match) return;

            const mentionStart = match.index;
            const mentionEnd = anchor.offset;

            // Split the text node and replace the @query with MentionNode
            if (mentionStart > 0) {
                const [before] = anchorNode.splitText(mentionStart, mentionEnd);
                const mentionNode = $createMentionNode(user.name, user.id, user.username);
                const afterNode = before.getNextSibling();
                if (afterNode) {
                    afterNode.replace(mentionNode);
                }
                // Add a space after
                const spaceNode = $createTextNode(' ');
                mentionNode.insertAfter(spaceNode);
                spaceNode.select();
            } else {
                const [, rest] = anchorNode.splitText(mentionEnd);
                const mentionNode = $createMentionNode(user.name, user.id, user.username);
                anchorNode.replace(mentionNode);
                const spaceNode = $createTextNode(' ');
                mentionNode.insertAfter(spaceNode);
                if (rest) {
                    spaceNode.insertAfter(rest);
                }
                spaceNode.select();
            }
        });
        closeMenu();
    }, [editor, closeMenu]);

    // Listen for text changes to detect @query
    useEffect(() => {
        return editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => {
                const selection = $getSelection();
                if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
                    closeMenu();
                    return;
                }

                const anchor = selection.anchor;
                const anchorNode = anchor.getNode();
                const textContent = anchorNode.getTextContent();
                const textUpToCursor = textContent.substring(0, anchor.offset);

                const match = textUpToCursor.match(MENTION_REGEX);
                if (!match) {
                    closeMenu();
                    return;
                }

                const mentionQuery = match[1];
                setQuery(mentionQuery);
                triggerOffsetRef.current = match.index;

                // Calculate position from DOM selection
                const nativeSelection = window.getSelection();
                if (nativeSelection && nativeSelection.rangeCount > 0) {
                    const range = nativeSelection.getRangeAt(0);
                    const rect = range.getBoundingClientRect();
                    setMenuPosition({
                        top: rect.bottom + 4,
                        left: rect.left,
                    });
                }
            });
        });
    }, [editor, closeMenu]);

    // Fetch results when query changes
    useEffect(() => {
        if (query === null) return;

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(async () => {
            if (!session?.access_token) return;
            try {
                const response = await searchFollowingUsers(session.access_token, query, 8);
                setResults(response?.data || []);
                setSelectedIndex(0);
            } catch (err) {
                console.error('mention search error:', err);
                setResults([]);
            }
        }, DEBOUNCE_MS);

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [query, session?.access_token]);

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((prev) => (prev + 1) % Math.max(results.length, 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) => (prev - 1 + results.length) % Math.max(results.length, 1));
            } else if ((e.key === 'Enter' || e.key === 'Tab') && results.length > 0) {
                e.preventDefault();
                insertMention(results[selectedIndex]);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeMenu();
            }
        };

        document.addEventListener('keydown', handleKeyDown, true);
        return () => document.removeEventListener('keydown', handleKeyDown, true);
    }, [isOpen, results, selectedIndex, insertMention, closeMenu]);

    if (!isOpen || results.length === 0) return null;

    return createPortal(
        <div
            ref={menuRef}
            className="mention-dropdown"
            style={{ top: menuPosition.top, left: menuPosition.left }}
        >
            {results.map((user, index) => (
                <div
                    key={user.id}
                    className={`mention-dropdown-item${index === selectedIndex ? ' mention-dropdown-item--selected' : ''}`}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(user);
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                >
                    <img
                        className="mention-dropdown-avatar"
                        src={user.image_url || '/assets/profile.jpg'}
                        alt=""
                        onError={handleImageFallback}
                    />
                    <div className="mention-dropdown-info">
                        <span className="mention-dropdown-name">{user.name}</span>
                        {user.username && (
                            <span className="mention-dropdown-username">@{user.username}</span>
                        )}
                    </div>
                </div>
            ))}
        </div>,
        document.body
    );
}
