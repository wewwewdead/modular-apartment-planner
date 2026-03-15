import { useCallback, useState } from 'react';
import './profilepostcards.css';
import '../../Editor/editor.css';
import { motion } from 'framer-motion';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import ImageNode from '../../Editor/nodes/ImageNode';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import ToolBar from '../../Editor/Toolbar';
import ImagePlugin from '../../Editor/nodes/Plugins/ImagePlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { updateJournal } from '../../../../../API/Api';
import { useAuth } from '../../../../Context/useAuth';
import { BarLoader } from 'react-spinners';
import { useQueryClient } from '@tanstack/react-query';

const EditJournal = ({onClose, journalData}) => {
    const {session, user} = useAuth();
    const queryClient = useQueryClient();

    const theme = {
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
        }
    }

    const [title, setTitle] = useState(journalData?.title);
    const [editorState , setEditorState] = useState(journalData?.content);
    const [isUpdatingJournal, setIsUpdatingJournal] = useState(false);
    const addUploadedImagePath = useCallback(() => {}, []);

    const handleClickCloseEditor = (e) => {
        e.stopPropagation();
        onClose();
    }

    const saveEditJournal = async(e, journalId, journalContent, title) => {
        e.stopPropagation();
        const formdata = new FormData();
        if(journalId){
            formdata.append('journalId', journalId)
        }
        if(journalContent){
            formdata.append('content', journalContent)
        }
        if(title){
            formdata.append('title', title);
        }

        try {
            setIsUpdatingJournal(true)
            const message = await updateJournal(session?.access_token, formdata);
            if(message){
                // console.log(message)
            }

            queryClient.invalidateQueries(['userJournals', user?.userData?.[0].id])

            setIsUpdatingJournal(false)
            setTitle(null)
            setEditorState(null)
            onClose();
        } catch (error) {
            console.error("Error updating journal:", error);
        } finally {
            setTitle(null)
            setEditorState(null)
            setIsUpdatingJournal(false)
            onClose()
        }
    }

    const onChange = useCallback((state) => {
        const jsonb = JSON.stringify(state.toJSON());
        setEditorState(jsonb);
    }, [])

    return(
        <div className='editor-parent-container' onClick={handleClickCloseEditor}>
            <motion.div
                className='editor-container'
                initial={{scale: 0, opacity: 0.8}}
                animate={{scale: 1, opacity: 1}}
                exit={{scale: 0.8, opacity: 0}}
                transition={{type: 'spring', stiffness: 260, damping: 25}}
                onClick={(e) => e.stopPropagation()}
            >
                <div className='editor-close-bttn-container'>
                    <button
                        onClick={handleClickCloseEditor}
                        className='editor-close-bttn'
                        aria-label="Close editor"
                        title="Close"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                    </button>
                </div>

                <input
                    value={title || ''}
                    onChange={(e) => setTitle(e.target.value)}
                    className='content-title-input'
                    type="text"
                    placeholder='Title'
                />

                <LexicalComposer initialConfig={{
                    namespace: 'editContent',
                    theme: theme,
                    editable: true,
                    editorState: typeof journalData?.content === 'string'
                    ? journalData.content : JSON.stringify(journalData?.content),
                    nodes: [HeadingNode, ImageNode, QuoteNode],
                    onError(error){
                        throw error
                    },
                }}>
                    <div className="toolbar-wrapper">
                        <ToolBar addUploadedImagePath={addUploadedImagePath}/>
                    </div>

                    <div className="editor-loader-wrapper">
                        {isUpdatingJournal && (
                            <BarLoader loading={isUpdatingJournal} width={'100%'} height={3} color="var(--accent-purple)" speedMultiplier={0.7}/>
                        )}
                    </div>

                    <div className="editor-shell">
                        <RichTextPlugin
                            contentEditable={
                                <ContentEditable
                                    className="editor-input"
                                    aria-placeholder="Edit your post..."
                                    placeholder={<div className="editor-placeholder">Edit your post...</div>}
                                />
                            }
                            ErrorBoundary={LexicalErrorBoundary}
                        />

                        <ImagePlugin addUploadedImagePath={addUploadedImagePath}/>
                        <HistoryPlugin/>
                        <OnChangePlugin onChange={onChange}/>
                    </div>

                    <div className='editor-footer'>
                        <span></span>
                        <button
                            onClick={(e) => saveEditJournal(e, journalData?.id, editorState, title)}
                            className='editor-save-bttn'
                            disabled={isUpdatingJournal}
                        >
                            Save edit
                        </button>
                    </div>
                </LexicalComposer>
            </motion.div>
        </div>
    )
}

export default EditJournal;
