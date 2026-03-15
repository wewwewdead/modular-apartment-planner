import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

function ImageComponent({ src, nodeKey }){
  const [editor] = useLexicalComposerContext();
  const handleDelete = (e) => {
    e.stopPropagation();
    editor.update(() => {
      const node = editor.getEditorState()._nodeMap.get(nodeKey);
      if (node) {
        try {
          node.remove();
        } catch (error) {
          console.error("Failed to remove image node:", error);
        }
      }
    });
  };

  return (
    
    <div className="image-wrapper">
      <img src={src} alt="content image" className="content_images" />
      <div className="image-delete" onClick={handleDelete}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          height="24px"
          viewBox="0 -960 960 960"
          width="24px"
          fill="#FFFFFF"
          aria-label="Delete image"
        >
          <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
        </svg>
      </div>
    </div>
  );
}
export default ImageComponent;