import { useCallback, useEffect, useState } from 'react';
import './profilepostcards.css';
import '../../Editor/editor.css';
import { AnimatePresence, motion} from 'framer-motion';
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
    const [showNotes, setShowNotes] = useState(true);
    const [editorState , setEditorState] = useState(journalData?.content);
    const [isUpdatingJournal, setIsUpdatingJournal] = useState(false);
    const addUploadedImagePath = useCallback(() => {}, []);

    const handlClickCloseEditor = (e) =>{
        e.stopPropagation();
        onClose();
    }
    const handleCloseNotes = (e) =>{
        e.stopPropagation();
        setShowNotes(false);
    }

    const saveEditJournal = async(e, journalId, journalContent, title) =>{
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
                console.log(message)
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
        // console.log(jsonb)
        setEditorState(jsonb);
    }, [])

    useEffect(() => {
        console.log(journalData)
    }, [journalData])

    return(
        <>
        <AnimatePresence>
        <motion.div 
        className='edit-journal-container'
        initial={{opacity:0, scale:0}}
        animate={{scale:1, opacity: 1, transition: {type: 'spring', stiffness: 200, damping: 25}}}
        exit={{opacity: 0, scale: 0}}
        >
            {showNotes && (
                <div className='important-notes-container'>

                    <div className='notes-close-button-container'>
                        <div onClick={(e) => handleCloseNotes(e)} className='notes-close-button'>
                            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#d20000ff"><path d="m336-280-56-56 144-144-144-143 56-56 144 144 143-144 56 56-144 143 144 144-56 56-143-144-144 144Z"/></svg>
                        </div>
                    
                    </div>

                    <p>Important Notes!</p>
                    <p>
                        You can only edit the <em>Title</em> and the <em>Text</em>.
                        <br />
                        You can remove and resize the <em>Images</em> but you can't add new <em>Images</em>.
                    </p>

                </div>
            )}
            
            <div className='edit-journal-header-container'>

                <div className='first-child-header-container'>
                     <div onClick={(e) => handlClickCloseEditor(e)} className='edit-journal-close-bttn'>
                        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentcolor"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                    </div>
                    <div className='edit-journal-header'>
                        Edit Post
                    </div>
                </div>

                <div className='second-child-header-container'>
                    <div onClick={(e) => saveEditJournal(e, journalData?.id, editorState, title)} className='save-edit-button'>
                        Save edit
                    </div>
                </div>
               
            </div>

            <div className='title-container'>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className='edit-joutnal-title-input' type="text"/>
            </div>
            
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

            </LexicalComposer>

        </motion.div>
        </AnimatePresence>
        </>
    )
}

export default EditJournal;
