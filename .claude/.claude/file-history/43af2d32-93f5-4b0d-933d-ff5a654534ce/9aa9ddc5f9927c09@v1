import { useCallback, useEffect, useRef, useState } from "react";

import {
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
} from "lexical";

import { $createHeadingNode, $isHeadingNode, $createQuoteNode, $isQuoteNode } from "@lexical/rich-text";
import { $getSelectionStyleValueForProperty, $patchStyleText, $setBlocksType } from "@lexical/selection";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

import { INSERT_IMAGE_COMMAND } from "./nodes/ImageNode";
import { saveJournalImage } from "../../../../API/Api";
import { useAuth } from "../../../Context/useAuth";

const DEFAULT_ACTIVE_STATES = {
    bold: false,
    italic: false,
    underline: false,
    heading: null,
    quote: false,
    alignment: 'left',
    textColor: '',
    highlightColor: '',
};

const ToolBar = ({addUploadedImagePath, onSwitchToCanvas}) =>{
    const [editor] = useLexicalComposerContext();
    const {session} = useAuth();
    const colorPickerRef = useRef(null);

    // Active state tracking
    const [activeStates, setActiveStates] = useState(DEFAULT_ACTIVE_STATES);

    const [showTextColorPicker, setShowTextColorPicker] = useState(false);
    const [showHighlightColorPicker, setShowHighlightColorPicker] = useState(false);

    const COLOR_PALETTE = [
        { label: 'Default', value: null },
        { label: 'Black', value: '#000000' },
        { label: 'Dark Gray', value: '#4d4d4d' },
        { label: 'Gray', value: '#888888' },
        { label: 'Light Gray', value: '#bfbfbf' },
        { label: 'Red', value: '#f44336' },
        { label: 'Pink', value: '#e91e63' },
        { label: 'Purple', value: '#9c27b0' },
        { label: 'Deep Purple', value: '#673ab7' },
        { label: 'Indigo', value: '#3f51b5' },
        { label: 'Blue', value: '#2196f3' },
        { label: 'Light Blue', value: '#03a9f4' },
        { label: 'Cyan', value: '#00bcd4' },
        { label: 'Teal', value: '#009688' },
        { label: 'Green', value: '#4caf50' },
        { label: 'Light Green', value: '#8bc34a' },
        { label: 'Lime', value: '#cddc39' },
        { label: 'Yellow', value: '#ffeb3b' },
        { label: 'Amber', value: '#ffc107' },
        { label: 'Orange', value: '#ff9800' },
        { label: 'Deep Orange', value: '#ff5722' },
        { label: 'Brown', value: '#795548' },
        { label: 'Blue Gray', value: '#607d8b' },
    ];

    const toCompactRgb = (value) => {
        if (!value) return '';
        return value.toLowerCase().replace(/\s+/g, '');
    };

    const normalizeColor = (value) => {
        if (!value) return '';
        const trimmed = value.trim().toLowerCase();
        if (!trimmed.startsWith('#')) {
            return toCompactRgb(trimmed);
        }

        let hex = trimmed.slice(1);
        if (hex.length === 3) {
            hex = hex.split('').map((char) => `${char}${char}`).join('');
        }
        if (hex.length !== 6) {
            return trimmed;
        }

        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);

        return `rgb(${r},${g},${b})`;
    };

    const isPaletteColorActive = (activeValue, paletteValue) => {
        const normalizedActive = normalizeColor(activeValue);
        if (!paletteValue) {
            return !normalizedActive;
        }
        return normalizedActive === normalizeColor(paletteValue);
    };

    // Register update listener for active state detection
    useEffect(() => {
        return editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => {
                const selection = $getSelection();
                if (!$isRangeSelection(selection)) {
                    setActiveStates(DEFAULT_ACTIVE_STATES);
                    return;
                }

                const bold = selection.hasFormat('bold');
                const italic = selection.hasFormat('italic');
                const underline = selection.hasFormat('underline');

                const anchorNode = selection.anchor.getNode();
                let element;
                try {
                    element = anchorNode.getKey() === 'root'
                        ? anchorNode
                        : anchorNode.getTopLevelElement() || anchorNode.getTopLevelElementOrThrow();
                } catch {
                    element = null;
                }

                let heading = null;
                let quote = false;
                let alignment = 'left';

                if (element) {
                    if ($isHeadingNode(element)) {
                        heading = element.getTag(); // 'h1', 'h2', 'h3'
                    }
                    if ($isQuoteNode(element)) {
                        quote = true;
                    }
                    const formatType = element.getFormatType?.();
                    if (formatType) {
                        alignment = formatType;
                    }
                }

                const textColor = $getSelectionStyleValueForProperty(selection, 'color', '');
                const highlightColor = $getSelectionStyleValueForProperty(selection, 'background-color', '');

                setActiveStates({
                    bold,
                    italic,
                    underline,
                    heading,
                    quote,
                    alignment,
                    textColor,
                    highlightColor,
                });
            });
        });
    }, [editor]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!colorPickerRef.current) return;
            if (!colorPickerRef.current.contains(event.target)) {
                setShowTextColorPicker(false);
                setShowHighlightColorPicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);


    const applyTextFormat = (format) => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)
    }

    const applyTextStyle = useCallback((styles) => {
        const sanitizedStyles = Object.fromEntries(
            Object.entries(styles).map(([key, value]) => [key, value ?? ''])
        );
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                $patchStyleText(selection, sanitizedStyles);
            }
        });
    }, [editor]);

    //heading node (H1, H2, H3)
    const setHeading = (tag) => {
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                const anchorNode = selection.anchor.getNode();

                let element;
                try {
                    element = anchorNode.getKey() === 'root'
                        ? anchorNode
                        : anchorNode.getTopLevelElement() || anchorNode.getTopLevelElementOrThrow();
                } catch (e) {
                    console.error('Could not get top level element:', e);
                    return;
                }

                if (!element) return;

                const type = typeof element.getType === 'function' ? element.getType() : null;

                if (type && type !== "paragraph" && type !== "heading" && type !== "root") {
                    return;
                }

                const isActive = $isHeadingNode(element) && element.getTag() === tag;

                $setBlocksType(selection, () =>
                    isActive ? $createParagraphNode() : $createHeadingNode(tag)
                );
            }
        })
    }

    //align element
    const setAlignment = (value) => {
        editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, value);
    }

    //quote block (toggle)
    const setQuote = () => {
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                const anchorNode = selection.anchor.getNode();

                let element;
                try {
                    element = anchorNode.getKey() === 'root'
                        ? anchorNode
                        : anchorNode.getTopLevelElement() || anchorNode.getTopLevelElementOrThrow();
                } catch (e) {
                    console.error('Could not get top level element:', e);
                    return;
                }

                if (!element) return;

                const type = typeof element.getType === 'function' ? element.getType() : null;
                if (type && type !== "paragraph" && type !== "heading" && type !== "quote" && type !== "root") {
                    return;
                }

                const isActive = $isQuoteNode(element);

                $setBlocksType(selection, () =>
                    isActive ? $createParagraphNode() : $createQuoteNode()
                );
            }
        })
    }

    //insert image
    const insertImageFromFile = async() => {

        const handleOnChange = async(e) => {
            const filedata = e.target.files?.[0];
            if(!filedata) return;

            const blobUrl = URL.createObjectURL(filedata);

            editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
                src: blobUrl,
                width: 500,
                height: 500,
                loading: true,
            })

            const formdata = new FormData();
            formdata.append('image', filedata);

            try {
                const data_url = await saveJournalImage(session?.access_token, formdata);
                if(!data_url){
                    // console.log('error: no image_url');
                    return;
                }

                const filePath = data_url.img_url.split('/journal-images/').pop();
                if (filePath && addUploadedImagePath) {
                    addUploadedImagePath(filePath);
                }

                editor.update(() => {
                    const root = editor.getEditorState()._nodeMap;
                    for (const [, node] of root) {
                        if (node.__type === 'image' && node.__src === blobUrl) {
                            node.getWritable().__src = data_url.img_url;
                            node.getWritable().__loading = false;
                            break;
                        }
                    }
                });

                URL.revokeObjectURL(blobUrl);
            } catch (err) {
                console.error('Image upload failed:', err);
            }
        }

        const input = document.createElement('input');
        input.type = 'file'
        input.accept = 'image/*';
        input.onchange = (e) => {handleOnChange(e)}

        input.click();
    };

    // Helper to get class name based on active state
    const getBtnClass = (isActive) => isActive ? 'is-active' : 'toolbar-bttns';

    return(
        <div className="toolbar">
            {/* Group 1: Image upload */}
            <div className="group">
                <div onMouseDown={(e) => e.preventDefault()} onClick={() => insertImageFromFile()} className="toolbar-bttns" title="Insert image">
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M480-480ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h320v80H200v560h560v-320h80v320q0 33-23.5 56.5T760-120H200Zm40-160h480L570-480 450-320l-90-120-120 160Zm440-320v-80h-80v-80h80v-80h80v80h80v80h-80v80h-80Z"/></svg>
                </div>
                {typeof onSwitchToCanvas === 'function' && (
                    <div onMouseDown={(e) => e.preventDefault()} onClick={onSwitchToCanvas} className="toolbar-bttns" title="Switch to Canvas">
                        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q63 0 121.5 18.5T709-807q-17 19-26 44t-9 52q0 53 37.5 90.5T802-583q27 0 52-9t44-26q36 49 54 107.5T970-480q0 83-31.5 156T853-197q-54 54-127 85.5T570-80H480Zm-12-196q30 0 51-21t21-51q0-30-21-51t-51-21q-30 0-51 21t-21 51q0 30 21 51t51 21Zm-153-84q24 0 42-18t18-42q0-24-18-42t-42-18q-24 0-42 18t-18 42q0 24 18 42t42 18Zm6-189q17 0 28.5-11.5T361-589q0-17-11.5-28.5T321-629q-17 0-28.5 11.5T281-589q0 17 11.5 28.5T321-549Zm183-66q36 0 60-24t24-60q0-36-24-60t-60-24q-36 0-60 24t-24 60q0 36 24 60t60 24Z"/></svg>
                    </div>
                )}
            </div>

            <div className="toolbar-divider" />

            {/* Group 2: Text formatting */}
            <div className="group">
                <div onMouseDown={(e) => e.preventDefault()} onClick={() => applyTextFormat('bold')} className={getBtnClass(activeStates.bold)} title="Bold">
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M272-200v-560h221q65 0 120 40t55 111q0 51-23 78.5T602-491q25 11 55.5 41t30.5 90q0 89-65 124.5T501-200H272Zm121-112h104q48 0 58.5-24.5T566-372q0-11-10.5-35.5T494-432H393v120Zm0-228h93q33 0 48-17t15-38q0-24-17-39t-44-15h-95v109Z"/></svg>
                </div>
                <div onMouseDown={(e) => e.preventDefault()} onClick={() => applyTextFormat('italic')} className={getBtnClass(activeStates.italic)} title="Italic">
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M200-200v-100h160l120-360H320v-100h400v100H580L460-300h140v100H200Z"/></svg>
                </div>
                <div onMouseDown={(e) => e.preventDefault()} onClick={() => applyTextFormat('underline')} className={getBtnClass(activeStates.underline)} title="Underline">
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M200-120v-80h560v80H200Zm280-160q-101 0-157-63t-56-167v-330h103v336q0 56 28 91t82 35q54 0 82-35t28-91v-336h103v330q0 104-56 167t-157 63Z"/></svg>
                </div>
            </div>

            <div className="toolbar-divider" />

            {/* Group 3: Headings */}
            <div className="group">
                <div onMouseDown={(e) => e.preventDefault()} onClick={() => setHeading('h1')} className={getBtnClass(activeStates.heading === 'h1')} title="Heading 1">
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M200-280v-400h80v160h160v-160h80v400h-80v-160H280v160h-80Zm480 0v-320h-80v-80h160v400h-80Z"/></svg>
                </div>
                <div onMouseDown={(e) => e.preventDefault()} onClick={() => setHeading('h2')} className={getBtnClass(activeStates.heading === 'h2')} title="Heading 2">
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M120-280v-400h80v160h160v-160h80v400h-80v-160H200v160h-80Zm400 0v-160q0-33 23.5-56.5T600-520h160v-80H520v-80h240q33 0 56.5 23.5T840-600v80q0 33-23.5 56.5T760-440H600v80h240v80H520Z"/></svg>
                </div>
                <div onMouseDown={(e) => e.preventDefault()} onClick={() => setHeading('h3')} className={getBtnClass(activeStates.heading === 'h3')} title="Heading 3">
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M120-280v-400h80v160h160v-160h80v400h-80v-160H200v160h-80Zm400 0v-80h240v-80H600v-80h160v-80H520v-80h240q33 0 56.5 23.5T840-600v240q0 33-23.5 56.5T760-280H520Z"/></svg>
                </div>
                <div onMouseDown={(e) => e.preventDefault()} onClick={() => setQuote()} className={getBtnClass(activeStates.quote)} title="Quote">
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M220-280q-50 0-85-35t-35-85q0-33 16-63t44-47l80-51v-159h160v240H300l-46 29q-14 9-14 26 0 17 12 29t28 12h140v104H220Zm420 0q-50 0-85-35t-35-85q0-33 16-63t44-47l80-51v-159h160v240H720l-46 29q-14 9-14 26 0 17 12 29t28 12h140v104H640Z"/></svg>
                </div>
            </div>

            <div className="toolbar-divider" />

            {/* Group 5: Text color + highlight */}
            <div className="group" ref={colorPickerRef}>
                <div className="toolbar-color-picker">
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                            setShowTextColorPicker((prev) => !prev);
                            setShowHighlightColorPicker(false);
                        }}
                        className="toolbar-color-trigger"
                        title="Text color"
                        aria-label="Text color"
                    >
                        <span className="toolbar-color-icon">A</span>
                        <span
                            className="toolbar-color-swatch"
                            style={{ backgroundColor: activeStates.textColor || 'transparent' }}
                        />
                    </button>
                    {showTextColorPicker && (
                        <div className="color-popover" onMouseDown={(e) => e.preventDefault()}>
                            {COLOR_PALETTE.map((color) => {
                                const isActive = isPaletteColorActive(activeStates.textColor, color.value);
                                const swatchClass = color.value
                                    ? 'color-swatch'
                                    : 'color-swatch is-default';
                                return (
                                    <button
                                        key={`text-${color.label}`}
                                        type="button"
                                        className={isActive ? `${swatchClass} is-selected` : swatchClass}
                                        title={color.label}
                                        aria-label={`Text color ${color.label}`}
                                        onClick={() => {
                                            applyTextStyle({ color: color.value });
                                            setShowTextColorPicker(false);
                                        }}
                                        style={{ backgroundColor: color.value || 'transparent' }}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="toolbar-color-picker">
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                            setShowHighlightColorPicker((prev) => !prev);
                            setShowTextColorPicker(false);
                        }}
                        className="toolbar-color-trigger"
                        title="Highlight"
                        aria-label="Highlight"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor">
                            <path d="m320-240 60-120 160 160-120 60-100-100ZM560-400l-240-240 60-60 240 240-60 60ZM660-300l-60-60 160-160 60 60-160 160ZM200-80v-80h560v80H200Zm500-580-60-60 60-60 60 60-60 60Z"/>
                        </svg>
                        <span
                            className="toolbar-color-swatch"
                            style={{ backgroundColor: activeStates.highlightColor || 'transparent' }}
                        />
                    </button>
                    {showHighlightColorPicker && (
                        <div className="color-popover" onMouseDown={(e) => e.preventDefault()}>
                            {COLOR_PALETTE.map((color) => {
                                const isActive = isPaletteColorActive(activeStates.highlightColor, color.value);
                                const swatchClass = color.value
                                    ? 'color-swatch'
                                    : 'color-swatch is-default';
                                return (
                                    <button
                                        key={`highlight-${color.label}`}
                                        type="button"
                                        className={isActive ? `${swatchClass} is-selected` : swatchClass}
                                        title={color.label}
                                        aria-label={`Highlight color ${color.label}`}
                                        onClick={() => {
                                            applyTextStyle({ 'background-color': color.value });
                                            setShowHighlightColorPicker(false);
                                        }}
                                        style={{ backgroundColor: color.value || 'transparent' }}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div className="toolbar-divider" />

            {/* Group 4: Alignment */}
            <div className="group">
                <div onMouseDown={(e) => e.preventDefault()} onClick={() => setAlignment('left')} className={getBtnClass(activeStates.alignment === 'left' || activeStates.alignment === '')} title="Align left">
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M120-120v-80h720v80H120Zm0-160v-80h480v80H120Zm0-160v-80h720v80H120Zm0-160v-80h480v80H120Zm0-160v-80h720v80H120Z"/></svg>
                </div>
                <div onMouseDown={(e) => e.preventDefault()} onClick={() => setAlignment('center')} className={getBtnClass(activeStates.alignment === 'center')} title="Align center">
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M120-120v-80h720v80H120Zm160-160v-80h400v80H280ZM120-440v-80h720v80H120Zm160-160v-80h400v80H280ZM120-760v-80h720v80H120Z"/></svg>
                </div>
                <div onMouseDown={(e) => e.preventDefault()} onClick={() => setAlignment('right')} className={getBtnClass(activeStates.alignment === 'right')} title="Align right">
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M120-760v-80h720v80H120Zm240 160v-80h480v80H360ZM120-440v-80h720v80H120Zm240 160v-80h480v80H360ZM120-120v-80h720v80H120Z"/></svg>
                </div>
            </div>
        </div>
    )
}
export default ToolBar;
