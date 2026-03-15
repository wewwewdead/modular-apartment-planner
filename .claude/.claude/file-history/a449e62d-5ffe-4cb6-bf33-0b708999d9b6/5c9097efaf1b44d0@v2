import { useEffect, useMemo, useRef, useState } from "react";
import { parseCanvasDoc } from "../../../utils/canvasDoc";
import CanvasSurface, { buildSortedCanvasObjects, getCanvasStageHeight } from "./CanvasSurface";
import styles from "./CanvasEditor.module.css";
import "./canvas.css";

const CANVAS_MAX_WIDTH = 560;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const CanvasViewer = ({canvasDoc}) => {
    const shellRef = useRef(null);
    const stageRef = useRef(null);

    const [shellWidth, setShellWidth] = useState(CANVAS_MAX_WIDTH);

    const parsedCanvasDoc = useMemo(() => parseCanvasDoc(canvasDoc), [canvasDoc]);
    const sortedObjects = useMemo(
        () => buildSortedCanvasObjects(parsedCanvasDoc?.snippets || [], parsedCanvasDoc?.images || []),
        [parsedCanvasDoc?.images, parsedCanvasDoc?.snippets]
    );

    useEffect(() => {
        const getContentWidth = () => {
            const el = shellRef.current;
            if(!el){
                return CANVAS_MAX_WIDTH;
            }
            const style = getComputedStyle(el);
            const paddingLeft = parseFloat(style.paddingLeft) || 0;
            const paddingRight = parseFloat(style.paddingRight) || 0;
            return el.clientWidth - paddingLeft - paddingRight;
        };

        const updateShellWidth = () => {
            setShellWidth(getContentWidth());
        };

        updateShellWidth();
        window.addEventListener("resize", updateShellWidth);

        let resizeObserver = null;
        if(typeof ResizeObserver !== "undefined" && shellRef.current){
            resizeObserver = new ResizeObserver(updateShellWidth);
            resizeObserver.observe(shellRef.current);
        }

        return () => {
            window.removeEventListener("resize", updateShellWidth);
            if(resizeObserver){
                resizeObserver.disconnect();
            }
        };
    }, []);

    const stageWidth = useMemo(() => Math.max(240, Math.min(CANVAS_MAX_WIDTH, shellWidth)), [shellWidth]);
    const stageHeight = getCanvasStageHeight(stageWidth, parsedCanvasDoc?.meta?.aspectRatio);
    const doodleStrokeScale = useMemo(() => clamp(stageWidth / CANVAS_MAX_WIDTH, 0.45, 1), [stageWidth]);

    return (
        <div className={`${styles.editorRoot} ${styles.viewerRoot}`}>
            <div
                ref={shellRef}
                className={`${styles.stageShell} ${parsedCanvasDoc?.meta?.theme === "dark" ? styles.isDark : ""}`}
            >
                <div className={styles.stageFrame}>
                    <CanvasSurface
                        stageRef={stageRef}
                        viewportWidth={stageWidth}
                        viewportHeight={stageHeight}
                        stageWidth={stageWidth}
                        stageHeight={stageHeight}
                        gridEnabled={parsedCanvasDoc?.meta?.gridEnabled}
                        theme={parsedCanvasDoc?.meta?.theme}
                        doodles={parsedCanvasDoc?.doodles || []}
                        doodleStrokeScale={doodleStrokeScale}
                        sortedObjects={sortedObjects}
                        activeTool="select"
                        className={styles.stage}
                    />
                </div>
            </div>
        </div>
    );
};

export default CanvasViewer;
