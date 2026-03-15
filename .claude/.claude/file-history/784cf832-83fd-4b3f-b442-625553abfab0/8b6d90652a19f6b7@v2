import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, SELECTION_CHANGE_COMMAND } from 'lexical';
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';

function getSelectedLinkNode(selection) {
    if (!$isRangeSelection(selection)) return null;
    const node = selection.anchor.getNode();
    const parent = node.getParent();
    if ($isLinkNode(parent)) return parent;
    if ($isLinkNode(node)) return node;
    return null;
}

function FloatingLinkEditorComponent() {
    const [editor] = useLexicalComposerContext();
    const editorRef = useRef(null);
    const inputRef = useRef(null);
    const [linkUrl, setLinkUrl] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [isLink, setIsLink] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });

    const updateLink = useCallback(() => {
        editor.getEditorState().read(() => {
            const selection = $getSelection();
            const linkNode = getSelectedLinkNode(selection);
            if (linkNode) {
                setIsLink(true);
                setLinkUrl(linkNode.getURL());
            } else {
                setIsLink(false);
                setLinkUrl('');
                setIsEditing(false);
            }
        });
    }, [editor]);

    useEffect(() => {
        return mergeRegister(
            editor.registerCommand(
                SELECTION_CHANGE_COMMAND,
                () => {
                    updateLink();
                    return false;
                },
                COMMAND_PRIORITY_LOW,
            ),
            editor.registerUpdateListener(({ editorState }) => {
                editorState.read(() => {
                    updateLink();
                });
            }),
        );
    }, [editor, updateLink]);

    // Position the floating editor below the link
    useEffect(() => {
        if (!isLink) return;

        const update = () => {
            editor.getEditorState().read(() => {
                const selection = $getSelection();
                if (!$isRangeSelection(selection)) return;

                const nativeSelection = window.getSelection();
                if (!nativeSelection || nativeSelection.rangeCount === 0) return;

                const range = nativeSelection.getRangeAt(0);
                const rect = range.getBoundingClientRect();

                setPosition({
                    top: rect.bottom + window.scrollY + 4,
                    left: Math.max(8, rect.left + window.scrollX),
                });
            });
        };

        update();
    }, [isLink, linkUrl, editor]);

    const handleSave = () => {
        if (linkUrl.trim()) {
            editor.dispatchCommand(TOGGLE_LINK_COMMAND, linkUrl.trim());
        }
        setIsEditing(false);
    };

    const handleRemove = () => {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
        setIsLink(false);
        setIsEditing(false);
    };

    if (!isLink) return null;

    return createPortal(
        <div
            ref={editorRef}
            className="floating-link-editor"
            style={{ top: position.top, left: position.left }}
            onMouseDown={(e) => e.preventDefault()}
        >
            {isEditing ? (
                <div className="floating-link-edit-row">
                    <input
                        ref={inputRef}
                        className="floating-link-input"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
                            if (e.key === 'Escape') { setIsEditing(false); }
                        }}
                        placeholder="https://"
                        autoFocus
                    />
                    <button className="floating-link-btn floating-link-save" onClick={handleSave}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    </button>
                </div>
            ) : (
                <div className="floating-link-display-row">
                    <a
                        className="floating-link-url"
                        href={linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {linkUrl.length > 40 ? linkUrl.slice(0, 40) + '...' : linkUrl}
                    </a>
                    <button className="floating-link-btn" onClick={() => setIsEditing(true)} title="Edit link">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                    </button>
                    <button className="floating-link-btn" onClick={() => window.open(linkUrl, '_blank')} title="Open in new tab">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
                    </button>
                    <button className="floating-link-btn floating-link-remove" onClick={handleRemove} title="Remove link">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
                    </button>
                </div>
            )}
        </div>,
        document.body
    );
}

export default function FloatingLinkEditor() {
    return <FloatingLinkEditorComponent />;
}
