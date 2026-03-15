import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { INSERT_IMAGE_COMMAND } from '../nodes/ImageNode';
import { saveJournalImage } from '../../../../../API/Api';

async function handleImageFile(file, editor, addUploadedImagePath, token) {
    if (!file || !file.type.startsWith('image/')) return;

    const blobUrl = URL.createObjectURL(file);

    editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
        src: blobUrl,
        width: 500,
        height: 500,
        loading: true,
    });

    const formdata = new FormData();
    formdata.append('image', file);

    try {
        const data_url = await saveJournalImage(token, formdata);
        if (!data_url) return;

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
        console.error('Paste/drop image upload failed:', err);
    }
}

export default function PasteImagePlugin({ addUploadedImagePath, token }) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        const rootElement = editor.getRootElement();
        if (!rootElement) return;

        const handlePaste = (e) => {
            const files = e.clipboardData?.files;
            if (!files || files.length === 0) return;

            for (const file of files) {
                if (file.type.startsWith('image/')) {
                    e.preventDefault();
                    handleImageFile(file, editor, addUploadedImagePath, token);
                    return;
                }
            }
        };

        const handleDrop = (e) => {
            const files = e.dataTransfer?.files;
            if (!files || files.length === 0) return;

            for (const file of files) {
                if (file.type.startsWith('image/')) {
                    e.preventDefault();
                    handleImageFile(file, editor, addUploadedImagePath, token);
                    return;
                }
            }
        };

        rootElement.addEventListener('paste', handlePaste);
        rootElement.addEventListener('drop', handleDrop);

        return () => {
            rootElement.removeEventListener('paste', handlePaste);
            rootElement.removeEventListener('drop', handleDrop);
        };
    }, [editor, addUploadedImagePath, token]);

    return null;
}
