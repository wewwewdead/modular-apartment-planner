const DEFAULT_CANVAS_DOC = {
    version: 1,
    meta: {
        aspectRatio: '1:1',
        gridEnabled: true,
        theme: 'light'
    },
    snippets: [],
    images: [],
    doodles: []
};

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const normalizeSnippet = (snippet, index) => {
    if(!isPlainObject(snippet)){
        return null;
    }

    const text = typeof snippet.text === 'string' ? snippet.text : '';
    const parsedX = Number(snippet.x);
    const parsedY = Number(snippet.y);
    const parsedRotation = Number(snippet.rotation);
    const parsedZIndex = Number(snippet.zIndex);
    const parsedScaleX = Number(snippet.scaleX);
    const parsedSizeScale = Number(snippet.sizeScale);

    return {
        id: typeof snippet.id === 'string' && snippet.id ? snippet.id : `snippet-${index + 1}`,
        text: text,
        x: Number.isFinite(parsedX) ? Math.min(Math.max(parsedX, 0), 1) : 0.5,
        y: Number.isFinite(parsedY) ? Math.min(Math.max(parsedY, 0), 1) : 0.5,
        rotation: Number.isFinite(parsedRotation) ? parsedRotation : 0,
        zIndex: Number.isFinite(parsedZIndex) ? parsedZIndex : index,
        fontStyle: typeof snippet.fontStyle === 'string' ? snippet.fontStyle : 'serif',
        scaleX: Number.isFinite(parsedScaleX) && (parsedScaleX === 1 || parsedScaleX === -1) ? parsedScaleX : 1,
        sizeScale: Number.isFinite(parsedSizeScale) ? Math.min(Math.max(parsedSizeScale, 0.6), 2.5) : 1
    };
};

const normalizeImage = (image, index) => {
    if(!isPlainObject(image)){
        return null;
    }

    const parsedX = Number(image.x);
    const parsedY = Number(image.y);
    const parsedWidth = Number(image.width);
    const parsedHeight = Number(image.height);
    const parsedRotation = Number(image.rotation);
    const parsedZIndex = Number(image.zIndex);
    const parsedScaleX = Number(image.scaleX);

    return {
        id: typeof image.id === 'string' && image.id ? image.id : `image-${index + 1}`,
        src: typeof image.src === 'string' ? image.src : '',
        x: Number.isFinite(parsedX) ? Math.min(Math.max(parsedX, 0), 1) : 0.5,
        y: Number.isFinite(parsedY) ? Math.min(Math.max(parsedY, 0), 1) : 0.5,
        width: Number.isFinite(parsedWidth) ? Math.max(0.08, Math.min(parsedWidth, 1)) : 0.28,
        height: Number.isFinite(parsedHeight) ? Math.max(0.08, Math.min(parsedHeight, 1.2)) : 0.22,
        rotation: Number.isFinite(parsedRotation) ? parsedRotation : 0,
        zIndex: Number.isFinite(parsedZIndex) ? parsedZIndex : index,
        scaleX: Number.isFinite(parsedScaleX) && (parsedScaleX === 1 || parsedScaleX === -1) ? parsedScaleX : 1
    };
};

const normalizeDoodle = (doodle, index) => {
    if(!isPlainObject(doodle)){
        return null;
    }

    const rawPoints = Array.isArray(doodle.points) ? doodle.points : [];
    const points = rawPoints
        .map((point) => Number(point))
        .filter((point) => Number.isFinite(point))
        .map((point) => Math.min(Math.max(point, 0), 1));

    if(points.length < 4){
        return null;
    }

    const normalizedPoints = points.length % 2 === 0 ? points : points.slice(0, -1);
    if(normalizedPoints.length < 4){
        return null;
    }

    const parsedSize = Number(doodle.size);
    return {
        id: typeof doodle.id === 'string' && doodle.id ? doodle.id : `doodle-${index + 1}`,
        points: normalizedPoints,
        color: typeof doodle.color === 'string' && doodle.color.trim() ? doodle.color.trim().slice(0, 32) : '#5f92ff',
        size: Number.isFinite(parsedSize) ? Math.min(Math.max(parsedSize, 1), 14) : 2.8
    };
};

export const parseCanvasDoc = (rawCanvasDoc) => {
    if(!rawCanvasDoc){
        return {...DEFAULT_CANVAS_DOC};
    }

    try {
        const parsed = typeof rawCanvasDoc === 'string' ? JSON.parse(rawCanvasDoc) : rawCanvasDoc;
        if(!isPlainObject(parsed)){
            return {...DEFAULT_CANVAS_DOC};
        }

        const snippets = Array.isArray(parsed.snippets)
            ? parsed.snippets
                .map((snippet, index) => normalizeSnippet(snippet, index))
                .filter(Boolean)
            : [];
        const images = Array.isArray(parsed.images)
            ? parsed.images
                .map((image, index) => normalizeImage(image, index))
                .filter(Boolean)
            : [];
        const doodles = Array.isArray(parsed.doodles)
            ? parsed.doodles
                .map((doodle, index) => normalizeDoodle(doodle, index))
                .filter(Boolean)
            : [];

        return {
            version: 1,
            meta: {
                aspectRatio: parsed?.meta?.aspectRatio === '4:5' ? '4:5' : '1:1',
                gridEnabled: Boolean(parsed?.meta?.gridEnabled),
                theme: parsed?.meta?.theme === 'dark' ? 'dark' : 'light'
            },
            snippets: snippets,
            images: images,
            doodles: doodles
        };
    } catch (error) {
        console.error('Error parsing canvas doc:', error);
        return {...DEFAULT_CANVAS_DOC};
    }
};

export const getCanvasWholeText = (rawCanvasDoc) => {
    const canvasDoc = parseCanvasDoc(rawCanvasDoc);
    return canvasDoc.snippets
        .map((snippet) => snippet.text.trim())
        .filter(Boolean)
        .join(' ');
};

export const getCanvasPreview = (rawCanvasDoc, maxLength = 215) => {
    const wholeText = getCanvasWholeText(rawCanvasDoc);
    const slicedText = wholeText.length > maxLength ? `${wholeText.substring(0, maxLength)}...` : wholeText;

    return {
        wholeText: wholeText,
        slicedText: slicedText
    };
};
