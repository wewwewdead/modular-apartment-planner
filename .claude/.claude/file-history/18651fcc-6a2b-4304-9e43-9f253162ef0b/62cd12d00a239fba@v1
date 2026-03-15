import './editor.css';
import { motion } from "framer-motion";
import React, { useCallback, useEffect, useState } from 'react';
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import EditorInner from './RichTextEditor.jsx';
import CanvasEditor from '../Canvas/CanvasEditor.jsx';
import { $getRoot } from 'lexical';
import { deleteJournalImage } from '../../../../API/Api.js';
import { useAuth } from '../../../Context/useAuth.js';

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return <div>Error: {this.state.error.message}</div>;
    }
    return this.props.children;
  }
}

const Editor=({onClose, initialMode = 'text', initialTitle = '', initialCanvasDoc = null, remixSource = null}) =>{
    const {session} = useAuth();

    const [editorMode, setEditorMode] = useState(initialMode === 'canvas' ? 'canvas' : 'text');
    const [title, setTitle] = useState(initialTitle || '')
    const [wordCount, setWordCount] = useState(0);
    const [editor] = useLexicalComposerContext();


    const [uploadedImagePaths, setUploadedImagePaths] = useState([]);

    const addUploadedImagePath = useCallback((imagePath) =>{
      setUploadedImagePaths((prev) => [...prev, imagePath]);
    }, [])

    useEffect(() => {
        setEditorMode(initialMode === 'canvas' ? 'canvas' : 'text');
        setTitle(initialTitle || '');
    }, [initialMode, initialTitle]);

    const handleCloseEditor = useCallback(async() => {
      if(uploadedImagePaths.length > 0){
        const message = await deleteJournalImage(session?.access_token, uploadedImagePaths)
        if(message){
          console.log(message.message)
        }

      }
        editor.update(() => {
            const state = editor.getEditorState().toJSON();
            console.log(state)

            const root = $getRoot();
            root.clear();
            onClose();
        })
    }, [editor, onClose, session?.access_token, uploadedImagePaths])

    const handleCloseEditorOnSave = useCallback(async() => {
      editor.update(() => {
            const state = editor.getEditorState().toJSON();
            console.log(state)

            const root = $getRoot();
            root.clear();
            onClose();
      })
    }, [onClose, editor])

    return(
        <>
        <div className='editor-parent-container'>

            <motion.div
            initial={{scale: 0, opacity: 0.8}}
            animate={{scale: 1, opacity: 1}}
            exit={{scale: 0.8, opacity: 0,}}
            transition={{type: 'spring', stiffness: 260, damping: 25}}
            className={`editor-container ${editorMode === 'canvas' ? 'is-canvas-mode' : ''}`}
            >
                <div className='editor-close-bttn-container'>
                    <button
                        onClick={() => handleCloseEditor()}
                        className='editor-close-bttn'
                        aria-label="Close editor"
                        title="Close"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                    </button>
                </div>

                <input value={title} onChange={(e) => setTitle(e.target.value)} className='content-title-input' type="text" placeholder='Title' />

                <div className='canvas-editor-controls' style={{marginBottom: "0.55rem"}}>
                    <button
                        type="button"
                        onClick={() => setEditorMode('text')}
                        className={`canvas-control-btn ${editorMode === 'text' ? 'is-active' : ''} composer-mode-btn`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M160-200v-80h240v-80H240q-33 0-56.5-23.5T160-440v-200q0-33 23.5-56.5T240-720h480v80H240v200h480v80H560v80h240v80H160Z"/></svg>
                        Text Post
                    </button>
                    <button
                        type="button"
                        onClick={() => setEditorMode('canvas')}
                        className={`canvas-control-btn ${editorMode === 'canvas' ? 'is-active' : ''} composer-mode-btn`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q63 0 121.5 18.5T709-807q-17 19-26 44t-9 52q0 53 37.5 90.5T802-583q27 0 52-9t44-26q36 49 54 107.5T970-480q0 83-31.5 156T853-197q-54 54-127 85.5T570-80H480Zm-12-196q30 0 51-21t21-51q0-30-21-51t-51-21q-30 0-51 21t-21 51q0 30 21 51t51 21Zm-153-84q24 0 42-18t18-42q0-24-18-42t-42-18q-24 0-42 18t-18 42q0 24 18 42t42 18Zm6-189q17 0 28.5-11.5T361-589q0-17-11.5-28.5T321-629q-17 0-28.5 11.5T281-589q0 17 11.5 28.5T321-549Zm183-66q36 0 60-24t24-60q0-36-24-60t-60-24q-36 0-60 24t-24 60q0 36 24 60t60 24Z"/></svg>
                        Switch to Canvas
                    </button>
                </div>

                <div className={`editor-mode-shell ${editorMode === 'canvas' ? 'is-canvas-mode' : ''}`}>
                    <ErrorBoundary>
                        {editorMode === 'text' ? (
                            <EditorInner
                                addUploadImagesPath={addUploadedImagePath}
                                onclose={handleCloseEditor}
                                onCloseOnSave={handleCloseEditorOnSave}
                                title={title}
                                setWordCount={setWordCount}
                                wordCount={wordCount}
                                onSwitchToCanvas={() => setEditorMode('canvas')}
                            />
                        ) : (
                            <CanvasEditor
                                title={title}
                                onCloseOnSave={handleCloseEditorOnSave}
                                addUploadedImagePath={addUploadedImagePath}
                                initialCanvasDoc={initialCanvasDoc}
                                remixSource={remixSource}
                            />
                        )}
                    </ErrorBoundary>
                </div>
            </motion.div>
        </div>
        </>
    )
}
export default Editor;
