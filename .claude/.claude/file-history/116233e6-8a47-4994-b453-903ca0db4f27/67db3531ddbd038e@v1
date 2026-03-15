
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Shape, Stage, Text } from "react-konva";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    createFreedomWallItem,
    deleteFreedomWallItem,
    getCurrentFreedomWallWeek,
    getFreedomWallItems,
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
const WALL_MIN_HEIGHT = 420;
const WALL_MAX_HEIGHT = 900;
const GRID_SIZE = 36;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

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

const StickerNode = ({item, stageWidth, stageHeight, isSelected, canEdit, onSelect, onDragEnd}) => {
    const emoji = STICKER_OPTIONS[item?.payload?.sticker] || "🐶";
    const image = useEmojiImage(emoji);
    const scale = clamp(Number(item?.payload?.scale) || 1, 0.25, 6);
    const size = clamp(64 * scale, 20, 420);
    const x = clamp((Number(item?.payload?.x) || 0.5) * stageWidth, 0, Math.max(0, stageWidth - size));
    const y = clamp((Number(item?.payload?.y) || 0.5) * stageHeight, 0, Math.max(0, stageHeight - size));

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
            {isSelected && (
                <Rect
                    x={x}
                    y={y}
                    width={size}
                    height={size}
                    stroke="#4f46e5"
                    strokeWidth={2}
                    dash={[6, 4]}
                    listening={false}
                />
            )}
        </>
    );
};

const StampNode = ({item, stageWidth, stageHeight, canEdit, onSelect, onDragEnd, isSelected}) => {
    const stamp = STAMP_ICONS[item?.payload?.stamp] || "✨";
    const image = useEmojiImage(stamp, 64);
    const scale = clamp(Number(item?.payload?.scale) || 1, 0.35, 5);
    const size = clamp(34 * scale, 14, 220);
    const x = clamp((Number(item?.payload?.x) || 0.5) * stageWidth, 0, Math.max(0, stageWidth - size));
    const y = clamp((Number(item?.payload?.y) || 0.5) * stageHeight, 0, Math.max(0, stageHeight - size));

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
            {isSelected && (
                <Rect
                    x={x}
                    y={y}
                    width={size}
                    height={size}
                    stroke="#0f766e"
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

const NoteNode = ({item, stageWidth, stageHeight, canEdit, onSelect, onDragEnd, isSelected}) => {
    const payload = item?.payload || {};
    const width = clamp((Number(payload?.width) || 0.26) * stageWidth, 110, stageWidth * 0.9);
    const height = clamp((Number(payload?.height) || 0.2) * stageHeight, 60, stageHeight * 0.8);
    const x = clamp((Number(payload?.x) || 0.45) * stageWidth, 0, Math.max(0, stageWidth - width));
    const y = clamp((Number(payload?.y) || 0.45) * stageHeight, 0, Math.max(0, stageHeight - height));
    const fontStyle = NOTE_STYLE_OPTIONS.includes(payload?.fontStyle) ? payload.fontStyle : "normal";
    const bgColor = payload?.bgColor || "#fff4a8";
    const curlSize = Math.min(width, height) * 0.14;
    const pinSize = Math.max(5, Math.min(width, height) * 0.04);

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
                stroke={isSelected ? "#a21caf" : "rgba(0,0,0,0.1)"}
                strokeWidth={isSelected ? 2 : 0.5}
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
                fontSize={clamp(Number(payload?.fontSize) || 16, 10, 64)}
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

const formatWeekLabel = (week = null) => {
    if(!week?.week_start || !week?.week_end){
        return "No active week";
    }

    const startDate = new Date(week.week_start);
    const endDate = new Date(week.week_end);
    return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()} (UTC)`;
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
    const [noteModal, setNoteModal] = useState(null);
    const [noteEditor, setNoteEditor] = useState({
        text: "",
        fontFamily: "Arial",
        fontStyle: "normal",
        fontColor: "#1f2937",
        bgColor: "#fff4a8",
        fontSize: 16
    });

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
    const weekId = activeWeek?.id || null;

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
    const stageHeight = useMemo(() => clamp(Math.round(stageWidth * 0.64), WALL_MIN_HEIGHT, WALL_MAX_HEIGHT), [stageWidth]);

    const sortedItems = useMemo(() => sortItemsByZIndex(itemsData?.data || []), [itemsData?.data]);
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
            fontSize: clamp(Number(payload.fontSize) || 16, 10, 64)
        });
    }, [selectedNote]);

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

    useEffect(() => {
        if(!weekId){
            return;
        }

        const channel = supabase
            .channel(`freedom-wall-${weekId}`)
            .on(
                "postgres_changes",
                {event: "*", schema: "public", table: "freedom_wall_items", filter: `week_id=eq.${weekId}`},
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
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser?.badge, currentUser?.id, currentUser?.image_url, currentUser?.name, currentUserId, setItemsCache, weekId]);

    const ensureCanWrite = useCallback(() => {
        if(canWrite){
            return true;
        }
        openAuthModal?.();
        return false;
    }, [canWrite, openAuthModal]);

    const getNormalizedPointerPosition = (stage, snap = false) => {
        const pointer = stage?.getPointerPosition();
        if(!pointer){
            return null;
        }

        const px = snap ? snapToGrid(pointer.x) : pointer.x;
        const py = snap ? snapToGrid(pointer.y) : pointer.y;

        return {
            x: clamp(px / stageWidth, 0, 1),
            y: clamp(py / stageHeight, 0, 1)
        };
    };

    const createWallItem = useCallback((itemType, payload) => {
        if(!weekId || !ensureCanWrite()){
            return;
        }

        createItemMutation.mutate({
            payload: {
                weekId: weekId,
                itemType: itemType,
                payload: payload,
                zIndex: maxZIndex + 1
            }
        });
    }, [createItemMutation, ensureCanWrite, maxZIndex, weekId]);

    const handlePlaceItem = useCallback((stage) => {
        const pointer = getNormalizedPointerPosition(stage);
        if(!pointer){
            return;
        }

        if(activeTool === "sticker"){
            if(!selectedSticker){
                return;
            }

            createWallItem("sticker", {
                sticker: selectedSticker,
                x: pointer.x,
                y: pointer.y,
                scale: 1,
                rotation: 0
            });
            return;
        }

        if(activeTool === "stamp"){
            createWallItem("stamp", {
                stamp: selectedStamp,
                x: pointer.x,
                y: pointer.y,
                scale: 1,
                rotation: 0
            });
            return;
        }

        if(activeTool === "note"){
            setNoteModal({
                x: pointer.x,
                y: pointer.y,
                text: "New note",
                fontFamily: "Arial",
                fontStyle: "normal",
                fontColor: "#1f2937",
                bgColor: "#fff4a8",
                fontSize: 16
            });
        }
    }, [activeTool, createWallItem, selectedStamp, selectedSticker, stageHeight, stageWidth]);

    const handleStagePointerDown = (event) => {
        const stage = event.target.getStage();
        if(!stage){
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
            if(activeTool === "sticker" || activeTool === "stamp" || activeTool === "note"){
                handlePlaceItem(stage);
            }
        }
    };

    const handleStagePointerMove = (event) => {
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

    const handleStagePointerUp = () => {
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

    const handleNoteModalSave = () => {
        if(!noteModal){
            return;
        }

        const noteText = noteModal.text?.trim();
        if(!noteText){
            return;
        }

        createWallItem("note", {
            text: noteText,
            x: noteModal.x,
            y: noteModal.y,
            width: 0.26,
            height: 0.2,
            rotation: 0,
            fontFamily: noteModal.fontFamily || "Arial",
            fontStyle: noteModal.fontStyle || "normal",
            fontColor: noteModal.fontColor || "#1f2937",
            bgColor: noteModal.bgColor || "#fff4a8",
            fontSize: clamp(Number(noteModal.fontSize) || 16, 10, 64)
        });

        setNoteModal(null);
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
                    fontSize: clamp(Number(noteEditor.fontSize) || 16, 10, 64)
                }
            }
        });
    };

    const moveItemFromDrag = (item, event) => {
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
    };

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
                </div>
                <div className="freedom-wall-week-pill">
                    {isWeekLoading ? "Loading week..." : formatWeekLabel(activeWeek)}
                </div>
            </div>

            <div className="freedom-wall-toolbar">
                <div className="freedom-wall-tool-group">
                    <button type="button" className={`fw-tool-btn ${activeTool === "doodle" ? "is-active" : ""}`} onClick={() => setActiveTool("doodle")}>Doodle</button>
                    <button type="button" className={`fw-tool-btn ${activeTool === "sticker" ? "is-active" : ""}`} onClick={() => setActiveTool("sticker")}>Sticker</button>
                    <button type="button" className={`fw-tool-btn ${activeTool === "stamp" ? "is-active" : ""}`} onClick={() => setActiveTool("stamp")}>Stamp</button>
                    <button type="button" className={`fw-tool-btn ${activeTool === "note" ? "is-active" : ""}`} onClick={() => setActiveTool("note")}>Note</button>
                </div>

                {activeTool === "doodle" && (
                    <div className="freedom-wall-tool-controls">
                        <label className="fw-label">Color</label>
                        <input type="color" value={doodleColor} onChange={(event) => setDoodleColor(event.target.value)} />
                        <label className="fw-label">Size</label>
                        <input type="range" min={1} max={12} step={0.2} value={doodleSize} onChange={(event) => setDoodleSize(Number(event.target.value))} />
                    </div>
                )}

                {activeTool === "sticker" && (
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
                    </div>
                )}

                {activeTool === "stamp" && (
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
                    </div>
                )}

                {activeTool === "note" && (
                    <div className="freedom-wall-tool-controls">
                        <span className="fw-label">Click canvas to place a note</span>
                    </div>
                )}

                {!canWrite && (
                    <div className="fw-readonly-pill">
                        View only. Log in to add items.
                    </div>
                )}
            </div>

            {noteModal && (
                <div className="fw-note-modal-overlay" onClick={() => setNoteModal(null)}>
                    <div className="fw-note-modal" onClick={(e) => e.stopPropagation()}>
                        <h4>Design Your Note</h4>

                        <div className="fw-note-modal-preview" style={{
                            backgroundColor: noteModal.bgColor || "#fff4a8",
                            color: noteModal.fontColor || "#1f2937",
                            fontFamily: noteModal.fontFamily || "Arial",
                            fontStyle: noteModal.fontStyle === "italic" ? "italic" : "normal",
                            fontWeight: noteModal.fontStyle === "bold" ? "bold" : "normal",
                            fontSize: `${clamp(Number(noteModal.fontSize) || 16, 10, 64)}px`
                        }}>
                            {noteModal.text || "Preview"}
                        </div>

                        <textarea
                            className="fw-note-modal-textarea"
                            value={noteModal.text}
                            onChange={(e) => setNoteModal((prev) => ({...prev, text: e.target.value}))}
                            maxLength={800}
                            placeholder="Write your note..."
                            autoFocus
                        />

                        <div className="fw-note-modal-controls">
                            <div className="fw-note-modal-row">
                                <label>Font</label>
                                <select value={noteModal.fontFamily} onChange={(e) => setNoteModal((prev) => ({...prev, fontFamily: e.target.value}))}>
                                    {NOTE_FONT_OPTIONS.map((fontName) => (
                                        <option key={fontName} value={fontName}>{fontName}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="fw-note-modal-row">
                                <label>Style</label>
                                <select value={noteModal.fontStyle} onChange={(e) => setNoteModal((prev) => ({...prev, fontStyle: e.target.value}))}>
                                    {NOTE_STYLE_OPTIONS.map((styleName) => (
                                        <option key={styleName} value={styleName}>{styleName}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="fw-note-modal-row">
                                <label>Font color</label>
                                <input type="color" value={noteModal.fontColor} onChange={(e) => setNoteModal((prev) => ({...prev, fontColor: e.target.value}))} />
                            </div>

                            <div className="fw-note-modal-row">
                                <label>Note color</label>
                                <input type="color" value={noteModal.bgColor} onChange={(e) => setNoteModal((prev) => ({...prev, bgColor: e.target.value}))} />
                            </div>

                            <div className="fw-note-modal-row">
                                <label>Size ({noteModal.fontSize}px)</label>
                                <input type="range" min={10} max={64} step={1} value={noteModal.fontSize} onChange={(e) => setNoteModal((prev) => ({...prev, fontSize: Number(e.target.value)}))} />
                            </div>
                        </div>

                        <div className="fw-note-modal-actions">
                            <button type="button" className="fw-apply-btn" onClick={handleNoteModalSave}>Place note</button>
                            <button type="button" className="fw-delete-btn" onClick={() => setNoteModal(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {selectedNote && selectedItemCanEdit && (
                <div className="freedom-wall-note-editor">
                    <h4>Note Editor</h4>
                    <textarea
                        value={noteEditor.text}
                        onChange={(event) => setNoteEditor((prev) => ({...prev, text: event.target.value}))}
                        maxLength={800}
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
                    </div>

                    <div className="fw-note-actions">
                        <button type="button" className="fw-apply-btn" onClick={applyNoteChanges}>Apply style</button>
                        <button type="button" className="fw-delete-btn" onClick={handleDeleteSelectedItem}>Delete note</button>
                    </div>
                </div>
            )}

            {selectedItem && selectedItemCanEdit && selectedItem.item_type !== "note" && (
                <div className="freedom-wall-selected-actions">
                    <button type="button" className="fw-apply-btn" onClick={bringSelectedItemToFront}>Bring front</button>
                    <button type="button" className="fw-delete-btn" onClick={handleDeleteSelectedItem}>Delete selected</button>
                </div>
            )}

            <div ref={shellRef} className="freedom-wall-canvas-shell">
                {isItemsLoading ? (
                    <div className="freedom-wall-loading">Loading wall...</div>
                ) : (
                    <Stage
                        width={stageWidth}
                        height={stageHeight}
                        onMouseDown={handleStagePointerDown}
                        onTouchStart={handleStagePointerDown}
                        onMouseMove={handleStagePointerMove}
                        onTouchMove={handleStagePointerMove}
                        onMouseUp={handleStagePointerUp}
                        onTouchEnd={handleStagePointerUp}
                        onMouseLeave={handleStagePointerUp}
                    >
                        <Layer listening={false}>
                            <Rect width={stageWidth} height={stageHeight} fill="rgba(205, 250, 255, 0.22)" />
                            {Array.from({length: Math.floor(stageWidth / GRID_SIZE) + 1}).map((_, index) => (
                                <Line
                                    key={`fw-grid-v-${index}`}
                                    points={[index * GRID_SIZE, 0, index * GRID_SIZE, stageHeight]}
                                    stroke="rgba(15, 23, 42, 0.06)"
                                    strokeWidth={1}
                                />
                            ))}
                            {Array.from({length: Math.floor(stageHeight / GRID_SIZE) + 1}).map((_, index) => (
                                <Line
                                    key={`fw-grid-h-${index}`}
                                    points={[0, index * GRID_SIZE, stageWidth, index * GRID_SIZE]}
                                    stroke="rgba(15, 23, 42, 0.06)"
                                    strokeWidth={1}
                                />
                            ))}
                        </Layer>

                        <Layer>
                            {sortedItems.map((item) => {
                                const canEditItem = Boolean(
                                    currentUserId &&
                                    String(item?.user_id) === String(currentUserId) &&
                                    activeTool !== "stamp"
                                );
                                const isSelected = String(selectedItemId) === String(item?.id);
                                const handleSelectItem = () => {
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
                                            strokeWidth={Number(item?.payload?.size) || 3}
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
                            })}

                            {isDrawing && draftDoodlePoints.length >= 4 && (
                                <Line
                                    points={draftDoodlePoints.map((point, pointIndex) => (
                                        pointIndex % 2 === 0 ? point * stageWidth : point * stageHeight
                                    ))}
                                    stroke={doodleColor}
                                    strokeWidth={doodleSize}
                                    lineCap="round"
                                    lineJoin="round"
                                    tension={0.12}
                                />
                            )}
                        </Layer>
                    </Stage>
                )}
            </div>

            {wallError && (
                <div className="freedom-wall-error-toast">{wallError}</div>
            )}

            <div className="freedom-wall-footer">
                <span>{sortedItems.length} items this week</span>
                <span>
                    {createItemMutation.isPending || updateItemMutation.isPending || deleteItemMutation.isPending
                        ? "Syncing..."
                        : "Synced"}
                </span>
            </div>
        </div>
    );
};

export default FreedomWallPage;
