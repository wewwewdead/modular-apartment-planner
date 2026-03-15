import { useState, useCallback, useEffect } from 'react';
import useMentionAutocomplete from './useMentionAutocomplete';

const MENTION_REGEX = /@([\w-]*)$/;

const useTextareaMention = (value, setValue, textareaRef, maxLength = Infinity, excludeUserId) => {
    const [cursorPos, setCursorPos] = useState(0);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

    const {
        results,
        selectedIndex,
        setSelectedIndex,
        isOpen,
        query,
        close,
        moveUp,
        moveDown,
    } = useMentionAutocomplete(value, cursorPos, excludeUserId);

    const updateDropdownPosition = useCallback(() => {
        if (!textareaRef.current) return;
        const rect = textareaRef.current.getBoundingClientRect();
        setDropdownPos({
            top: rect.bottom + 4,
            left: rect.left,
            width: rect.width,
        });
    }, [textareaRef]);

    useEffect(() => {
        if (isOpen) updateDropdownPosition();
    }, [isOpen, updateDropdownPosition]);

    const handleSelect = useCallback((user) => {
        const username = user.username;
        const textUpToCursor = value.slice(0, cursorPos);
        const match = textUpToCursor.match(MENTION_REGEX);

        if (!match) return;

        const beforeMention = textUpToCursor.slice(0, match.index);
        const afterCursor = value.slice(cursorPos);
        const newValue = `${beforeMention}@${username} ${afterCursor}`;

        if (newValue.length > maxLength) return;

        setValue(newValue);
        close();

        const newCursorPos = beforeMention.length + username.length + 2;
        requestAnimationFrame(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
            }
        });
    }, [value, cursorPos, setValue, close, textareaRef, maxLength]);

    const onChange = useCallback((e) => {
        setCursorPos(e.target.selectionStart || 0);
    }, []);

    const onKeyUp = useCallback((e) => {
        if (e.isComposing) return;
        setCursorPos(e.target.selectionStart || 0);
    }, []);

    const onKeyDown = useCallback((e) => {
        if (e.isComposing) return;
        if (!isOpen) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            moveDown();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            moveUp();
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            if (results.length > 0) {
                e.preventDefault();
                handleSelect(results[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            close();
        }
    }, [isOpen, moveDown, moveUp, results, selectedIndex, handleSelect, close]);

    return {
        textareaProps: {
            onChange,
            onKeyDown,
            onKeyUp,
        },
        dropdownProps: {
            isOpen,
            results,
            selectedIndex,
            onSelect: handleSelect,
            onHover: setSelectedIndex,
            position: dropdownPos,
            onClose: close,
        },
    };
};

export default useTextareaMention;
