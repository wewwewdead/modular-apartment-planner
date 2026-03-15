import { useEffect } from 'react';
import 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-markup';
import { registerCodeHighlighting } from '@lexical/code';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

export function CodeHighlightPlugin() {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        return registerCodeHighlighting(editor);
    }, [editor]);

    return null;
}
