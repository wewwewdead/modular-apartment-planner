import React, { useCallback, useEffect, useState } from "react";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import ImagePlugin from "./nodes/Plugins/ImagePlugin";


import ToolBar from "./Toolbar";

import { saveJournal } from "../../../../API/Api";
import { useAuth } from "../../../Context/useAuth";
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { BarLoader } from "react-spinners";
import { $getRoot } from "lexical";


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

/* theme for mapping css classes to lexical rols */
const theme = {
    paragraph: 'editor-paragraph',
    heading: 'editor-heading',
}

const EditorInner = ({title, onclose, onCloseOnSave, addUploadImagesPath, setWordCount, wordCount, onSwitchToCanvas, promptId = null}) => {
    const [editor] = useLexicalComposerContext();
    const [editorState, setEditorState] = useState(null);
    const [hasContent, setHasContent] = useState(false);
    const [isSending, setIsSending] = useState(false);

    const {session, user} = useAuth();

    const queryClient = useQueryClient();

    const handleClickSave = async(e, title) =>{
        e.stopPropagation();
        setIsSending(true)
        try {
            const formdata = new FormData();
            if(title && editorState){
                formdata.append('title', title)
                formdata.append('content', editorState)
            }
            if(promptId){
                formdata.append('prompt_id', promptId);
            }
            const saveData = await saveJournal(session?.access_token, formdata)

            if(saveData){
                // console.log(saveData)
                queryClient.invalidateQueries({queryKey: ['journals']});
                queryClient.invalidateQueries({queryKey: ['userJournals', user?.userData?.[0].id]})
                queryClient.invalidateQueries({queryKey: ['streak', user?.userData?.[0]?.id]});
            }

            setIsSending(false)
        } catch (error) {
            console.error("Error saving journal:", error);
        }finally {
            setIsSending(false)
            setHasContent(false)
            onCloseOnSave();
            addUploadImagesPath([])
        }

    }

    const onchange = useCallback((state) => {
        const jsonb = JSON.stringify(state.toJSON());
        setEditorState(jsonb)

        state.read(() => {
            const root = $getRoot();

            const children = root.getChildren();

            const hasEnoughParagraphNodes = children.length > 1
            const hasParargraphSize = children[0]?.__size > 0

            const hasContent = hasParargraphSize || hasEnoughParagraphNodes
            setHasContent(hasContent);

            // Calculate word count
            const text = root.getTextContent().trim();
            const words = text ? text.split(/\s+/).length : 0;
            setWordCount(words);
        })
    }, [setWordCount])

    return(
        <>
        {/* Toolbar above content */}
        <div className="toolbar-wrapper">
            <ToolBar addUploadedImagePath={addUploadImagesPath} onSwitchToCanvas={onSwitchToCanvas}/>
        </div>

        {/* Bar loader directly under toolbar */}
        <div className="editor-loader-wrapper">
            {isSending && (
                <BarLoader loading={isSending} width={'100%'} height={3} color="var(--accent-purple)" speedMultiplier={0.7}/>
            )}
        </div>

        {/* Editor content area */}
        <div className="editor-shell">
            <RichTextPlugin
            contentEditable={
            <ContentEditable
            className="editor-input"
            aria-placeholder="Write your thoughts here..."
            placeholder={<div className="editor-placeholder">Write your thoughts here...</div>}/>
            }
            ErrorBoundary={LexicalErrorBoundary}
            />

            <ImagePlugin addUploadedImagePath={addUploadImagesPath}/>
            <HistoryPlugin/>
            <OnChangePlugin onChange={onchange}/>

        </div>

        {/* Footer: word count + save */}
        <div className='editor-footer'>
            <span className="editor-word-count">
                {wordCount} {wordCount === 1 ? 'word' : 'words'}
            </span>
            <button disabled={!title || !hasContent || isSending} onClick={(e) =>handleClickSave(e, title)} className={title && hasContent && !isSending ? 'editor-save-bttn' : 'editor-save-bttn-disabled'}>
                Share
            </button>
        </div>
        </>
    )
}

export default EditorInner;
