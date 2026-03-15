
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Shape, Stage, Text } from "react-konva";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    clearMyFreedomWallDoodles,
    createFreedomWallItem,
    deleteFreedomWallItem,
    getCurrentFreedomWallWeek,
    getFreedomWallItems,
    getFreedomWallWeeks,
    reportFreedomWallItem,
    updateFreedomWallItem
} from "../../../../API/Api";
import { useAuth } from "../../../Context/useAuth";
import supabase from "../../../utils/supabaseClient";
import "./freedomWall.css";

const STAMP_ICONS = {
    heart: "❤️",
    star: "⭐",
    fire: "🔥",
    sparkles: "✨",
    wow: "💥"
};

const STICKER_OPTIONS = {
    dog: "🐶", cat: "🐱", bear: "🐻", unicorn: "🦄",
    rocket: "🚀", rainbow: "🌈", sun: "🌞", moon: "🌙",
    flower: "🌸", tree: "🌳", pizza: "🍕", guitar: "🎸"
};

const NOTE_FONT_OPTIONS = [
    "Arial",
    "Georgia",
    "Courier New",
    "Trebuchet MS",
    "Times New Roman"
];

const NOTE_STYLE_OPTIONS = ["normal", "bold", "italic"];
const WALL_MAX_WIDTH = 1080;
const WALL_MAX_HEIGHT = 900;
const WALL_ASPECT_RATIO = 0.64;
const GRID_SIZE = 36;
const REPORTABLE_ITEM_TYPES = new Set(["doodle"]);
const ERASER_RADIUS_PX = 18;
const ERASER_MOVE_THROTTLE_MS = 16;
const MINIMAP_WIDTH = 100;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const getWallSizeScale = (stageWidth) => clamp(stageWidth / WALL_MAX_WIDTH, 0.25, 1);

const snapToGrid = (px, gridSize = GRID_SIZE) => Math.round(px / gridSize) * gridSize;

const sortItemsByZIndex = (items = []) => [...items].sort((a, b) => {
    const zDiff = (a?.z_index || 0) - (b?.z_index || 0);
    if(zDiff !== 0){
        return zDiff;
    }

    const dateDiff = new Date(a?.created_at || 0) - new Date(b?.created_at || 0);
    if(dateDiff !== 0){
        return dateDiff;
    }

    return String(a?.id || "").localeCompare(String(b?.id || ""));
});

const upsertById = (items = [], nextItem) => {
    const existingIndex = items.findIndex((item) => String(item?.id) === String(nextItem?.id));
    if(existingIndex === -1){
        return [...items, nextItem];
    }

    const nextItems = [...items];
    const previousItem = nextItems[existingIndex];
    nextItems[existingIndex] = {
        ...previousItem,
        ...nextItem,
        payload: {
            ...(previousItem?.payload || {}),
            ...(nextItem?.payload || {})
        },
        users: nextItem?.users || previousItem?.users || null
    };
    return nextItems;
};

const removeById = (items = [], itemId) => items.filter((item) => String(item?.id) !== String(itemId));

const distancePointToSegment = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if(dx === 0 && dy === 0){
        return Math.hypot(px - x1, py - y1);
    }

    const t = clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy), 0, 1);
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
};

const isPointerNearDoodle = (pointerX, pointerY, doodle, radiusPx = ERASER_RADIUS_PX) => {
    if(!doodle?.points || doodle.points.length < 4){
        return false;
    }

    const strokeWidth = Math.max(1, Number(doodle.strokeWidth) || 3);
    const hitDistance = radiusPx + strokeWidth * 0.5;

    const points = doodle.points;
    for(let i = 0; i < points.length - 2; i += 2){
        const dist = distancePointToSegment(
            pointerX,
            pointerY,
            points[i],
            points[i + 1],
            points[i + 2],
            points[i + 3]
        );
        if(dist <= hitDistance){
            return true;
        }
    }

    return false;
};

const emojiCanvasCache = new Map();

const useEmojiImage = (emoji, resolution = 128) => {
    const [image, setImage] = useState(() => emojiCanvasCache.get(`${emoji}-${resolution}`) || null);

    useEffect(() => {
        if(!emoji){
            setImage(null);
            return;
        }

        const cacheKey = `${emoji}-${resolution}`;
        const cached = emojiCanvasCache.get(cacheKey);
        if(cached){
            setImage(cached);
            return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = resolution;
        canvas.height = resolution;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, resolution, resolution);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `${Math.round(resolution * 0.78)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.fillText(emoji, resolution / 2, resolution / 2);

        const img = new window.Image();
        img.onload = () => {
            emojiCanvasCache.set(cacheKey, img);
            setImage(img);
        };
        img.src = canvas.toDataURL();
    }, [emoji, resolution]);

    return image;
};

const StickerNode = ({item, stageWidth, stageHeight, isSelected, canEdit, onSelect, onDragEnd, isDraft}) => {
    const emoji = STICKER_OPTIONS[item?.payload?.sticker] || "🐶";
    const image = useEmojiImage(emoji);
    const wallSizeScale = getWallSizeScale(stageWidth);
    const scale = clamp(Number(item?.payload?.scale) || 1, 0.25, 6);
    const size = clamp(64 * scale * wallSizeScale, 20 * wallSizeScale, 420 * wallSizeScale);
    const x = clamp((Number(item?.payload?.x) || 0.5) * stageWidth, 0, Math.max(0, stageWidth - size));
    const y = clamp((Number(item?.payload?.y) || 0.5) * stageHeight, 0, Math.max(0, stageHeight - size));
    const showBorder = isDraft || isSelected;

    if(!image){
        return null;
    }

    return (
        <>
            <KonvaImage
                x={x}
                y={y}
                width={size}
                height={size}
                image={image}
                draggable={canEdit}
                onClick={onSelect}
                onTap={onSelect}
                onDragEnd={onDragEnd}
                rotation={Number(item?.payload?.rotation) || 0}
            />
            {showBorder && (
                <Rect
                    x={x}
                    y={y}
                    width={size}
                    height={size}
                    stroke={isDraft ? "#a21caf" : "#4f46e5"}
                    strokeWidth={2}
                    dash={[6, 4]}
                    listening={false}
                />
            )}
        </>
    );
};

const StampNode = ({item, stageWidth, stageHeight, canEdit, onSelect, onDragEnd, isSelected, isDraft}) => {
    const stamp = STAMP_ICONS[item?.payload?.stamp] || "✨";
    const image = useEmojiImage(stamp, 64);
    const wallSizeScale = getWallSizeScale(stageWidth);
    const scale = clamp(Number(item?.payload?.scale) || 1, 0.35, 5);
    const size = clamp(34 * scale * wallSizeScale, 14 * wallSizeScale, 220 * wallSizeScale);
    const x = clamp((Number(item?.payload?.x) || 0.5) * stageWidth, 0, Math.max(0, stageWidth - size));
    const y = clamp((Number(item?.payload?.y) || 0.5) * stageHeight, 0, Math.max(0, stageHeight - size));
    const showBorder = isDraft || isSelected;

    if(!image){
        return null;
    }

    return (
        <>
            <KonvaImage
                x={x}
                y={y}
                width={size}
                height={size}
                image={image}
                draggable={canEdit}
                onClick={onSelect}
                onTap={onSelect}
                onDragEnd={onDragEnd}
                rotation={Number(item?.payload?.rotation) || 0}
            />
            {showBorder && (
                <Rect
                    x={x}
                    y={y}
                    width={size}
                    height={size}
                    stroke={isDraft ? "#a21caf" : "#0f766e"}
                    strokeWidth={2}
                    dash={[6, 4]}
                    listening={false}
                />
            )}
        </>
    );
};

const darkenColor = (hex, amount = 0.15) => {
    const raw = hex?.replace("#", "") || "fff4a8";
    const num = parseInt(raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw, 16);
    const r = Math.max(0, Math.round(((num >> 16) & 255) * (1 - amount)));
    const g = Math.max(0, Math.round(((num >> 8) & 255) * (1 - amount)));
    const b = Math.max(0, Math.round((num & 255) * (1 - amount)));
    return `rgb(${r},${g},${b})`;
};

const NoteNode = ({
    item,
    stageWidth,
    stageHeight,
    canEdit,
    onSelect,
    onDragEnd,
    isSelected,
    isDraft
}) => {
    const payload = item?.payload || {};
    const wallSizeScale = getWallSizeScale(stageWidth);
    const width = clamp((Number(payload?.width) || 0.26) * stageWidth, 110 * wallSizeScale, stageWidth * 0.9);
    const height = clamp((Number(payload?.height) || 0.2) * stageHeight, 60 * wallSizeScale, stageHeight * 0.8);
    const x = clamp((Number(payload?.x) || 0.45) * stageWidth, 0, Math.max(0, stageWidth - width));
    const y = clamp((Number(payload?.y) || 0.45) * stageHeight, 0, Math.max(0, stageHeight - height));
    const fontStyle = NOTE_STYLE_OPTIONS.includes(payload?.fontStyle) ? payload.fontStyle : "normal";
    const bgColor = payload?.bgColor || "#fff4a8";
    const curlSize = Math.min(width, height) * 0.14;
    const pinSize = Math.max(5, Math.min(width, height) * 0.04);

    const borderStroke = isDraft ? "#a21caf" : isSelected ? "#a21caf" : "rgba(0,0,0,0.1)";
    const borderWidth = isDraft ? 2 : isSelected ? 2 : 0.5;
    const borderDash = isDraft ? [6, 4] : undefined;

    return (
        <Group
            x={x}
            y={y}
            draggable={canEdit}
            onDragEnd={onDragEnd}
            onClick={onSelect}
            onTap={onSelect}
            rotation={Number(payload?.rotation) || 0}
        >
            {/* Shadow layer beneath the note */}
            <Shape
                sceneFunc={(ctx, shape) => {
                    ctx.beginPath();
                    ctx.moveTo(2, 4);
                    ctx.lineTo(width + 2, 2);
                    ctx.lineTo(width - curlSize + 4, height + 3);
                    ctx.lineTo(2, height + 2);
                    ctx.closePath();
                    ctx.fillStrokeShape(shape);
                }}
                fill="rgba(0,0,0,0.12)"
                listening={false}
            />

            {/* Main note body */}
            <Shape
                sceneFunc={(ctx, shape) => {
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(width, 0);
                    ctx.lineTo(width, height - curlSize);
                    ctx.lineTo(width - curlSize, height);
                    ctx.lineTo(0, height);
                    ctx.closePath();
                    ctx.fillStrokeShape(shape);
                }}
                fill={bgColor}
                stroke={borderStroke}
                strokeWidth={borderWidth}
                dash={borderDash}
            />

            {/* Page curl triangle */}
            <Shape
                sceneFunc={(ctx, shape) => {
                    ctx.beginPath();
                    ctx.moveTo(width, height - curlSize);
                    ctx.lineTo(width - curlSize, height - curlSize);
                    ctx.lineTo(width - curlSize, height);
                    ctx.closePath();
                    ctx.fillStrokeShape(shape);
                }}
                fill={darkenColor(bgColor, 0.12)}
                listening={false}
            />

            {/* Curl fold shadow */}
            <Shape
                sceneFunc={(ctx, shape) => {
                    ctx.beginPath();
                    ctx.moveTo(width - curlSize, height);
                    ctx.lineTo(width, height - curlSize);
                    ctx.lineTo(width - curlSize * 0.55, height - curlSize * 0.55);
                    ctx.closePath();
                    ctx.fillStrokeShape(shape);
                }}
                fill="rgba(0,0,0,0.06)"
                listening={false}
            />

            {/* Text content */}
            <Text
                x={12}
                y={pinSize * 2 + 10}
                width={width - 24}
                height={height - pinSize * 2 - curlSize - 16}
                text={payload?.text || ""}
                fontFamily={payload?.fontFamily || "Arial"}
                fontStyle={fontStyle}
                fontSize={clamp((Number(payload?.fontSize) || 16) * wallSizeScale, 10 * wallSizeScale, 64 * wallSizeScale)}
                fill={payload?.fontColor || "#1f2937"}
                wrap="word"
                lineHeight={1.3}
            />

            {/* Left push pin */}
            <Circle x={width * 0.18} y={pinSize + 2} radius={pinSize} fill="#e63946" stroke="#b71c2a" strokeWidth={1} listening={false} />
            <Line points={[width * 0.18, pinSize * 2 + 2, width * 0.18, pinSize * 2 + 6]} stroke="#999" strokeWidth={1.5} listening={false} />

            {/* Right push pin */}
            <Circle x={width * 0.82} y={pinSize + 2} radius={pinSize} fill="#e63946" stroke="#b71c2a" strokeWidth={1} listening={false} />
            <Line points={[width * 0.82, pinSize * 2 + 2, width * 0.82, pinSize * 2 + 6]} stroke="#999" strokeWidth={1.5} listening={false} />

            {/* Pin highlights (glossy effect) */}
            <Circle x={width * 0.18 - pinSize * 0.25} y={pinSize * 0.7 + 2} radius={pinSize * 0.3} fill="rgba(255,255,255,0.45)" listening={false} />
            <Circle x={width * 0.82 - pinSize * 0.25} y={pinSize * 0.7 + 2} radius={pinSize * 0.3} fill="rgba(255,255,255,0.45)" listening={false} />
        </Group>
    );
};

const CURSOR_COLORS = ["#a21caf", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

const getCursorColor = (userId) => {
    let hash = 0;
    const str = String(userId);
    for(let i = 0; i < str.length; i++){
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
};

const PuffEffect = ({x, y, id, onComplete}) => {
    const [progress, setProgress] = useState(0);
    const startRef = useRef(null);
    const particlesRef = useRef(null);

    if(!particlesRef.current){
        const count = 6 + Math.floor(Math.random() * 3);
        particlesRef.current = Array.from({length: count}, () => ({
            angle: Math.random() * Math.PI * 2,
            distance: 30 + Math.random() * 20,
            color: Math.random() > 0.5 ? "#a21caf" : "#e879f9"
        }));
    }

    useEffect(() => {
        const duration = 500;
        let animId;

        const animate = (timestamp) => {
            if(!startRef.current) startRef.current = timestamp;
            const elapsed = timestamp - startRef.current;
            const p = Math.min(elapsed / duration, 1);
            setProgress(p);

            if(p < 1){
                animId = requestAnimationFrame(animate);
            } else {
                onComplete(id);
            }
        };

        animId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animId);
    }, [id, onComplete]);

    const particles = particlesRef.current;
    const eased = 1 - Math.pow(1 - progress, 2);

    return (
        <Group x={x} y={y} listening={false}>
            <Circle
                radius={eased * 28}
                stroke="#e879f9"
                strokeWidth={Math.max(0.5, 2 * (1 - progress))}
                opacity={1 - progress}
            />
            {particles.map((p, i) => (
                <Circle
                    key={i}
                    x={Math.cos(p.angle) * p.distance * eased}
                    y={Math.sin(p.angle) * p.distance * eased}
                    radius={Math.max(0.5, 3.5 * (1 - progress))}
                    fill={p.color}
                    opacity={1 - progress}
                />
            ))}
        </Group>
    );
};

const RemoteCursor = ({cursor, stageWidth, stageHeight}) => {
    const px = cursor.x * stageWidth;
    const py = cursor.y * stageHeight;
    const color = getCursorColor(cursor.userId);
    const displayName = (cursor.userName || "User").slice(0, 10);

    return (
        <Group x={px} y={py} listening={false}>
            <Circle radius={5} fill={color} opacity={0.85} />
            <Text
                x={8}
                y={4}
                text={displayName}
                fontSize={11}
                fill={color}
                fontStyle="bold"
                opacity={0.8}
            />
        </Group>
    );
};

const formatWeekLabel = (week = null) => {
    if(!week?.week_start || !week?.week_end){
        return "No active week";
    }

    const startDate = new Date(week.week_start);
    const endDate = new Date(week.week_end);
    return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()} (UTC)`;
};

const formatResetCountdown = (weekEnd, nowMs) => {
    if(!weekEnd){
        return "No reset scheduled";
    }

    const endTimeMs = new Date(weekEnd).getTime();
    if(Number.isNaN(endTimeMs)){
        return "No reset scheduled";
    }

    const diffMs = endTimeMs - nowMs;
    if(diffMs <= 0){
        return "Reset imminent";
    }

    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if(days > 0){
        return `${days} day${days === 1 ? "" : "s"}, ${hours} hour${hours === 1 ? "" : "s"}`;
    }

    if(hours > 0){
        return `${hours} hour${hours === 1 ? "" : "s"}, ${minutes} min${minutes === 1 ? "" : "s"}`;
    }

    return `${minutes} min${minutes === 1 ? "" : "s"}`;
};

const isCanvasBackgroundTarget = (target, stage) => {
    if(!target || !stage){
        return false;
    }

    if(target === stage){
        return true;
    }

    return target.getParent?.() === stage;
};

const FreedomWallPage = () => {
    const {session, user, openAuthModal} = useAuth();
    const queryClient = useQueryClient();
    const shellRef = useRef(null);
    const draftDoodleRef = useRef([]);
    const [shellWidth, setShellWidth] = useState(980);
    const [activeTool, setActiveTool] = useState("doodle");
    const [doodleColor, setDoodleColor] = useState("#5f92ff");
    const [doodleSize, setDoodleSize] = useState(3.2);
    const [draftDoodlePoints, setDraftDoodlePoints] = useState([]);
    const [isDrawing, setIsDrawing] = useState(false);
    const [selectedSticker, setSelectedSticker] = useState("dog");
    const [wallError, setWallError] = useState(null);
    const [selectedStamp, setSelectedStamp] = useState("heart");
    const [selectedItemId, setSelectedItemId] = useState(null);
    const [draftNote, setDraftNote] = useState(null);
    const [draftSticker, setDraftSticker] = useState(null);
    const [draftStamp, setDraftStamp] = useState(null);
    const [showClearDoodlesModal, setShowClearDoodlesModal] = useState(false);
    const [noteEditor, setNoteEditor] = useState({
        text: "",
        fontFamily: "Arial",
        fontStyle: "normal",
        fontColor: "#1f2937",
        bgColor: "#fff4a8",
        fontSize: 16,
        width: 0.26,
        height: 0.2
    });
    const [placementPuffs, setPlacementPuffs] = useState([]);
    const [remoteCursors, setRemoteCursors] = useState({});
    const [stageScale, setStageScale] = useState(1);
    const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
    const [isErasing, setIsErasing] = useState(false);
    const [timeCapsuleWeekId, setTimeCapsuleWeekId] = useState(null);
    const [nowMs, setNowMs] = useState(() => Date.now());
    const stageRef = useRef(null);
    const isPinchingRef = useRef(false);
    const lastPinchDistRef = useRef(null);
    const lastPinchCenterRef = useRef(null);
    const erasedThisStrokeRef = useRef(new Set());
    const eraseLastTickRef = useRef(0);
    const clientIdRef = useRef(`fw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const realtimeChannelRef = useRef(null);
    const lastCursorBroadcastRef = useRef(0);
    const minimapDragRef = useRef({
        isActive: false,
        pointerId: null,
        offsetX: 0,
        offsetY: 0,
        consumedClick: false
    });
    const minimapPendingRef = useRef(null);
    const minimapFrameRef = useRef(null);
    const minimapSuppressClickRef = useRef(false);

    const authToken = session?.access_token || null;
    const currentUser = user?.userData?.[0] || null;
    const currentUserId = currentUser?.id || null;
    const canWrite = Boolean(currentUserId);

    const {
        data: activeWeekData,
        isLoading: isWeekLoading,
        error: weekError
    } = useQuery({
        queryKey: ["freedomWallCurrentWeek"],
        queryFn: () => getCurrentFreedomWallWeek(authToken),
        refetchOnWindowFocus: true,
        staleTime: 30 * 1000
    });

    const activeWeek = activeWeekData?.week || null;
    const activeWeekId = activeWeek?.id || null;

    const {
        data: weeksData,
        isLoading: isWeeksLoading
    } = useQuery({
        queryKey: ["freedomWallWeeks"],
        queryFn: () => getFreedomWallWeeks({limit: 8}, authToken),
        refetchOnWindowFocus: true,
        staleTime: 60 * 1000
    });

    const recentWeeks = useMemo(() => Array.isArray(weeksData?.weeks) ? weeksData.weeks : [], [weeksData?.weeks]);
    const previousWeek = useMemo(() => {
        if(!activeWeekId){
            return recentWeeks[0] || null;
        }

        return recentWeeks.find((week) => String(week?.id) !== String(activeWeekId)) || null;
    }, [activeWeekId, recentWeeks]);

    const isTimeCapsuleMode = Boolean(timeCapsuleWeekId && String(timeCapsuleWeekId) !== String(activeWeekId));
    const effectiveWeekId = isTimeCapsuleMode ? timeCapsuleWeekId : activeWeekId;
    const viewedWeek = useMemo(() => {
        if(!isTimeCapsuleMode){
            return activeWeek;
        }
        return recentWeeks.find((week) => String(week?.id) === String(timeCapsuleWeekId)) || null;
    }, [activeWeek, isTimeCapsuleMode, recentWeeks, timeCapsuleWeekId]);
    const weekId = effectiveWeekId;
    const countdownText = useMemo(() => formatResetCountdown(activeWeek?.week_end, nowMs), [activeWeek?.week_end, nowMs]);

    const itemsQueryKey = useMemo(() => ["freedomWallItems", weekId], [weekId]);

    const {
        data: itemsData,
        isLoading: isItemsLoading
    } = useQuery({
        queryKey: itemsQueryKey,
        queryFn: () => getFreedomWallItems(weekId, {limit: 400}, authToken),
        enabled: Boolean(weekId),
        refetchOnWindowFocus: false,
        staleTime: 20 * 1000
    });

    useEffect(() => {
        const interval = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if(!timeCapsuleWeekId){
            return;
        }

        const stillExists = recentWeeks.some((week) => String(week?.id) === String(timeCapsuleWeekId));
        if(!stillExists || String(timeCapsuleWeekId) === String(activeWeekId)){
            setTimeCapsuleWeekId(null);
        }
    }, [activeWeekId, recentWeeks, timeCapsuleWeekId]);

    useEffect(() => {
        const updateShellWidth = () => {
            const nextWidth = shellRef.current?.clientWidth || 980;
            setShellWidth(nextWidth);
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

    const stageWidth = useMemo(() => clamp(shellWidth - 12, 280, WALL_MAX_WIDTH), [shellWidth]);
    const stageHeight = useMemo(() => (
        Math.min(Math.round(stageWidth * WALL_ASPECT_RATIO), WALL_MAX_HEIGHT)
    ), [stageWidth]);
    const wallSizeScale = useMemo(() => getWallSizeScale(stageWidth), [stageWidth]);
    const minimapHeight = useMemo(() => Math.round(MINIMAP_WIDTH * (stageHeight / stageWidth)), [stageHeight, stageWidth]);
    const minimapViewport = useMemo(() => {
        const width = clamp((1 / stageScale) * MINIMAP_WIDTH, 4, MINIMAP_WIDTH);
        const height = clamp((1 / stageScale) * minimapHeight, 4, minimapHeight);
        const maxLeft = Math.max(0, MINIMAP_WIDTH - width);
        const maxTop = Math.max(0, minimapHeight - height);
        const left = clamp((-stagePosition.x / stageScale) / stageWidth * MINIMAP_WIDTH, 0, maxLeft);
        const top = clamp((-stagePosition.y / stageScale) / stageHeight * minimapHeight, 0, maxTop);
        return { left, top, width, height };
    }, [minimapHeight, stageHeight, stagePosition.x, stagePosition.y, stageScale, stageWidth]);

    const sortedItems = useMemo(() => sortItemsByZIndex(itemsData?.data || []), [itemsData?.data]);
    const doodleEraseTargets = useMemo(() => (
        sortedItems
            .filter((item) => item?.item_type === "doodle")
            .map((item) => {
                const points = Array.isArray(item?.payload?.points)
                    ? item.payload.points
                        .map((point) => Number(point))
                        .filter((point) => !Number.isNaN(point))
                    : [];

                if(points.length < 4){
                    return null;
                }

                return {
                    id: item.id,
                    strokeWidth: (Number(item?.payload?.size) || 3) * wallSizeScale,
                    points: points.map((point, pointIndex) => (
                        pointIndex % 2 === 0 ? point * stageWidth : point * stageHeight
                    ))
                };
            })
            .filter(Boolean)
    ), [sortedItems, stageHeight, stageWidth, wallSizeScale]);

    const maxZIndex = useMemo(() => {
        if(!sortedItems.length){
            return 0;
        }
        return sortedItems.reduce((maxValue, item) => Math.max(maxValue, Number(item?.z_index) || 0), 0);
    }, [sortedItems]);

    const selectedItem = useMemo(() => {
        if(!selectedItemId){
            return null;
        }
        return sortedItems.find((item) => String(item?.id) === String(selectedItemId)) || null;
    }, [selectedItemId, sortedItems]);

    const selectedNote = useMemo(() => (
        selectedItem?.item_type === "note" ? selectedItem : null
    ), [selectedItem]);

    const selectedItemCanEdit = Boolean(selectedItem && currentUserId && String(selectedItem.user_id) === String(currentUserId));
    const myDoodleCount = useMemo(() => sortedItems.filter((item) => (
        item?.item_type === "doodle" &&
        currentUserId &&
        String(item?.user_id) === String(currentUserId)
    )).length, [currentUserId, sortedItems]);

    useEffect(() => {
        if(!selectedNote){
            return;
        }

        const payload = selectedNote.payload || {};
        setNoteEditor({
            text: payload.text || "",
            fontFamily: payload.fontFamily || "Arial",
            fontStyle: NOTE_STYLE_OPTIONS.includes(payload.fontStyle) ? payload.fontStyle : "normal",
            fontColor: payload.fontColor || "#1f2937",
            bgColor: payload.bgColor || "#fff4a8",
            fontSize: clamp(Number(payload.fontSize) || 16, 10, 64),
            width: clamp(Number(payload.width) || 0.26, 0.12, 0.8),
            height: clamp(Number(payload.height) || 0.2, 0.1, 0.7)
        });
    }, [selectedNote]);

    useEffect(() => {
        if(activeTool !== "note"){
            setDraftNote(null);
        }
        if(activeTool !== "sticker"){
            setDraftSticker(null);
        }
        if(activeTool !== "stamp"){
            setDraftStamp(null);
        }
        if(activeTool !== "eraser"){
            setIsErasing(false);
            erasedThisStrokeRef.current.clear();
        }
    }, [activeTool]);

    useEffect(() => {
        setSelectedItemId(null);
        setDraftNote(null);
        setDraftSticker(null);
        setDraftStamp(null);
        setIsDrawing(false);
        setDraftDoodlePoints([]);
        draftDoodleRef.current = [];
        erasedThisStrokeRef.current.clear();
        setIsErasing(false);
    }, [weekId]);

    const setItemsCache = useCallback((updater) => {
        if(!weekId){
            return;
        }

        queryClient.setQueryData(itemsQueryKey, (old) => {
            const previousItems = Array.isArray(old?.data) ? old.data : [];
            const nextItems = sortItemsByZIndex(updater(previousItems));
            return {
                ...(old || {}),
                data: nextItems,
                hasMore: false,
                nextCursor: null
            };
        });
    }, [itemsQueryKey, queryClient, weekId]);

    const createItemMutation = useMutation({
        mutationFn: ({payload}) => createFreedomWallItem(authToken, payload),
        onMutate: async({payload}) => {
            const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const optimisticItem = {
                id: optimisticId,
                week_id: payload.weekId,
                user_id: currentUserId,
                item_type: payload.itemType,
                payload: payload.payload,
                z_index: payload.zIndex || 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                deleted_at: null,
                users: currentUser ? {
                    id: currentUser.id,
                    name: currentUser.name,
                    image_url: currentUser.image_url,
                    badge: currentUser.badge
                } : null
            };

            setItemsCache((items) => [...items, optimisticItem]);

            const itemPayload = payload.payload;
            let pxX, pxY;
            if(payload.itemType === "doodle" && Array.isArray(itemPayload.points) && itemPayload.points.length >= 4){
                const pts = itemPayload.points;
                const midIdx = Math.floor(pts.length / 2);
                const midXIdx = midIdx % 2 === 0 ? midIdx : midIdx - 1;
                pxX = (pts[midXIdx] || 0.5) * stageWidth;
                pxY = (pts[midXIdx + 1] || 0.5) * stageHeight;
            } else {
                pxX = (itemPayload.x || 0.5) * stageWidth;
                pxY = (itemPayload.y || 0.5) * stageHeight;
            }
            setPlacementPuffs((prev) => [...prev, {id: optimisticId, x: pxX, y: pxY, startedAt: Date.now()}]);

            return {optimisticId: optimisticId};
        },
        onSuccess: (response, _variables, context) => {
            const createdItem = response?.item;
            if(!createdItem?.id){
                return;
            }

            setItemsCache((items) => {
                const withoutOptimistic = context?.optimisticId
                    ? removeById(items, context.optimisticId)
                    : items;
                return upsertById(withoutOptimistic, createdItem);
            });
        },
        onError: (error, variables, context) => {
            console.error("Freedom Wall create error:", error, "variables:", variables);
            if(context?.optimisticId){
                setItemsCache((items) => removeById(items, context.optimisticId));
            }
            const message = error?.message || error?.error || "Failed to place item";
            setWallError(message);
            setTimeout(() => setWallError((prev) => prev === message ? null : prev), 4000);
        }
    });

    const updateItemMutation = useMutation({
        mutationFn: ({itemId, payload}) => updateFreedomWallItem(authToken, itemId, payload),
        onMutate: async({itemId, payload}) => {
            let previousItem = null;
            setItemsCache((items) => {
                previousItem = items.find((item) => String(item?.id) === String(itemId)) || null;
                if(!previousItem){
                    return items;
                }

                return items.map((item) => {
                    if(String(item?.id) !== String(itemId)){
                        return item;
                    }

                    const mergedPayload = payload?.payload !== undefined
                        ? {...(item?.payload || {}), ...(payload.payload || {})}
                        : item?.payload;

                    return {
                        ...item,
                        payload: mergedPayload,
                        z_index: payload?.zIndex !== undefined ? payload.zIndex : item?.z_index
                    };
                });
            });
            return {previousItem: previousItem};
        },
        onSuccess: (response) => {
            const updatedItem = response?.item;
            if(!updatedItem?.id){
                return;
            }

            setItemsCache((items) => upsertById(items, updatedItem));
        },
        onError: (_error, variables, context) => {
            if(!context?.previousItem){
                return;
            }

            setItemsCache((items) => upsertById(items, context.previousItem));
            if(variables?.itemId){
                setSelectedItemId(String(variables.itemId));
            }
        }
    });

    const deleteItemMutation = useMutation({
        mutationFn: ({itemId}) => deleteFreedomWallItem(authToken, itemId),
        onMutate: async({itemId}) => {
            let removedItem = null;
            setItemsCache((items) => {
                removedItem = items.find((item) => String(item?.id) === String(itemId)) || null;
                return removeById(items, itemId);
            });
            return {removedItem: removedItem};
        },
        onError: (_error, _variables, context) => {
            if(!context?.removedItem){
                return;
            }
            setItemsCache((items) => upsertById(items, context.removedItem));
        }
    });

    const reportItemMutation = useMutation({
        mutationFn: ({itemId}) => reportFreedomWallItem(authToken, itemId),
        onMutate: async({itemId}) => {
            let previousItems = [];
            setItemsCache((items) => {
                previousItems = items;
                return removeById(items, itemId);
            });

            if(String(selectedItemId) === String(itemId)){
                setSelectedItemId(null);
            }

            return {previousItems: previousItems};
        },
        onError: (error, _variables, context) => {
            const message = error?.message || error?.error || "Failed to erase doodle";
            const isNotFound = /not found/i.test(String(message));

            if(!isNotFound && Array.isArray(context?.previousItems)){
                setItemsCache(() => context.previousItems);
            }

            if(isNotFound){
                return;
            }

            setWallError(message);
            setTimeout(() => setWallError((prev) => prev === message ? null : prev), 4000);
        }
    });

    const clearMyDoodlesMutation = useMutation({
        mutationFn: ({weekId}) => clearMyFreedomWallDoodles(authToken, weekId),
        onMutate: async() => {
            let previousItems = [];
            setItemsCache((items) => {
                previousItems = items;
                return items.filter((item) => !(
                    item?.item_type === "doodle" &&
                    currentUserId &&
                    String(item?.user_id) === String(currentUserId)
                ));
            });

            if(selectedItem?.item_type === "doodle" && selectedItemCanEdit){
                setSelectedItemId(null);
            }

            return {previousItems: previousItems};
        },
        onError: (error, _variables, context) => {
            if(Array.isArray(context?.previousItems)){
                setItemsCache(() => context.previousItems);
            }

            const message = error?.message || error?.error || "Failed to clear doodles";
            setWallError(message);
            setTimeout(() => setWallError((prev) => prev === message ? null : prev), 4000);
        }
    });

    useEffect(() => {
        if(!activeWeekId || isTimeCapsuleMode){
            return;
        }

        const channel = supabase
            .channel(`freedom-wall-${activeWeekId}`)
            .on(
                "postgres_changes",
                {event: "*", schema: "public", table: "freedom_wall_items", filter: `week_id=eq.${activeWeekId}`},
                (payload) => {
                    const eventType = payload?.eventType;
                    const oldRow = payload?.old || null;
                    const newRow = payload?.new || null;

                    if(eventType === "DELETE" && oldRow?.id){
                        setItemsCache((items) => removeById(items, oldRow.id));
                        return;
                    }

                    if(!newRow?.id){
                        return;
                    }

                    if(newRow?.deleted_at){
                        setItemsCache((items) => removeById(items, newRow.id));
                        return;
                    }

                    setItemsCache((items) => {
                        const previous = items.find((item) => String(item?.id) === String(newRow.id)) || null;
                        const fallbackUsers = previous?.users || (currentUserId && String(newRow.user_id) === String(currentUserId)
                            ? {
                                id: currentUser?.id,
                                name: currentUser?.name,
                                image_url: currentUser?.image_url,
                                badge: currentUser?.badge
                            }
                            : null);
                        const normalized = {
                            ...newRow,
                            users: fallbackUsers
                        };

                        return upsertById(items, normalized);
                    });
                }
            )
            .on("broadcast", {event: "cursor-move"}, ({payload: cursorPayload}) => {
                if(!cursorPayload || cursorPayload.clientId === clientIdRef.current) return;
                setRemoteCursors((prev) => ({
                    ...prev,
                    [cursorPayload.clientId]: {...cursorPayload, updatedAt: Date.now()}
                }));
            })
            .on("broadcast", {event: "cursor-leave"}, ({payload: leavePayload}) => {
                if(!leavePayload?.clientId) return;
                setRemoteCursors((prev) => {
                    const next = {...prev};
                    delete next[leavePayload.clientId];
                    return next;
                });
            })
            .subscribe();

        realtimeChannelRef.current = channel;

        return () => {
            if(realtimeChannelRef.current){
                realtimeChannelRef.current.send({
                    type: "broadcast",
                    event: "cursor-leave",
                    payload: {clientId: clientIdRef.current}
                });
            }
            supabase.removeChannel(channel);
            realtimeChannelRef.current = null;
        };
    }, [activeWeekId, currentUser?.badge, currentUser?.id, currentUser?.image_url, currentUser?.name, currentUserId, isTimeCapsuleMode, setItemsCache]);

    const ensureCanWrite = useCallback(() => {
        if(isTimeCapsuleMode){
            const message = "Time Capsule is read-only. Switch to Live Wall to edit.";
            setWallError(message);
            setTimeout(() => setWallError((prev) => prev === message ? null : prev), 4000);
            return false;
        }

        if(!activeWeekId){
            return false;
        }

        if(canWrite){
            return true;
        }
        openAuthModal?.();
        return false;
    }, [activeWeekId, canWrite, isTimeCapsuleMode, openAuthModal]);

    const tryEraseAtPointer = useCallback((stage, options = {}) => {
        if(!stage || !canWrite || isTimeCapsuleMode || activeTool !== "eraser"){
            return;
        }

        const now = Date.now();
        if(!options?.force && now - eraseLastTickRef.current < ERASER_MOVE_THROTTLE_MS){
            return;
        }
        eraseLastTickRef.current = now;

        const pointer = stage.getPointerPosition();
        if(!pointer){
            return;
        }

        const pointerX = (pointer.x - stage.x()) / stage.scaleX();
        const pointerY = (pointer.y - stage.y()) / stage.scaleY();

        for(const doodle of doodleEraseTargets){
            const doodleId = String(doodle.id);
            if(erasedThisStrokeRef.current.has(doodleId)){
                continue;
            }

            if(!isPointerNearDoodle(pointerX, pointerY, doodle, ERASER_RADIUS_PX * wallSizeScale)){
                continue;
            }

            erasedThisStrokeRef.current.add(doodleId);
            reportItemMutation.mutate({itemId: doodle.id});
        }
    }, [activeTool, canWrite, doodleEraseTargets, isTimeCapsuleMode, reportItemMutation, wallSizeScale]);

    const handleClearMyDoodles = useCallback(() => {
        if(!activeWeekId || !ensureCanWrite()){
            return;
        }

        if(myDoodleCount < 1){
            return;
        }

        setShowClearDoodlesModal(true);
    }, [activeWeekId, ensureCanWrite, myDoodleCount]);

    const handleCancelClearMyDoodles = useCallback(() => {
        if(clearMyDoodlesMutation.isPending){
            return;
        }
        setShowClearDoodlesModal(false);
    }, [clearMyDoodlesMutation.isPending]);

    const handleConfirmClearMyDoodles = useCallback(() => {
        if(!activeWeekId || !ensureCanWrite()){
            return;
        }
        if(myDoodleCount < 1){
            setShowClearDoodlesModal(false);
            return;
        }
        clearMyDoodlesMutation.mutate({weekId: activeWeekId});
        setShowClearDoodlesModal(false);
    }, [activeWeekId, clearMyDoodlesMutation, ensureCanWrite, myDoodleCount]);

    useEffect(() => {
        if(isTimeCapsuleMode || !activeWeekId || myDoodleCount < 1){
            setShowClearDoodlesModal(false);
        }
    }, [activeWeekId, isTimeCapsuleMode, myDoodleCount]);

    const handleToggleTimeCapsule = useCallback(() => {
        if(isTimeCapsuleMode){
            setTimeCapsuleWeekId(null);
            return;
        }

        if(previousWeek?.id){
            setTimeCapsuleWeekId(previousWeek.id);
        }
    }, [isTimeCapsuleMode, previousWeek]);

    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            setRemoteCursors((prev) => {
                const next = {};
                let changed = false;
                for(const [key, cursor] of Object.entries(prev)){
                    if(now - cursor.updatedAt < 3000){
                        next[key] = cursor;
                    } else {
                        changed = true;
                    }
                }
                return changed ? next : prev;
            });
        }, 1500);

        return () => clearInterval(interval);
    }, []);

    const handleCursorBroadcast = useCallback((event) => {
        if(!canWrite || isTimeCapsuleMode || !realtimeChannelRef.current) return;

        const now = Date.now();
        if(now - lastCursorBroadcastRef.current < 80) return;
        lastCursorBroadcastRef.current = now;

        const stage = event.target.getStage();
        const pointer = stage?.getPointerPosition();
        if(!pointer) return;

        const logicalX = (pointer.x - stage.x()) / stage.scaleX();
        const logicalY = (pointer.y - stage.y()) / stage.scaleY();

        realtimeChannelRef.current.send({
            type: "broadcast",
            event: "cursor-move",
            payload: {
                clientId: clientIdRef.current,
                userId: currentUserId,
                userName: currentUser?.name || "User",
                x: clamp(logicalX / stageWidth, 0, 1),
                y: clamp(logicalY / stageHeight, 0, 1),
                tool: activeTool
            }
        });
    }, [canWrite, isTimeCapsuleMode, stageWidth, stageHeight, currentUserId, currentUser?.name, activeTool]);

    const handleCursorLeave = useCallback(() => {
        if(!realtimeChannelRef.current) return;

        realtimeChannelRef.current.send({
            type: "broadcast",
            event: "cursor-leave",
            payload: {clientId: clientIdRef.current}
        });
    }, []);

    const getTouchDistance = (t1, t2) =>
        Math.sqrt((t2.clientX - t1.clientX) ** 2 + (t2.clientY - t1.clientY) ** 2);

    const getTouchCenter = (t1, t2, stage) => {
        const rect = stage.container().getBoundingClientRect();
        return {
            x: ((t1.clientX + t2.clientX) / 2) - rect.left,
            y: ((t1.clientY + t2.clientY) / 2) - rect.top
        };
    };

    const clampStagePosition = useCallback((pos, scale) => {
        const minX = -(stageWidth * scale - stageWidth * 0.3);
        const maxX = stageWidth * 0.7;
        const minY = -(stageHeight * scale - stageHeight * 0.3);
        const maxY = stageHeight * 0.7;
        return {
            x: clamp(pos.x, minX, maxX),
            y: clamp(pos.y, minY, maxY)
        };
    }, [stageWidth, stageHeight]);

    const applyMinimapPanPosition = useCallback((left, top) => {
        const newPos = clampStagePosition({
            x: -(left / MINIMAP_WIDTH) * stageWidth * stageScale,
            y: -(top / minimapHeight) * stageHeight * stageScale
        }, stageScale);
        setStagePosition(newPos);
    }, [clampStagePosition, minimapHeight, stageHeight, stageScale, stageWidth]);

    const flushPendingMinimapPan = useCallback(() => {
        minimapFrameRef.current = null;
        const pending = minimapPendingRef.current;
        if(!pending){
            return;
        }

        minimapPendingRef.current = null;
        applyMinimapPanPosition(pending.left, pending.top);
    }, [applyMinimapPanPosition]);

    const queueMinimapPan = useCallback((left, top) => {
        minimapPendingRef.current = { left, top };
        if(minimapFrameRef.current !== null){
            return;
        }
        minimapFrameRef.current = window.requestAnimationFrame(flushPendingMinimapPan);
    }, [flushPendingMinimapPan]);

    const finalizeMinimapPan = useCallback(() => {
        if(minimapFrameRef.current !== null){
            window.cancelAnimationFrame(minimapFrameRef.current);
            minimapFrameRef.current = null;
        }

        const pending = minimapPendingRef.current;
        if(!pending){
            return;
        }

        minimapPendingRef.current = null;
        applyMinimapPanPosition(pending.left, pending.top);
    }, [applyMinimapPanPosition]);

    const handleMinimapClick = useCallback((event) => {
        if(minimapSuppressClickRef.current){
            minimapSuppressClickRef.current = false;
            return;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const clickX = (event.clientX - rect.left) / MINIMAP_WIDTH;
        const clickY = (event.clientY - rect.top) / minimapHeight;
        const newPos = clampStagePosition({
            x: -(clickX * stageWidth * stageScale - stageWidth / 2),
            y: -(clickY * stageHeight * stageScale - stageHeight / 2)
        }, stageScale);
        setStagePosition(newPos);
    }, [clampStagePosition, minimapHeight, stageHeight, stageScale, stageWidth]);

    const handleMinimapPointerDown = useCallback((event) => {
        const isViewportTarget = event.target?.classList?.contains("fw-minimap-viewport");
        if(!isViewportTarget){
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const rect = event.currentTarget.getBoundingClientRect();
        const pointerX = clamp(event.clientX - rect.left, 0, MINIMAP_WIDTH);
        const pointerY = clamp(event.clientY - rect.top, 0, minimapHeight);

        minimapDragRef.current = {
            isActive: true,
            pointerId: event.pointerId,
            offsetX: pointerX - minimapViewport.left,
            offsetY: pointerY - minimapViewport.top,
            consumedClick: true
        };

        event.currentTarget.setPointerCapture?.(event.pointerId);
    }, [minimapHeight, minimapViewport.left, minimapViewport.top]);

    const handleMinimapPointerMove = useCallback((event) => {
        const drag = minimapDragRef.current;
        if(!drag.isActive || drag.pointerId !== event.pointerId){
            return;
        }

        event.preventDefault();

        const rect = event.currentTarget.getBoundingClientRect();
        const pointerX = clamp(event.clientX - rect.left, 0, MINIMAP_WIDTH);
        const pointerY = clamp(event.clientY - rect.top, 0, minimapHeight);
        const maxLeft = Math.max(0, MINIMAP_WIDTH - minimapViewport.width);
        const maxTop = Math.max(0, minimapHeight - minimapViewport.height);
        const nextLeft = clamp(pointerX - drag.offsetX, 0, maxLeft);
        const nextTop = clamp(pointerY - drag.offsetY, 0, maxTop);

        queueMinimapPan(nextLeft, nextTop);
    }, [minimapHeight, minimapViewport.height, minimapViewport.width, queueMinimapPan]);

    const handleMinimapPointerUp = useCallback((event) => {
        const drag = minimapDragRef.current;
        if(!drag.isActive || drag.pointerId !== event.pointerId){
            return;
        }

        event.preventDefault();
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        finalizeMinimapPan();
        minimapSuppressClickRef.current = drag.consumedClick;
        minimapDragRef.current = {
            isActive: false,
            pointerId: null,
            offsetX: 0,
            offsetY: 0,
            consumedClick: false
        };
    }, [finalizeMinimapPan]);

    useEffect(() => () => {
        if(minimapFrameRef.current !== null){
            window.cancelAnimationFrame(minimapFrameRef.current);
        }
    }, []);

    const handleWheel = useCallback((e) => {
        e.evt.preventDefault();
        const stage = e.target.getStage();
        const pointer = stage.getPointerPosition();
        if(!pointer) return;

        const oldScale = stage.scaleX();
        const mousePointTo = {
            x: (pointer.x - stage.x()) / oldScale,
            y: (pointer.y - stage.y()) / oldScale
        };

        const direction = e.evt.deltaY < 0 ? 1 : -1;
        const factor = 1.08;
        const newScale = clamp(direction > 0 ? oldScale * factor : oldScale / factor, 0.5, 3);

        const newPos = clampStagePosition({
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale
        }, newScale);

        setStageScale(newScale);
        setStagePosition(newPos);
    }, [clampStagePosition]);

    const handleZoomIn = useCallback(() => {
        const newScale = clamp(stageScale * 1.3, 0.5, 3);
        const centerX = stageWidth / 2;
        const centerY = stageHeight / 2;
        const mousePointTo = {
            x: (centerX - stagePosition.x) / stageScale,
            y: (centerY - stagePosition.y) / stageScale
        };
        const newPos = clampStagePosition({
            x: centerX - mousePointTo.x * newScale,
            y: centerY - mousePointTo.y * newScale
        }, newScale);
        setStageScale(newScale);
        setStagePosition(newPos);
    }, [stageScale, stagePosition, stageWidth, stageHeight, clampStagePosition]);

    const handleZoomOut = useCallback(() => {
        const newScale = clamp(stageScale / 1.3, 0.5, 3);
        const centerX = stageWidth / 2;
        const centerY = stageHeight / 2;
        const mousePointTo = {
            x: (centerX - stagePosition.x) / stageScale,
            y: (centerY - stagePosition.y) / stageScale
        };
        const newPos = clampStagePosition({
            x: centerX - mousePointTo.x * newScale,
            y: centerY - mousePointTo.y * newScale
        }, newScale);
        setStageScale(newScale);
        setStagePosition(newPos);
    }, [stageScale, stagePosition, stageWidth, stageHeight, clampStagePosition]);

    const handleZoomReset = useCallback(() => {
        setStageScale(1);
        setStagePosition({ x: 0, y: 0 });
    }, []);

    const handlePuffComplete = useCallback((puffId) => {
        setPlacementPuffs((prev) => prev.filter((p) => p.id !== puffId));
    }, []);

    const remoteCursorItems = useMemo(() => {
        return Object.values(remoteCursors)
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 15);
    }, [remoteCursors]);

    const getNormalizedPointerPosition = (stage, snap = false) => {
        const pointer = stage?.getPointerPosition();
        if(!pointer){
            return null;
        }

        const logicalX = (pointer.x - stage.x()) / stage.scaleX();
        const logicalY = (pointer.y - stage.y()) / stage.scaleY();

        const px = snap ? snapToGrid(logicalX) : logicalX;
        const py = snap ? snapToGrid(logicalY) : logicalY;

        return {
            x: clamp(px / stageWidth, 0, 1),
            y: clamp(py / stageHeight, 0, 1)
        };
    };

    const createWallItem = useCallback((itemType, payload) => {
        if(!activeWeekId || !ensureCanWrite()){
            return;
        }

        createItemMutation.mutate({
            payload: {
                weekId: activeWeekId,
                itemType: itemType,
                payload: payload,
                zIndex: maxZIndex + 1
            }
        });
    }, [activeWeekId, createItemMutation, ensureCanWrite, maxZIndex]);

    const handlePlaceItem = useCallback((stage) => {
        const pointer = getNormalizedPointerPosition(stage);
        if(!pointer){
            return;
        }

        if(activeTool === "sticker"){
            if(draftSticker || !selectedSticker){
                return;
            }

            setDraftSticker({
                sticker: selectedSticker,
                x: pointer.x,
                y: pointer.y,
                scale: 1,
                rotation: 0
            });
            return;
        }

        if(activeTool === "stamp"){
            if(draftStamp){
                return;
            }

            setDraftStamp({
                stamp: selectedStamp,
                x: pointer.x,
                y: pointer.y,
                scale: 1,
                rotation: 0
            });
            return;
        }

        if(activeTool === "note"){
            if(draftNote){
                return;
            }
            setDraftNote({
                x: pointer.x,
                y: pointer.y,
                width: 0.26,
                height: 0.2,
                text: "",
                fontFamily: "Arial",
                fontStyle: "normal",
                fontColor: "#1f2937",
                bgColor: "#fff4a8",
                fontSize: 16
            });
        }
    }, [activeTool, createWallItem, draftNote, draftSticker, draftStamp, selectedStamp, selectedSticker, stageHeight, stageWidth]);

    const handleStagePointerDown = (event) => {
        const stage = event.target.getStage();
        if(!stage){
            return;
        }

        if(event.evt?.touches && event.evt.touches.length >= 2){
            isPinchingRef.current = true;
            const t1 = event.evt.touches[0];
            const t2 = event.evt.touches[1];
            lastPinchDistRef.current = getTouchDistance(t1, t2);
            lastPinchCenterRef.current = getTouchCenter(t1, t2, stage);
            if(event.evt.cancelable) event.evt.preventDefault();
            return;
        }

        if(isTimeCapsuleMode){
            if(isCanvasBackgroundTarget(event.target, stage)){
                setSelectedItemId(null);
            }
            return;
        }

        if(activeTool === "eraser"){
            if(!ensureCanWrite()){
                return;
            }

            if(event?.evt){
                stage.setPointersPositions(event.evt);
            }
            setIsErasing(true);
            erasedThisStrokeRef.current.clear();
            eraseLastTickRef.current = 0;
            tryEraseAtPointer(stage, {force: true});
            if(event?.evt?.cancelable){
                event.evt.preventDefault();
            }
            return;
        }

        if(activeTool === "doodle"){
            if(!ensureCanWrite()){
                return;
            }

            const normalizedPointer = getNormalizedPointerPosition(stage);
            if(!normalizedPointer){
                return;
            }

            setSelectedItemId(null);
            const initialPoints = [normalizedPointer.x, normalizedPointer.y];
            draftDoodleRef.current = initialPoints;
            setDraftDoodlePoints(initialPoints);
            setIsDrawing(true);
            if(event?.evt?.cancelable){
                event.evt.preventDefault();
            }
            return;
        }

        if(activeTool === "stamp"){
            if(draftStamp){
                return;
            }

            if(!ensureCanWrite()){
                return;
            }

            setSelectedItemId(null);
            handlePlaceItem(stage);
            if(event?.evt?.cancelable){
                event.evt.preventDefault();
            }
            return;
        }

        if(isCanvasBackgroundTarget(event.target, stage)){
            setSelectedItemId(null);
            const canPlaceSticker = activeTool === "sticker" && !draftSticker;
            const canPlaceNote = activeTool === "note" && !draftNote;
            if(canPlaceSticker || canPlaceNote){
                handlePlaceItem(stage);
            }
        }
    };

    const handleStagePointerMove = (event) => {
        if(isPinchingRef.current && event.evt?.touches && event.evt.touches.length >= 2){
            const stage = event.target.getStage();
            const t1 = event.evt.touches[0];
            const t2 = event.evt.touches[1];
            const newDist = getTouchDistance(t1, t2);
            const newCenter = getTouchCenter(t1, t2, stage);

            if(lastPinchDistRef.current !== null && lastPinchCenterRef.current !== null){
                const scaleFactor = newDist / lastPinchDistRef.current;
                const newScale = clamp(stageScale * scaleFactor, 0.5, 3);

                const dx = newCenter.x - lastPinchCenterRef.current.x;
                const dy = newCenter.y - lastPinchCenterRef.current.y;

                const mousePointTo = {
                    x: (newCenter.x - stagePosition.x) / stageScale,
                    y: (newCenter.y - stagePosition.y) / stageScale
                };

                const newPos = clampStagePosition({
                    x: newCenter.x - mousePointTo.x * newScale + dx,
                    y: newCenter.y - mousePointTo.y * newScale + dy
                }, newScale);

                setStageScale(newScale);
                setStagePosition(newPos);
            }

            lastPinchDistRef.current = newDist;
            lastPinchCenterRef.current = newCenter;
            if(event.evt.cancelable) event.evt.preventDefault();
            return;
        }

        handleCursorBroadcast(event);

        if(activeTool === "eraser" && isErasing){
            const stage = event.target.getStage();
            if(event?.evt){
                stage.setPointersPositions(event.evt);
            }
            tryEraseAtPointer(stage);
            if(event?.evt?.cancelable){
                event.evt.preventDefault();
            }
            return;
        }

        if(activeTool !== "doodle" || !isDrawing){
            return;
        }

        const stage = event.target.getStage();
        const normalizedPointer = getNormalizedPointerPosition(stage);
        if(!normalizedPointer){
            return;
        }

        const nextPoints = [...draftDoodleRef.current, normalizedPointer.x, normalizedPointer.y];
        draftDoodleRef.current = nextPoints;
        setDraftDoodlePoints(nextPoints);
        if(event?.evt?.cancelable){
            event.evt.preventDefault();
        }
    };

    const handleStagePointerUp = (event) => {
        if(isPinchingRef.current){
            isPinchingRef.current = false;
            lastPinchDistRef.current = null;
            lastPinchCenterRef.current = null;
            return;
        }

        if(activeTool === "eraser"){
            setIsErasing(false);
            erasedThisStrokeRef.current.clear();
            return;
        }

        if(activeTool !== "doodle"){
            return;
        }

        const points = draftDoodleRef.current
            .map((point) => Number(point))
            .filter((point) => !Number.isNaN(point))
            .map((point) => clamp(point, 0, 1));

        if(points.length >= 4){
            const normalizedPoints = points.length % 2 === 0 ? points : points.slice(0, -1);
            createWallItem("doodle", {
                points: normalizedPoints,
                color: doodleColor,
                size: doodleSize
            });
        }

        setIsDrawing(false);
        setDraftDoodlePoints([]);
        draftDoodleRef.current = [];
    };

    const handleDeleteSelectedItem = () => {
        if(!selectedItem || !selectedItemCanEdit){
            return;
        }

        deleteItemMutation.mutate({itemId: selectedItem.id});
        setSelectedItemId(null);
    };

    const handleDraftNoteSave = () => {
        if(!draftNote){
            return;
        }

        const noteText = draftNote.text?.trim();
        if(!noteText){
            return;
        }

        createWallItem("note", {
            text: noteText,
            x: draftNote.x,
            y: draftNote.y,
            width: clamp(Number(draftNote.width) || 0.26, 0.12, 0.8),
            height: clamp(Number(draftNote.height) || 0.2, 0.1, 0.7),
            rotation: 0,
            fontFamily: draftNote.fontFamily || "Arial",
            fontStyle: draftNote.fontStyle || "normal",
            fontColor: draftNote.fontColor || "#1f2937",
            bgColor: draftNote.bgColor || "#fff4a8",
            fontSize: clamp(Number(draftNote.fontSize) || 16, 10, 64)
        });

        setDraftNote(null);
    };

    const handleDraftStickerSave = () => {
        if(!draftSticker){
            return;
        }

        createWallItem("sticker", {
            sticker: draftSticker.sticker,
            x: draftSticker.x,
            y: draftSticker.y,
            scale: clamp(Number(draftSticker.scale) || 1, 0.25, 6),
            rotation: 0
        });

        setDraftSticker(null);
    };

    const handleDraftStampSave = () => {
        if(!draftStamp){
            return;
        }

        createWallItem("stamp", {
            stamp: draftStamp.stamp,
            x: draftStamp.x,
            y: draftStamp.y,
            scale: clamp(Number(draftStamp.scale) || 1, 0.35, 5),
            rotation: 0
        });

        setDraftStamp(null);
    };

    const applyNoteChanges = () => {
        if(!selectedNote || !selectedItemCanEdit){
            return;
        }

        const nextText = noteEditor.text.trim();
        if(!nextText){
            return;
        }

        updateItemMutation.mutate({
            itemId: selectedNote.id,
            payload: {
                payload: {
                    text: nextText,
                    fontFamily: noteEditor.fontFamily,
                    fontStyle: noteEditor.fontStyle,
                    fontColor: noteEditor.fontColor,
                    bgColor: noteEditor.bgColor,
                    fontSize: clamp(Number(noteEditor.fontSize) || 16, 10, 64),
                    width: clamp(Number(noteEditor.width) || 0.26, 0.12, 0.8),
                    height: clamp(Number(noteEditor.height) || 0.2, 0.1, 0.7)
                }
            }
        });
    };

    const moveItemFromDrag = useCallback((item, event) => {
        if(!selectedItemCanEdit || String(selectedItem?.id) !== String(item?.id)){
            return;
        }

        const node = event?.target;
        if(!node){
            return;
        }

        const nextX = clamp(node.x() / stageWidth, 0, 1);
        const nextY = clamp(node.y() / stageHeight, 0, 1);

        updateItemMutation.mutate({
            itemId: item.id,
            payload: {
                payload: {
                    x: nextX,
                    y: nextY
                }
            }
        });
    }, [selectedItem?.id, selectedItemCanEdit, stageHeight, stageWidth, updateItemMutation]);

    const bringSelectedItemToFront = () => {
        if(!selectedItem || !selectedItemCanEdit){
            return;
        }

        updateItemMutation.mutate({
            itemId: selectedItem.id,
            payload: {
                zIndex: maxZIndex + 1
            }
        });
    };

    const wallItemNodes = useMemo(() => sortedItems.map((item) => {
        const canEditItem = Boolean(
            currentUserId &&
            String(item?.user_id) === String(currentUserId) &&
            activeTool !== "stamp" &&
            activeTool !== "eraser"
        );
        const isSelected = String(selectedItemId) === String(item?.id);
        const handleSelectItem = () => {
            if(activeTool === "eraser"){
                return;
            }
            if(activeTool === "stamp"){
                return;
            }
            setSelectedItemId(item.id);
        };

        if(item?.item_type === "doodle"){
            const points = Array.isArray(item?.payload?.points)
                ? item.payload.points
                    .map((point) => Number(point))
                    .filter((point) => !Number.isNaN(point))
                : [];
            if(points.length < 4){
                return null;
            }

            return (
                <Line
                    key={item.id}
                    points={points.map((point, pointIndex) => (
                        pointIndex % 2 === 0 ? point * stageWidth : point * stageHeight
                    ))}
                    stroke={item?.payload?.color || "#5f92ff"}
                    strokeWidth={(Number(item?.payload?.size) || 3) * wallSizeScale}
                    lineCap="round"
                    lineJoin="round"
                    tension={0.12}
                    onClick={handleSelectItem}
                    onTap={handleSelectItem}
                />
            );
        }

        if(item?.item_type === "sticker"){
            return (
                <StickerNode
                    key={item.id}
                    item={item}
                    stageWidth={stageWidth}
                    stageHeight={stageHeight}
                    canEdit={canEditItem}
                    isSelected={isSelected}
                    onSelect={handleSelectItem}
                    onDragEnd={(event) => moveItemFromDrag(item, event)}
                />
            );
        }

        if(item?.item_type === "stamp"){
            return (
                <StampNode
                    key={item.id}
                    item={item}
                    stageWidth={stageWidth}
                    stageHeight={stageHeight}
                    canEdit={canEditItem}
                    isSelected={isSelected}
                    onSelect={handleSelectItem}
                    onDragEnd={(event) => moveItemFromDrag(item, event)}
                />
            );
        }

        if(item?.item_type === "note"){
            return (
                <NoteNode
                    key={item.id}
                    item={item}
                    stageWidth={stageWidth}
                    stageHeight={stageHeight}
                    canEdit={canEditItem}
                    isSelected={isSelected}
                    onSelect={handleSelectItem}
                    onDragEnd={(event) => moveItemFromDrag(item, event)}
                />
            );
        }

        return null;
    }), [sortedItems, currentUserId, activeTool, selectedItemId, stageWidth, stageHeight, moveItemFromDrag, wallSizeScale]);

    if(weekError){
        return (
            <div className="freedom-wall-page">
                <div className="freedom-wall-error">Failed to load Freedom Wall.</div>
            </div>
        );
    }

    return (
        <div className="freedom-wall-page">
            <div className="freedom-wall-header">
                <div className="freedom-wall-title-shell">
                    <h2 className="freedom-wall-title">Freedom Wall</h2>
                    <p className="freedom-wall-subtitle">
                        Public collaborative canvas. Resets weekly.
                    </p>
                    <div className="freedom-wall-countdown-pill">
                        Wall resets in: {countdownText}
                    </div>
                </div>
                <div className="freedom-wall-week-shell">
                    <div className="freedom-wall-week-pill">
                        {isWeekLoading ? "Loading week..." : formatWeekLabel(viewedWeek || activeWeek)}
                    </div>
                    <button
                        type="button"
                        className={`fw-tool-btn ${isTimeCapsuleMode ? "is-active" : ""}`}
                        onClick={handleToggleTimeCapsule}
                        disabled={!isTimeCapsuleMode && !previousWeek?.id}
                    >
                        {isTimeCapsuleMode ? "Back to Live Wall" : "Time Capsule"}
                    </button>
                    {isTimeCapsuleMode && (
                        <span className="fw-label">Viewing previous week (read-only)</span>
                    )}
                    {!isTimeCapsuleMode && !isWeeksLoading && !previousWeek?.id && (
                        <span className="fw-label">Time Capsule unavailable</span>
                    )}
                </div>
            </div>

            <div className="freedom-wall-toolbar">
                <div className="freedom-wall-tool-group">
                    <button type="button" className={`fw-tool-btn ${activeTool === "doodle" ? "is-active" : ""}`} onClick={() => setActiveTool("doodle")} disabled={isTimeCapsuleMode}>Doodle</button>
                    <button type="button" className={`fw-tool-btn ${activeTool === "sticker" ? "is-active" : ""}`} onClick={() => setActiveTool("sticker")} disabled={isTimeCapsuleMode}>Sticker</button>
                    <button type="button" className={`fw-tool-btn ${activeTool === "stamp" ? "is-active" : ""}`} onClick={() => setActiveTool("stamp")} disabled={isTimeCapsuleMode}>Stamp</button>
                    <button type="button" className={`fw-tool-btn ${activeTool === "note" ? "is-active" : ""}`} onClick={() => setActiveTool("note")} disabled={isTimeCapsuleMode}>Note</button>
                    <button type="button" className={`fw-tool-btn ${activeTool === "eraser" ? "is-active" : ""}`} onClick={() => setActiveTool("eraser")} disabled={isTimeCapsuleMode}>Eraser</button>
                </div>

                {!isTimeCapsuleMode && activeTool === "doodle" && (
                    <div className="freedom-wall-tool-controls">
                        <label className="fw-label">Color</label>
                        <input type="color" value={doodleColor} onChange={(event) => setDoodleColor(event.target.value)} />
                        <label className="fw-label">Size</label>
                        <input type="range" min={1} max={12} step={0.2} value={doodleSize} onChange={(event) => setDoodleSize(Number(event.target.value))} />
                    </div>
                )}

                {!isTimeCapsuleMode && activeTool === "sticker" && !draftSticker && (
                    <div className="freedom-wall-tool-controls">
                        <label className="fw-label">Sticker</label>
                        <div className="fw-sticker-grid">
                            {Object.entries(STICKER_OPTIONS).map(([stickerKey, icon]) => (
                                <button
                                    key={stickerKey}
                                    type="button"
                                    className={`fw-stamp-btn fw-sticker-btn ${selectedSticker === stickerKey ? "is-active" : ""}`}
                                    onClick={() => setSelectedSticker(stickerKey)}
                                >
                                    {icon}
                                </button>
                            ))}
                        </div>
                        <span className="fw-label">Click canvas to place</span>
                    </div>
                )}

                {!isTimeCapsuleMode && activeTool === "stamp" && !draftStamp && (
                    <div className="freedom-wall-tool-controls">
                        <label className="fw-label">Stamp</label>
                        <div className="fw-stamp-grid">
                            {Object.entries(STAMP_ICONS).map(([stampKey, icon]) => (
                                <button
                                    key={stampKey}
                                    type="button"
                                    className={`fw-stamp-btn ${selectedStamp === stampKey ? "is-active" : ""}`}
                                    onClick={() => setSelectedStamp(stampKey)}
                                >
                                    {icon}
                                </button>
                            ))}
                        </div>
                        <span className="fw-label">Click canvas to place</span>
                    </div>
                )}

                {!isTimeCapsuleMode && activeTool === "note" && !draftNote && (
                    <div className="freedom-wall-tool-controls">
                        <span className="fw-label">Click canvas to place a note</span>
                    </div>
                )}

                {!isTimeCapsuleMode && activeTool === "eraser" && (
                    <div className="freedom-wall-tool-controls">
                        <span className="fw-label">Drag to erase doodles (finger or mouse)</span>
                    </div>
                )}

                {!canWrite && (
                    <div className="fw-readonly-pill">
                        View only. Log in to add items.
                    </div>
                )}

                {isTimeCapsuleMode && (
                    <div className="fw-readonly-pill">
                        Time Capsule mode is view-only.
                    </div>
                )}

                {canWrite && !isTimeCapsuleMode && (
                    <div className="freedom-wall-tool-controls">
                        <button
                            type="button"
                            className="fw-delete-btn"
                            onClick={handleClearMyDoodles}
                            disabled={!activeWeekId || clearMyDoodlesMutation.isPending || myDoodleCount < 1}
                        >
                            {clearMyDoodlesMutation.isPending ? "Clearing..." : "Clear My Doodles"}
                        </button>
                        <span className="fw-label">{myDoodleCount} yours</span>
                    </div>
                )}
            </div>

            {!isTimeCapsuleMode && draftNote && (
                <div className="fw-draft-note-panel">
                    <div className="fw-draft-note-header">
                        <h4>Design Your Note</h4>
                        <span className="fw-draft-note-charcount">{(draftNote.text || "").length}/200</span>
                    </div>

                    <textarea
                        className="fw-draft-note-textarea"
                        value={draftNote.text}
                        onChange={(e) => setDraftNote((prev) => ({...prev, text: e.target.value}))}
                        maxLength={200}
                        placeholder="Write your note..."
                        autoFocus
                    />

                    <div className="fw-draft-note-controls">
                        <div className="fw-draft-note-row">
                            <label>Font</label>
                            <select value={draftNote.fontFamily} onChange={(e) => setDraftNote((prev) => ({...prev, fontFamily: e.target.value}))}>
                                {NOTE_FONT_OPTIONS.map((fontName) => (
                                    <option key={fontName} value={fontName}>{fontName}</option>
                                ))}
                            </select>
                        </div>

                        <div className="fw-draft-note-row">
                            <label>Style</label>
                            <select value={draftNote.fontStyle} onChange={(e) => setDraftNote((prev) => ({...prev, fontStyle: e.target.value}))}>
                                {NOTE_STYLE_OPTIONS.map((styleName) => (
                                    <option key={styleName} value={styleName}>{styleName}</option>
                                ))}
                            </select>
                        </div>

                        <div className="fw-draft-note-row">
                            <label>Font color</label>
                            <input type="color" value={draftNote.fontColor} onChange={(e) => setDraftNote((prev) => ({...prev, fontColor: e.target.value}))} />
                        </div>

                        <div className="fw-draft-note-row">
                            <label>Note color</label>
                            <input type="color" value={draftNote.bgColor} onChange={(e) => setDraftNote((prev) => ({...prev, bgColor: e.target.value}))} />
                        </div>

                        <div className="fw-draft-note-row">
                            <label>Size ({draftNote.fontSize}px)</label>
                            <input type="range" min={10} max={64} step={1} value={draftNote.fontSize} onChange={(e) => setDraftNote((prev) => ({...prev, fontSize: Number(e.target.value)}))} />
                        </div>

                        <div className="fw-draft-note-row">
                            <label>Width ({Math.round((draftNote.width || 0.26) * stageWidth)}px)</label>
                            <input type="range" min={0.12} max={0.8} step={0.02} value={draftNote.width || 0.26} onChange={(e) => setDraftNote((prev) => ({...prev, width: Number(e.target.value)}))} />
                        </div>

                        <div className="fw-draft-note-row">
                            <label>Height ({Math.round((draftNote.height || 0.2) * stageHeight)}px)</label>
                            <input type="range" min={0.1} max={0.7} step={0.02} value={draftNote.height || 0.2} onChange={(e) => setDraftNote((prev) => ({...prev, height: Number(e.target.value)}))} />
                        </div>
                    </div>

                    <div className="fw-draft-note-actions">
                        <button type="button" className="fw-apply-btn" onClick={handleDraftNoteSave} disabled={!draftNote.text?.trim()}>Place Note</button>
                        <button type="button" className="fw-delete-btn" onClick={() => setDraftNote(null)}>Cancel</button>
                    </div>
                </div>
            )}

            {!isTimeCapsuleMode && draftSticker && (
                <div className="fw-draft-note-panel">
                    <div className="fw-draft-note-header">
                        <h4>Place Your Sticker</h4>
                        <span className="fw-draft-note-charcount">{STICKER_OPTIONS[draftSticker.sticker] || "🐶"}</span>
                    </div>

                    <div className="fw-draft-note-controls">
                        <div className="fw-draft-note-row">
                            <label>Sticker</label>
                            <div className="fw-sticker-grid">
                                {Object.entries(STICKER_OPTIONS).map(([stickerKey, icon]) => (
                                    <button
                                        key={stickerKey}
                                        type="button"
                                        className={`fw-stamp-btn fw-sticker-btn ${draftSticker.sticker === stickerKey ? "is-active" : ""}`}
                                        onClick={() => setDraftSticker((prev) => ({...prev, sticker: stickerKey}))}
                                    >
                                        {icon}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="fw-draft-note-row">
                            <label>Scale ({draftSticker.scale}x)</label>
                            <input type="range" min={0.25} max={6} step={0.25} value={draftSticker.scale} onChange={(e) => setDraftSticker((prev) => ({...prev, scale: Number(e.target.value)}))} />
                        </div>
                    </div>

                    <div className="fw-draft-note-actions">
                        <button type="button" className="fw-apply-btn" onClick={handleDraftStickerSave}>Place Sticker</button>
                        <button type="button" className="fw-delete-btn" onClick={() => setDraftSticker(null)}>Cancel</button>
                    </div>
                </div>
            )}

            {!isTimeCapsuleMode && draftStamp && (
                <div className="fw-draft-note-panel">
                    <div className="fw-draft-note-header">
                        <h4>Place Your Stamp</h4>
                        <span className="fw-draft-note-charcount">{STAMP_ICONS[draftStamp.stamp] || "✨"}</span>
                    </div>

                    <div className="fw-draft-note-controls">
                        <div className="fw-draft-note-row">
                            <label>Stamp</label>
                            <div className="fw-stamp-grid">
                                {Object.entries(STAMP_ICONS).map(([stampKey, icon]) => (
                                    <button
                                        key={stampKey}
                                        type="button"
                                        className={`fw-stamp-btn ${draftStamp.stamp === stampKey ? "is-active" : ""}`}
                                        onClick={() => setDraftStamp((prev) => ({...prev, stamp: stampKey}))}
                                    >
                                        {icon}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="fw-draft-note-row">
                            <label>Scale ({draftStamp.scale}x)</label>
                            <input type="range" min={0.35} max={5} step={0.25} value={draftStamp.scale} onChange={(e) => setDraftStamp((prev) => ({...prev, scale: Number(e.target.value)}))} />
                        </div>
                    </div>

                    <div className="fw-draft-note-actions">
                        <button type="button" className="fw-apply-btn" onClick={handleDraftStampSave}>Place Stamp</button>
                        <button type="button" className="fw-delete-btn" onClick={() => setDraftStamp(null)}>Cancel</button>
                    </div>
                </div>
            )}

            {selectedNote && selectedItemCanEdit && activeTool !== "eraser" && !isTimeCapsuleMode && (
                <div className="freedom-wall-note-editor">
                    <h4>Note Editor</h4>
                    <textarea
                        value={noteEditor.text}
                        onChange={(event) => setNoteEditor((prev) => ({...prev, text: event.target.value}))}
                        maxLength={200}
                    />
                    <div className="fw-note-controls">
                        <label>Font</label>
                        <select value={noteEditor.fontFamily} onChange={(event) => setNoteEditor((prev) => ({...prev, fontFamily: event.target.value}))}>
                            {NOTE_FONT_OPTIONS.map((fontName) => (
                                <option key={fontName} value={fontName}>{fontName}</option>
                            ))}
                        </select>

                        <label>Style</label>
                        <select value={noteEditor.fontStyle} onChange={(event) => setNoteEditor((prev) => ({...prev, fontStyle: event.target.value}))}>
                            {NOTE_STYLE_OPTIONS.map((styleName) => (
                                <option key={styleName} value={styleName}>{styleName}</option>
                            ))}
                        </select>

                        <label>Font color</label>
                        <input type="color" value={noteEditor.fontColor} onChange={(event) => setNoteEditor((prev) => ({...prev, fontColor: event.target.value}))} />

                        <label>Note color</label>
                        <input type="color" value={noteEditor.bgColor} onChange={(event) => setNoteEditor((prev) => ({...prev, bgColor: event.target.value}))} />

                        <label>Size</label>
                        <input type="range" min={10} max={64} step={1} value={noteEditor.fontSize} onChange={(event) => setNoteEditor((prev) => ({...prev, fontSize: Number(event.target.value)}))} />

                        <label>Width ({Math.round((noteEditor.width || 0.26) * stageWidth)}px)</label>
                        <input type="range" min={0.12} max={0.8} step={0.02} value={noteEditor.width || 0.26} onChange={(event) => setNoteEditor((prev) => ({...prev, width: Number(event.target.value)}))} />

                        <label>Height ({Math.round((noteEditor.height || 0.2) * stageHeight)}px)</label>
                        <input type="range" min={0.1} max={0.7} step={0.02} value={noteEditor.height || 0.2} onChange={(event) => setNoteEditor((prev) => ({...prev, height: Number(event.target.value)}))} />
                    </div>

                    <div className="fw-note-actions">
                        <button type="button" className="fw-apply-btn" onClick={applyNoteChanges}>Apply style</button>
                        <button type="button" className="fw-delete-btn" onClick={handleDeleteSelectedItem}>Delete note</button>
                    </div>
                </div>
            )}

            {selectedItem && selectedItemCanEdit && selectedItem.item_type !== "note" && activeTool !== "eraser" && !isTimeCapsuleMode && (
                <div className="freedom-wall-selected-actions">
                    <button type="button" className="fw-apply-btn" onClick={bringSelectedItemToFront}>Bring front</button>
                    <button type="button" className="fw-delete-btn" onClick={handleDeleteSelectedItem}>Delete selected</button>
                </div>
            )}

            <div ref={shellRef} className={`freedom-wall-canvas-shell ${activeTool === "eraser" && !isTimeCapsuleMode ? "is-eraser-mode" : ""}`}>
                {isItemsLoading ? (
                    <div className="freedom-wall-loading">Loading wall...</div>
                ) : (
                    <Stage
                        ref={stageRef}
                        width={stageWidth}
                        height={stageHeight}
                        scaleX={stageScale}
                        scaleY={stageScale}
                        x={stagePosition.x}
                        y={stagePosition.y}
                        onMouseDown={handleStagePointerDown}
                        onTouchStart={handleStagePointerDown}
                        onMouseMove={handleStagePointerMove}
                        onTouchMove={handleStagePointerMove}
                        onMouseUp={handleStagePointerUp}
                        onTouchEnd={handleStagePointerUp}
                        onMouseLeave={() => { handleStagePointerUp(); handleCursorLeave(); }}
                        onWheel={handleWheel}
                    >
                        <Layer listening={false}>
                            <Rect width={stageWidth} height={stageHeight} fill="#2a3a2e" />
                            <Rect width={stageWidth} height={stageHeight} fill="rgba(50, 80, 55, 0.15)" />
                            {Array.from({length: Math.floor(stageWidth / GRID_SIZE) + 1}).map((_, index) => (
                                <Line
                                    key={`fw-grid-v-${index}`}
                                    points={[index * GRID_SIZE, 0, index * GRID_SIZE, stageHeight]}
                                    stroke="rgba(200, 210, 200, 0.04)"
                                    strokeWidth={1}
                                />
                            ))}
                            {Array.from({length: Math.floor(stageHeight / GRID_SIZE) + 1}).map((_, index) => (
                                <Line
                                    key={`fw-grid-h-${index}`}
                                    points={[0, index * GRID_SIZE, stageWidth, index * GRID_SIZE]}
                                    stroke="rgba(200, 210, 200, 0.04)"
                                    strokeWidth={1}
                                />
                            ))}
                        </Layer>

                        <Layer>
                            {wallItemNodes}

                            {!isTimeCapsuleMode && draftSticker && (
                                <StickerNode
                                    item={{payload: draftSticker}}
                                    stageWidth={stageWidth}
                                    stageHeight={stageHeight}
                                    canEdit={true}
                                    isSelected={false}
                                    isDraft={true}
                                    onSelect={() => {}}
                                    onDragEnd={(event) => {
                                        const node = event?.target;
                                        if(!node) return;
                                        setDraftSticker((prev) => ({
                                            ...prev,
                                            x: clamp(node.x() / stageWidth, 0, 1),
                                            y: clamp(node.y() / stageHeight, 0, 1)
                                        }));
                                    }}
                                />
                            )}

                            {!isTimeCapsuleMode && draftStamp && (
                                <StampNode
                                    item={{payload: draftStamp}}
                                    stageWidth={stageWidth}
                                    stageHeight={stageHeight}
                                    canEdit={true}
                                    isSelected={false}
                                    isDraft={true}
                                    onSelect={() => {}}
                                    onDragEnd={(event) => {
                                        const node = event?.target;
                                        if(!node) return;
                                        setDraftStamp((prev) => ({
                                            ...prev,
                                            x: clamp(node.x() / stageWidth, 0, 1),
                                            y: clamp(node.y() / stageHeight, 0, 1)
                                        }));
                                    }}
                                />
                            )}

                            {!isTimeCapsuleMode && draftNote && (
                                <NoteNode
                                    item={{payload: draftNote}}
                                    stageWidth={stageWidth}
                                    stageHeight={stageHeight}
                                    canEdit={true}
                                    isSelected={false}
                                    isDraft={true}
                                    onSelect={() => {}}
                                    onDragEnd={(event) => {
                                        const node = event?.target;
                                        if(!node) return;
                                        setDraftNote((prev) => ({
                                            ...prev,
                                            x: clamp(node.x() / stageWidth, 0, 1),
                                            y: clamp(node.y() / stageHeight, 0, 1)
                                        }));
                                    }}
                                />
                            )}

                            {isDrawing && draftDoodlePoints.length >= 4 && (
                                <Line
                                    points={draftDoodlePoints.map((point, pointIndex) => (
                                        pointIndex % 2 === 0 ? point * stageWidth : point * stageHeight
                                    ))}
                                    stroke={doodleColor}
                                    strokeWidth={doodleSize * wallSizeScale}
                                    lineCap="round"
                                    lineJoin="round"
                                    tension={0.12}
                                />
                            )}

                            {placementPuffs.map((puff) => (
                                <PuffEffect key={puff.id} id={puff.id} x={puff.x} y={puff.y} onComplete={handlePuffComplete} />
                            ))}
                        </Layer>

                        <Layer listening={false}>
                            {remoteCursorItems.map((cursor) => (
                                <RemoteCursor key={cursor.clientId} cursor={cursor} stageWidth={stageWidth} stageHeight={stageHeight} />
                            ))}
                        </Layer>
                    </Stage>
                )}

                <div className="fw-zoom-controls">
                    <button type="button" onClick={handleZoomIn}>+</button>
                    {stageScale !== 1 && (
                        <span className="fw-zoom-level">{Math.round(stageScale * 100)}%</span>
                    )}
                    <button type="button" onClick={handleZoomOut}>&minus;</button>
                </div>

                {stageScale !== 1 && (
                    <button type="button" className="fw-reset-zoom-btn" onClick={handleZoomReset}>Reset view</button>
                )}

                {stageScale !== 1 && (
                    <div
                        className="fw-minimap"
                        style={{ height: minimapHeight }}
                        onClick={handleMinimapClick}
                        onPointerDown={handleMinimapPointerDown}
                        onPointerMove={handleMinimapPointerMove}
                        onPointerUp={handleMinimapPointerUp}
                        onPointerCancel={handleMinimapPointerUp}
                        onLostPointerCapture={handleMinimapPointerUp}
                    >
                        <div
                            className="fw-minimap-viewport"
                            style={{
                                width: minimapViewport.width,
                                height: minimapViewport.height,
                                transform: `translate3d(${minimapViewport.left}px, ${minimapViewport.top}px, 0)`
                            }}
                        />
                    </div>
                )}
            </div>

            {wallError && (
                <div className="freedom-wall-error-toast">{wallError}</div>
            )}

            {showClearDoodlesModal && (
                <div className="fw-modal-backdrop" onClick={handleCancelClearMyDoodles}>
                    <div
                        className="fw-modal-card"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Clear My Doodles Confirmation"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h4>Clear My Doodles?</h4>
                        <p>
                            This will permanently delete your {myDoodleCount} doodle{myDoodleCount === 1 ? "" : "s"} from this week.
                        </p>
                        <div className="fw-modal-actions">
                            <button
                                type="button"
                                className="fw-delete-btn"
                                onClick={handleConfirmClearMyDoodles}
                                disabled={clearMyDoodlesMutation.isPending}
                            >
                                {clearMyDoodlesMutation.isPending ? "Clearing..." : "Yes, Clear"}
                            </button>
                            <button
                                type="button"
                                className="fw-apply-btn"
                                onClick={handleCancelClearMyDoodles}
                                disabled={clearMyDoodlesMutation.isPending}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="freedom-wall-footer">
                <span>{sortedItems.length} {isTimeCapsuleMode ? "items in time capsule" : "items this week"}</span>
                <span>
                    {createItemMutation.isPending || updateItemMutation.isPending || deleteItemMutation.isPending
                    || reportItemMutation.isPending
                    || clearMyDoodlesMutation.isPending
                        ? "Syncing..."
                        : "Synced"}
                </span>
            </div>
        </div>
    );
};

export default FreedomWallPage;
