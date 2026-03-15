import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND, COMMAND_PRIORITY_LOW, SELECTION_CHANGE_COMMAND } from 'lexical';
import { $isLinkNode, TOGGLE_LINK_COMMAND, $toggleLink } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';

function FloatingSelectionToolbarComponent() {
    const [editor] = useLexicalComposerContext();
    const toolbarRef = useRef(null);
    const [isVisible, setIsVisible] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const [formats, setFormats] = useState({
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
        code: false,
        isLink: false,
    });

    const updateToolbar = useCallback(() => {
        editor.getEditorState().read(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection) || selection.isCollapsed()) {
                setIsVisible(false);
                return;
            }

            const nativeSelection = window.getSelection();
            if (!nativeSelection || nativeSelection.rangeCount === 0 || nativeSelection.isCollapsed) {
                setIsVisible(false);
                return;
            }

            const range = nativeSelection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            if (rect.width === 0 && rect.height === 0) {
                setIsVisible(false);
                return;
            }

            const toolbarWidth = 240;
            const toolbarHeight = 38;
            let top = rect.top + window.scrollY - toolbarHeight - 8;
            let left = rect.left + window.scrollX + (rect.width / 2) - (toolbarWidth / 2);

            // Flip below if near top
            if (top < window.scrollY + 8) {
                top = rect.bottom + window.scrollY + 8;
            }

            // Clamp horizontal
            left = Math.max(8, Math.min(left, window.innerWidth - toolbarWidth - 8));

            setPosition({ top, left });
            setIsVisible(true);

            const node = selection.anchor.getNode();
            const parent = node.getParent();

            setFormats({
                bold: selection.hasFormat('bold'),
                italic: selection.hasFormat('italic'),
                underline: selection.hasFormat('underline'),
                strikethrough: selection.hasFormat('strikethrough'),
                code: selection.hasFormat('code'),
                isLink: $isLinkNode(parent) || $isLinkNode(node),
            });
        });
    }, [editor]);

    useEffect(() => {
        return mergeRegister(
            editor.registerCommand(
                SELECTION_CHANGE_COMMAND,
                () => {
                    updateToolbar();
                    return false;
                },
                COMMAND_PRIORITY_LOW,
            ),
            editor.registerUpdateListener(() => {
                updateToolbar();
            }),
        );
    }, [editor, updateToolbar]);

    // Hide on scroll
    useEffect(() => {
        const hide = () => setIsVisible(false);
        document.addEventListener('scroll', hide, true);
        return () => document.removeEventListener('scroll', hide, true);
    }, []);

    const toggleFormat = (format) => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    };

    const toggleLink = () => {
        editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;
            if (formats.isLink) {
                $toggleLink(null);
            } else {
                $toggleLink('https://');
            }
        });
    };

    if (!isVisible) return null;

    const btnClass = (active) => `fst-btn${active ? ' fst-active' : ''}`;

    return createPortal(
        <div
            ref={toolbarRef}
            className="floating-selection-toolbar"
            style={{ top: position.top, left: position.left }}
            onMouseDown={(e) => e.preventDefault()}
        >
            <button className={btnClass(formats.bold)} onClick={() => toggleFormat('bold')} title="Bold">
                <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor"><path d="M272-200v-560h221q65 0 120 40t55 111q0 51-23 78.5T602-491q25 11 55.5 41t30.5 90q0 89-65 124.5T501-200H272Zm121-112h104q48 0 58.5-24.5T566-372q0-11-10.5-35.5T494-432H393v120Zm0-228h93q33 0 48-17t15-38q0-24-17-39t-44-15h-95v109Z"/></svg>
            </button>
            <button className={btnClass(formats.italic)} onClick={() => toggleFormat('italic')} title="Italic">
                <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor"><path d="M200-200v-100h160l120-360H320v-100h400v100H580L460-300h140v100H200Z"/></svg>
            </button>
            <button className={btnClass(formats.underline)} onClick={() => toggleFormat('underline')} title="Underline">
                <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor"><path d="M200-120v-80h560v80H200Zm280-160q-101 0-157-63t-56-167v-330h103v336q0 56 28 91t82 35q54 0 82-35t28-91v-336h103v330q0 104-56 167t-157 63Z"/></svg>
            </button>
            <button className={btnClass(formats.strikethrough)} onClick={() => toggleFormat('strikethrough')} title="Strikethrough">
                <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor"><path d="M486-160q-76 0-135-45t-77-119l86-36q12 42 44.5 68t81.5 26q48 0 80-24.5t32-66.5q0-20-8-36t-22-28H80v-80h800v80H606q4 8 6 17t2 19q0 76-53.5 125.5T486-160ZM80-584v-80h184q-10-14-15-29.5T244-726q0-67 49-110.5T430-880q60 0 103.5 32t63.5 84l-86 36q-8-28-32.5-50T430-800q-40 0-66 22t-26 56q0 34 21.5 55T416-640h64v56H80Z"/></svg>
            </button>
            <button className={btnClass(formats.code)} onClick={() => toggleFormat('code')} title="Code">
                <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor"><path d="M320-240 80-480l240-240 57 57-184 183 184 183-57 57Zm320 0-57-57 184-183-184-183 57-57 240 240-240 240Z"/></svg>
            </button>
            <div className="fst-divider" />
            <button className={btnClass(formats.isLink)} onClick={toggleLink} title="Link">
                <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor"><path d="M440-280H280q-83 0-141.5-58.5T80-480q0-83 58.5-141.5T280-680h160v80H280q-50 0-85 35t-35 85q0 50 35 85t85 35h160v80ZM320-440v-80h320v80H320Zm200 160v-80h160q50 0 85-35t35-85q0-50-35-85t-85-35H520v-80h160q83 0 141.5 58.5T880-480q0 83-58.5 141.5T680-280H520Z"/></svg>
            </button>
        </div>,
        document.body
    );
}

export default function FloatingSelectionToolbar() {
    return <FloatingSelectionToolbarComponent />;
}
