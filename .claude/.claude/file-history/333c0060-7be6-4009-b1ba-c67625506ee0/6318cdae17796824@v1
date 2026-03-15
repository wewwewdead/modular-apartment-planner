import { useState, useRef, useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getNodeByKey } from 'lexical';
import { deleteJournalImage } from '../../../../API/Api';
import { useAuth } from '../../../Context/useAuth';
import { AnimatePresence, motion, scale } from 'framer-motion';

const ResizableImageComponent = ({ src ,nodeKey, width, height, loading = false, rotation = 0, isEditable = true }) => {
  const [editor] = useLexicalComposerContext();
  const [isResizing, setIsResizing] = useState(false);
  const [currentWidth, setCurrentWidth] = useState(width);
  const [currentHeight, setCurrentHeight] = useState(height);
  const [currentRotation, setCurrentRotation] = useState(rotation);
  const [isSelected, setIsSelected] = useState(false);
  const imageRef = useRef(null);
  const startPosRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const [viewImage, setViewImage] = useState(false);

  const{session} = useAuth();

  //handle delete image from the editor
  const deleteImgSync = async(imgUrl) => {
    try {
      const message = await deleteJournalImage(session?.access_token, imgUrl);
      if(message){
        // console.log(message.message)
      }
    } catch (error) {
      console.error("Failed to delete image from storage:", error);
    }
  }
  const handleDelete = async(e) =>{
    e.stopPropagation();
    let img_url = ''
    const data = {
      filepath: []
    }
    editor.update(() =>{
        const node = editor.getEditorState()._nodeMap.get(nodeKey);
        if(!node || !node.__src) {
          throw new Error('Node not found or missing source')
        }
        img_url = node.__src
        node.remove();
    });

    //only proceed if node was removed and img_url is set
    if(img_url){
      data.filepath.push(img_url)
      await deleteImgSync(data.filepath);
    }
  }

  const handleRotate = (e) => {
    e.stopPropagation();
    const newRotation = (currentRotation + 90) % 360;
    setCurrentRotation(newRotation);

    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (node && typeof node.setRotation === 'function') {
        node.setRotation(newRotation);
      }
    }, {
      onUpdate: () => {
        editor.update(() => {});
      }
    });
  };

  // handle mouse down on resize handle
  const handleMouseDown = (e, corner) => {
    // e.preventDefault();
    e.stopPropagation();
    
    const isTouchStart = e.type === 'touchstart';
    const clientX = isTouchStart ? e.touches[0].clientX : e.clientX;
    const clientY = isTouchStart ? e.touches[0].clientY : e.clientY;
    
    setIsResizing(true);
    startPosRef.current = {
      x: clientX,
      y: clientY,
      width: currentWidth || 300,
      height: currentHeight || 200,
    };

    const handleMouseMove = (moveEvent) => {
        const isTouchMove = moveEvent.type === 'touchmove'
        const moveX = isTouchMove ? moveEvent.touches[0].clientX : moveEvent.clientX;
        const moveY = isTouchMove ? moveEvent.touches[0].clientY : moveEvent.clientY;

        const deltaX = (moveX - startPosRef.current.x) / 8;
        const deltaY = (moveY - startPosRef.current.y) / 8;

        let newWidth, newHeight;

        if (corner === 'se') {
            // southeast corner - resize proportionally
            const aspectRatio =startPosRef.current.width / startPosRef.current.height;
            newWidth = Math.max(100, startPosRef.current.width + deltaX);
            newHeight = newWidth / aspectRatio;
        } else if (corner === 'e') {
            // east side - resize width only
            newWidth = Math.max(100, startPosRef.current.width + deltaX);
            newHeight = currentHeight;
        } else if (corner === 's') {
            // south side - resize height only
            newWidth = currentWidth;
            newHeight = Math.max(100, startPosRef.current.height + deltaY);
        } else if(corner === 'ne') {
            // northeast corner - resize proportionally
            const aspectRatio = startPosRef.current.width / startPosRef.current.height;
            newWidth = Math.max(100, startPosRef.current.width + deltaX)
            newHeight = newWidth / aspectRatio
        } else if (corner === 'sw') {
            // southwest corner - resize proportionally
            const aspectRatio = startPosRef.current.width / startPosRef.current.height;
            newWidth = Math.max(100, startPosRef.current.width - deltaX)
            newHeight = newWidth / aspectRatio
        } else if (corner === 'nw') {
            // northhwest corner - resize proportionally
            const aspectRatio = startPosRef.current.width / startPosRef.current.height;
            newWidth = Math.max(100, startPosRef.current.width - deltaX)
            newHeight = newWidth / aspectRatio
        }  else if(corner === 'n') {
            // south side - resize height only
            newWidth = currentWidth;
            newHeight = Math.max(100, startPosRef.current.height - deltaY);
        }

        const roundedWidth = Math.round(newWidth);
        const roundedHeight = Math.round(newHeight);

        setCurrentWidth(roundedWidth);
        setCurrentHeight(roundedHeight);
        startPosRef.current.width = roundedWidth;
        startPosRef.current.height = roundedHeight;
    };
    
    const handleMouseUp = () => {
        setIsResizing(false);

        const finalWidth = startPosRef.current.width;
        const finalHeight = startPosRef.current.height;

        // console.log(`Saving: ${finalWidth}x${finalHeight}`);//for debugging
      
        // update the Lexical node with new dimensions
        editor.update(() => {
            const node = $getNodeByKey(nodeKey);
            if (node && typeof node.setWidthAndHeight === 'function') {
                node.setWidthAndHeight(finalWidth, finalHeight);
            }
        }, {
                onUpdate: () => {
                //forcing a statechange so if user resize the image it will update the editorstate
                editor.update(() =>{
                //empty because i only used this for triggering the OnChangePlugin
                    })
                }
            }
        );

        //remove all listeners after mouse up
        document.removeEventListener('touchmove', handleMouseMove)
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchend', handleMouseUp)
    };

    //add all event listerner after mouse down or mouse hold click 
    document.addEventListener('touchmove', handleMouseMove, {passive: false})
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleMouseUp)
};


  // handle image click for selection
  const handleImageClick = () => {
    setIsSelected(!isSelected);
  };

  //handle image  click for view
  const handleViewImage = () => {
    // console.log('view img')
    if(!isEditable){
      setViewImage(true)
    } else {
      return
    }
    
  }

  // click outside to deselect
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (imageRef.current && !imageRef.current.contains(e.target)) {
        setIsSelected(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
    {viewImage && (
      <img
        onClick={() => setViewImage(!viewImage)}
        className='image-view'
        src={src}
        alt="view-image"
        style={{
          transform: `rotate(${currentRotation}deg) scale(1.2)`,
          transition: 'transform 0.3s ease',
        }}
      />
    )}

    <div
    className='image-wrapper'
      ref={imageRef}
      style={{
        cursor: isResizing ? 'nwse-resize' : 'pointer',
      }}
      onClick={isEditable ? handleImageClick : handleViewImage}
    >
   
      <AnimatePresence>
      <motion.img
        initial={{opacity: 0}}
        animate={{opacity: 1, transition: {type: 'spring', stiffness: 300, damping: 25, mass: 0.8}}}
        exit={{ opacity: 0, y: -20,
          transition: { 
            duration: 0.2,
            ease: "easeOut"
          }
        }}

        src={src}
        alt="content"
        style={{
          borderRadius: '5px',
          width: `${currentWidth}px`,
          height: `${currentHeight}px`,
          display: 'block',
          border: isSelected ? '1px solid rgba(153, 200, 255, 0.99)' : '2px solid transparent',
          userSelect: 'none',
          transform: `rotate(${currentRotation}deg)`,
          transition: isResizing ? 'none' : 'transform 0.3s ease',
        }}
        draggable={false}
        onClick={() => handleViewImage()}
        className='image-content'
      />
      </AnimatePresence>

      {loading && (
        <div className="image-loading-overlay">
          <div className="image-loading-spinner" />
        </div>
      )}

      {isEditable && (
      <div className='image-actions'>
        <div onClick={(e) => handleRotate(e)} className='image-action-btn' title='Rotate image'>
          <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#FFFFFF"><path d="M482-160q-134 0-228-93t-94-227q0-134 94-228t228-94q62 0 118 23t98 65V-840h80v240H538v-80h128q-30-38-74.5-59T482-740q-100 0-170 70.5T242-480q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z"/></svg>
        </div>
        <div onClick={(e) => handleDelete(e)} className='image-action-btn' title='Delete image'>
          <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#FFFFFF"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
        </div>
      </div>
      )}

      {isSelected && isEditable &&(
        <>
          {/* southeast corner handle - proportional resize */}
          <div
            onMouseDown={(e) => handleMouseDown(e, 'se')}
            onTouchStart={(e) => handleMouseDown(e, 'se')}
            className='southeast-side-handle'
          />

          {/* southwest corner handle - proportional resize */}
          <div
            onMouseDown={(e) => handleMouseDown(e, 'sw')}
            onTouchStart={(e) => handleMouseDown(e, 'sw')} 
            className='southwest-side-handle'
          />

          {/* northeast corner handle - proportional resize */}
          <div
            onMouseDown={(e) => handleMouseDown(e, 'ne')}
            onTouchStart={(e) => handleMouseDown(e, 'ne')} 
            className='northeast-side-handle'
          />

          {/* northwest corner handle - proportional resize */}
          <div
            onMouseDown={(e) => handleMouseDown(e, 'nw')}
            onTouchStart={(e) => handleMouseDown(e, 'nw')} 
            className='northwest-side-handle'
          />

          {/* east side handle - width only */}
          <div
            onMouseDown={(e) => handleMouseDown(e, 'e')}
            onTouchStart={(e) => handleMouseDown(e, 'e')} 
            className='east-side-handle'
          />

          {/* south side handle - height only */}
          <div
            onMouseDown={(e) => handleMouseDown(e, 's')}
            onTouchStart={(e) => handleMouseDown(e, 's')} 
            className='south-side-handle'
          />

           {/* north side handle - height only */}
          <div
            onMouseDown={(e) => handleMouseDown(e, 'n')}
            onTouchStart={(e) => handleMouseDown(e, 'n')} 
            className='north-side-handle'
          />

          {/* dimensions display */}
          <div
          className='dimension-display'
          >
            {currentWidth} × {currentHeight}
          </div>
        </>
      )}
    </div>
    </>
  );
}
export default ResizableImageComponent;
