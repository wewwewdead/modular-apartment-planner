import { useState, useRef, useCallback, useEffect } from 'react';
import { searchUsers } from '../../../API/Api';

const MENTION_REGEX = /@([\w-]*)$/;
const DEBOUNCE_MS = 300;

const useMentionAutocomplete = (text, cursorPos, excludeUserId) => {
    const [results, setResults] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const debounceRef = useRef(null);
    const abortRef = useRef(null);

    useEffect(() => {
        const textUpToCursor = text.slice(0, cursorPos);
        const match = textUpToCursor.match(MENTION_REGEX);

        if (!match || match[1].length === 0) {
            setIsOpen(false);
            setResults([]);
            setQuery('');
            setSelectedIndex(0);
            return;
        }

        const q = match[1];
        setQuery(q);

        if (debounceRef.current) clearTimeout(debounceRef.current);

        debounceRef.current = setTimeout(async () => {
            if (abortRef.current) abortRef.current.abort();
            abortRef.current = new AbortController();
            const { signal } = abortRef.current;

            try {
                const res = await searchUsers(q, 6);
                if (signal.aborted) return;
                const filtered = excludeUserId
                    ? res?.data?.filter(u => u.id !== excludeUserId)
                    : res?.data;
                if (filtered && filtered.length > 0) {
                    setResults(filtered);
                    setSelectedIndex(0);
                    setIsOpen(true);
                } else {
                    setIsOpen(false);
                    setResults([]);
                }
            } catch {
                if (signal.aborted) return;
                setIsOpen(false);
                setResults([]);
            }
        }, DEBOUNCE_MS);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [text, cursorPos, excludeUserId]);

    const close = useCallback(() => {
        setIsOpen(false);
        setResults([]);
        setSelectedIndex(0);
    }, []);

    const moveUp = useCallback(() => {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    }, [results.length]);

    const moveDown = useCallback(() => {
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    }, [results.length]);

    return {
        results,
        selectedIndex,
        setSelectedIndex,
        isOpen,
        query,
        close,
        moveUp,
        moveDown,
    };
};

export default useMentionAutocomplete;
