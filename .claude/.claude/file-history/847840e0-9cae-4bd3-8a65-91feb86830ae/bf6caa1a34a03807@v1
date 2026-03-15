import { useState } from "react";
import { useAuth } from "../../Context/useAuth";
import { addOpinion } from "../../../API/Api";
import { BarLoader } from "react-spinners";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";

const OpinionEditor = ({onClose}) =>{
    const [opinion, setOpinion] = useState('');
    const {session} = useAuth();
    const [isSaving, setIsSaving] = useState(false);

    const queryClient = useQueryClient();

    const handleCloseEditor = () =>{
        onClose();
    }

    const handleClickSave = async(e) =>{
        e.stopPropagation();
        if(isSaving){
            return;
        }
        const formdata = new FormData();
        formdata.append('opinion', opinion)

        try {
            setIsSaving(true);

            const message = await addOpinion(formdata, session?.access_token);
            if(message){
                // console.log(message)
            }
            setIsSaving(false)
            queryClient.invalidateQueries({ queryKey: ['getOpinions'] });
            queryClient.invalidateQueries({ queryKey: ['getMyOpinions'] });
        } catch (error) {
            setIsSaving(false)
            setOpinion('')
            throw new Error('error uploading data')
        } finally {
            setOpinion('')
            onClose();
        }

    }

    const charCount = opinion.length;
    const isNearLimit = charCount > 259;
    const isAtLimit = charCount > 279;

    return(
        <AnimatePresence>
        <motion.div
            className="oe-backdrop"
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.2}}
            onClick={handleCloseEditor}
        >
            <motion.div
                className="oe-card"
                initial={{opacity: 0, scale: 0.95, y: 12}}
                animate={{opacity: 1, scale: 1, y: 0, transition: {type: 'spring', stiffness: 300, damping: 25, mass: 0.8}}}
                exit={{opacity: 0, scale: 0.95, y: 12, transition: {duration: 0.15, ease: 'easeOut'}}}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="oe-header">
                    <p className="oe-title">Share your opinion</p>
                    <button className="oe-close-btn" onClick={handleCloseEditor} aria-label="Close editor">
                        <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"></path></svg>
                    </button>
                </div>

                <div className="oe-body">
                    <textarea
                        maxLength={280}
                        value={opinion}
                        onChange={(e) => setOpinion(e.target.value)}
                        className="oe-textarea"
                        name="opinions"
                        placeholder="What's on your mind..."
                        rows={5}
                    />
                </div>

                <div className="oe-footer">
                    <span className={`oe-char-count ${isAtLimit ? 'oe-char-limit' : isNearLimit ? 'oe-char-warn' : ''}`}>
                        {charCount}/280
                    </span>

                    <button
                        onClick={(e) => handleClickSave(e)}
                        disabled={!opinion || isSaving}
                        className={`oe-save-btn ${!opinion || isSaving ? 'oe-save-disabled' : ''}`}
                    >
                        {isSaving ? 'Saving...' : 'Post'}
                    </button>
                </div>

                {isSaving && (
                    <div className="oe-loader">
                        <BarLoader loading={isSaving} width={'100%'} color="var(--accent-sage)" speedMultiplier={0.7}/>
                    </div>
                )}
            </motion.div>
        </motion.div>
        </AnimatePresence>
    )
}

export default OpinionEditor;