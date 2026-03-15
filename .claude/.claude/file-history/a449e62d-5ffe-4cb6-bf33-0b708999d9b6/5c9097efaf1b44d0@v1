import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Text } from "react-konva";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addCanvasMargin, addCanvasStamp, deleteCanvasMargin, deleteCanvasStamp, getCanvasMargins, getCanvasStamps } from "../../../../API/Api";
import { useAuth } from "../../../Context/useAuth";
import supabase from "../../../utils/supabaseClient";
import { parseCanvasDoc } from "../../../utils/canvasDoc";
import CanvasSurface, { buildSortedCanvasObjects, getCanvasStageHeight } from "./CanvasSurface";
import styles from "./CanvasEditor.module.css";
import "./canvas.css";

const STAMP_ICONS = {
    heart: "❤️",
    star: "⭐",
    question: "❓",
    fire: "🔥"
};

const CANVAS_MAX_WIDTH = 560;
const MOBILE_BREAKPOINT = 820;
const CANVAS_ROOT_SNIPPET_ID = "canvas-root";
const STAMP_SIZE = 34;
const STAMP_FONT_SIZE = 30;
const PROFILE_SIZE = 13;
const STICKY_WIDTH = 172;
const STICKY_HEIGHT = 118;
const REALTIME_CHANNEL_SUFFIX_LENGTH = 8;
const OPTIMISTIC_STAMP_PREFIX = "optimistic-stamp";
const OPTIMISTIC_MARGIN_PREFIX = "optimistic-margin";
const DOODLE_COLOR_PRESETS = [
    "#5f92ff",
    "#ff4d6d",
    "#ff7f11",
    "#ffd23f",
    "#22c55e",
    "#14b8a6",
    "#8b5cf6",
    "#111827",
    "#ffffff"
];
const LIVE_DOODLE_BROADCAST_EVENT = "doodle-progress";
const LIVE_DOODLE_END_EVENT = "doodle-end";
const LIVE_DOODLE_BROADCAST_INTERVAL_MS = 40;
const LIVE_DOODLE_STALE_MS = 2200;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const createOptimisticId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const toTimestamp = (value) => {
    const parsed = Date.parse(value || "");
    return Number.isNaN(parsed) ? 0 : parsed;
};
const sortByCreatedAt = (a, b) => {
    const byDate = toTimestamp(a?.created_at) - toTimestamp(b?.created_at);
    if(byDate !== 0){
        return byDate;
    }
    return String(a?.id || "").localeCompare(String(b?.id || ""));
};
const sanitizeNormalizedPoints = (rawPoints) => {
    if(!Array.isArray(rawPoints)){
        return [];
    }

    const numericPoints = rawPoints
        .map((point) => Number(point))
        .filter((point) => !Number.isNaN(point))
        .map((point) => clamp(point, 0, 1));

    if(numericPoints.length < 2){
        return [];
    }

    return numericPoints.length % 2 === 0
        ? numericPoints
        : numericPoints.slice(0, -1);
};
const getNameInitial = (name) => {
    const normalizedName = typeof name === "string" ? name.trim() : "";
    return normalizedName ? normalizedName.slice(0, 1).toUpperCase() : "?";
};

const useLoadedImage = (src) => {
    const [image, setImage] = useState(null);

    useEffect(() => {
        if(!src){
            setImage(null);
            return;
        }

        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.onload = () => setImage(img);
        img.onerror = () => setImage(null);
        img.src = src;

        return () => {
            img.onload = null;
            img.onerror = null;
        };
    }, [src]);

    return image;
};

const emojiCanvasCache = new Map();

const useEmojiImage = (emoji, size) => {
    const [image, setImage] = useState(null);

    useEffect(() => {
        if(!emoji){
            setImage(null);
            return;
        }

        const cacheKey = `${emoji}_${size}`;
        if(emojiCanvasCache.has(cacheKey)){
            setImage(emojiCanvasCache.get(cacheKey));
            return;
        }

        const canvas = document.createElement("canvas");
        const scale = window.devicePixelRatio || 1;
        canvas.width = size * scale;
        canvas.height = size * scale;
        const ctx = canvas.getContext("2d");
        ctx.scale(scale, scale);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `${size * 0.82}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Android Emoji", sans-serif`;
        ctx.fillText(emoji, size / 2, size / 2);

        const img = new window.Image();
        img.onload = () => {
            emojiCanvasCache.set(cacheKey, img);
            setImage(img);
        };
        img.src = canvas.toDataURL();
    }, [emoji, size]);

    return image;
};

const StampNode = ({stamp, stageWidth, stageHeight, canDelete, onDelete, stampScale = 1}) => {
    const avatarImage = useLoadedImage(stamp?.user_image_url);
    const icon = STAMP_ICONS[stamp?.stamp_type] || "✨";
    const stampSize = Math.max(20, Math.round(STAMP_SIZE * stampScale));
    const stampFontSize = Math.max(18, Math.round(STAMP_FONT_SIZE * stampScale));
    const profileSize = Math.max(9, Math.round(PROFILE_SIZE * stampScale));
    const avatarYOffset = Math.max(3, Math.round(6 * stampScale));
    const avatarBottomSpacing = Math.max(6, Math.round(10 * stampScale));
    const avatarLabelSize = Math.max(6, Math.round(8 * stampScale));
    const emojiImage = useEmojiImage(icon, stampSize);
    const stampX = clamp((stamp?.x || 0) * stageWidth, 0, Math.max(0, stageWidth - stampSize));
    const stampY = clamp((stamp?.y || 0) * stageHeight, 0, Math.max(0, stageHeight - (stampSize + profileSize + avatarBottomSpacing)));
    const avatarCenterX = stampX + (stampSize / 2);
    const avatarCenterY = stampY + stampSize + (profileSize / 2) + avatarYOffset;
    const avatarRadius = profileSize / 2;
    const avatarStrokeWidth = Math.max(0.5, 0.7 * stampScale);

    const handleDelete = () => {
        if(canDelete){
            onDelete();
        }
    };

    return (
        <Group onClick={handleDelete} onTap={handleDelete}>
            <Circle
                x={stampX + (stampSize / 2)}
                y={stampY + (stampSize / 2)}
                radius={(stampSize / 2) + Math.max(1, 1.8 * stampScale)}
                fill="rgba(255,255,255,0.78)"
                shadowColor="rgba(0,0,0,0.22)"
                shadowBlur={Math.max(3, 5 * stampScale)}
                shadowOffsetY={Math.max(1, 2 * stampScale)}
                listening={false}
            />
            {emojiImage ? (
                <KonvaImage
                    x={stampX}
                    y={stampY}
                    width={stampSize}
                    height={stampSize}
                    image={emojiImage}
                    listening={false}
                />
            ) : (
                <Text
                    x={stampX}
                    y={stampY}
                    width={stampSize}
                    height={stampSize}
                    text={icon}
                    fontSize={stampFontSize}
                    align="center"
                    verticalAlign="middle"
                    listening={false}
                />
            )}
            <Circle
                x={avatarCenterX}
                y={avatarCenterY}
                radius={avatarRadius + 1.2}
                fill="rgba(0,0,0,0.22)"
                listening={false}
            />
            {avatarImage ? (
                <Group
                    clipFunc={(ctx) => {
                        ctx.arc(avatarCenterX, avatarCenterY, avatarRadius, 0, Math.PI * 2, false);
                    }}
                    listening={false}
                >
                    <KonvaImage
                        x={avatarCenterX - avatarRadius}
                        y={avatarCenterY - avatarRadius}
                        width={profileSize}
                        height={profileSize}
                        image={avatarImage}
                        listening={false}
                    />
                </Group>
            ) : (
                <>
                    <Circle
                        x={avatarCenterX}
                        y={avatarCenterY}
                        radius={avatarRadius}
                        fill="#c9d0dc"
                        stroke="rgba(255,255,255,0.95)"
                        strokeWidth={avatarStrokeWidth}
                        listening={false}
                    />
                    <Text
                        x={avatarCenterX - avatarRadius}
                        y={avatarCenterY - avatarRadius}
                        width={profileSize}
                        height={profileSize}
                        text={getNameInitial(stamp?.user_name)}
                        fontSize={avatarLabelSize}
                        fontStyle="bold"
                        fill="#1f2c3f"
                        align="center"
                        verticalAlign="middle"
                        listening={false}
                    />
                </>
            )}
        </Group>
    );
};

const CanvasViewer = ({journalId, canvasDoc, authorId}) => {
    const {session, user, openAuthModal} = useAuth();
    const queryClient = useQueryClient();
    const shellRef = useRef(null);
    const stageRef = useRef(null);
    const viewerClientIdRef = useRef(createOptimisticId("canvas-client"));
    const realtimeChannelRef = useRef(null);
    const currentDoodlePointsRef = useRef([]);
    const pendingDoodlePayloadRef = useRef(null);
    const doodleBroadcastTimerRef = useRef(null);
    const lastDoodleBroadcastAtRef = useRef(0);

    const [shellWidth, setShellWidth] = useState(CANVAS_MAX_WIDTH);
    const [activeStampType, setActiveStampType] = useState("heart");
    const [activeTool, setActiveTool] = useState("stamp");
    const [draggingStampType, setDraggingStampType] = useState("");
    const [isDropActive, setIsDropActive] = useState(false);
    const [doodleColor, setDoodleColor] = useState("#5f92ff");
    const [doodleSize, setDoodleSize] = useState(2.8);
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentDoodlePoints, setCurrentDoodlePoints] = useState([]);
    const [liveDoodlesByClient, setLiveDoodlesByClient] = useState({});
    const [isMobileViewport, setIsMobileViewport] = useState(false);
    const [isMobileDockOpen, setIsMobileDockOpen] = useState(false);

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

    useEffect(() => {
        const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
        const syncViewport = () => setIsMobileViewport(mediaQuery.matches);
        syncViewport();

        if(typeof mediaQuery.addEventListener === "function"){
            mediaQuery.addEventListener("change", syncViewport);
            return () => mediaQuery.removeEventListener("change", syncViewport);
        }

        mediaQuery.addListener(syncViewport);
        return () => mediaQuery.removeListener(syncViewport);
    }, []);

    useEffect(() => {
        if(isMobileViewport){
            setIsMobileDockOpen(false);
            return;
        }
        setIsMobileDockOpen(true);
    }, [isMobileViewport]);

    const stageWidth = useMemo(() => Math.max(240, Math.min(CANVAS_MAX_WIDTH, shellWidth)), [shellWidth]);
    const stageHeight = getCanvasStageHeight(stageWidth, parsedCanvasDoc?.meta?.aspectRatio);
    const doodleStrokeScale = useMemo(() => clamp(stageWidth / CANVAS_MAX_WIDTH, 0.45, 1), [stageWidth]);
    const stampScale = useMemo(() => clamp(stageWidth / CANVAS_MAX_WIDTH, 0.6, 1), [stageWidth]);
    const stickyScale = useMemo(() => clamp(stageWidth / CANVAS_MAX_WIDTH, 0.62, 1), [stageWidth]);
    const stickyWidth = useMemo(() => Math.max(116, Math.round(STICKY_WIDTH * stickyScale)), [stickyScale]);
    const stickyHeight = useMemo(() => Math.max(82, Math.round(STICKY_HEIGHT * stickyScale)), [stickyScale]);
    const stickyPadding = useMemo(() => Math.max(7, Math.round(10 * stickyScale)), [stickyScale]);
    const stickyFontSize = useMemo(() => Math.max(12, Number((15 * stickyScale).toFixed(2))), [stickyScale]);
    const stickyCornerRadius = useMemo(() => Math.max(6, Number((8 * stickyScale).toFixed(2))), [stickyScale]);
    const stickyShadowBlur = useMemo(() => Math.max(4, Number((8 * stickyScale).toFixed(2))), [stickyScale]);
    const stickyShadowOffsetY = useMemo(() => Math.max(2, Number((3 * stickyScale).toFixed(2))), [stickyScale]);

    const {data: stampData} = useQuery({
        queryKey: ["canvasStamps", journalId],
        queryFn: () => getCanvasStamps(journalId, session?.access_token),
        enabled: !!journalId,
        refetchOnWindowFocus: false
    });

    const {data: marginData} = useQuery({
        queryKey: ["canvasMargins", journalId],
        queryFn: () => getCanvasMargins(journalId, session?.access_token),
        enabled: !!journalId,
        refetchOnWindowFocus: false
    });

    const stampsQueryKey = useMemo(() => ["canvasStamps", journalId], [journalId]);
    const marginsQueryKey = useMemo(() => ["canvasMargins", journalId], [journalId]);
    const currentUserProfile = user?.userData?.[0] || null;
    const currentUserId = currentUserProfile?.id || null;
    const canUseDoodle = Boolean(currentUserId && String(currentUserId) === String(authorId));

    useEffect(() => {
        if(!canUseDoodle && activeTool === "doodle"){
            setActiveTool("stamp");
            setIsDrawing(false);
            setCurrentDoodlePoints([]);
            currentDoodlePointsRef.current = [];
        }
    }, [activeTool, canUseDoodle]);

    const getKnownUserProfile = useCallback((targetUserId) => {
        if(!targetUserId){
            return {user_name: null, user_image_url: null};
        }

        if(currentUserProfile?.id === targetUserId){
            return {
                user_name: currentUserProfile?.name || null,
                user_image_url: currentUserProfile?.image_url || null
            };
        }

        const knownStamps = queryClient.getQueryData(stampsQueryKey)?.stamps || [];
        const knownMargins = queryClient.getQueryData(marginsQueryKey)?.items || [];
        const match = [...knownStamps, ...knownMargins].find((item) => (
            item?.user_id === targetUserId && (item?.user_name || item?.user_image_url)
        ));

        return {
            user_name: match?.user_name || null,
            user_image_url: match?.user_image_url || null
        };
    }, [currentUserProfile?.id, currentUserProfile?.image_url, currentUserProfile?.name, marginsQueryKey, queryClient, stampsQueryKey]);

    const normalizeStampRow = useCallback((row) => {
        if(!row?.id){
            return null;
        }
        const knownProfile = getKnownUserProfile(row.user_id);
        return {
            id: row.id,
            journal_id: row.journal_id,
            user_id: row.user_id,
            snippet_id: row.snippet_id,
            word_key: row.word_key,
            stamp_type: row.stamp_type,
            x: row.x,
            y: row.y,
            created_at: row.created_at,
            user_name: row.user_name ?? knownProfile.user_name ?? null,
            user_image_url: row.user_image_url ?? knownProfile.user_image_url ?? null
        };
    }, [getKnownUserProfile]);

    const normalizeMarginRow = useCallback((row) => {
        if(!row?.id){
            return null;
        }
        const knownProfile = getKnownUserProfile(row.user_id);
        return {
            id: row.id,
            journal_id: row.journal_id,
            user_id: row.user_id,
            item_type: row.item_type,
            payload: row.payload || null,
            created_at: row.created_at,
            updated_at: row.updated_at,
            user_name: row.user_name ?? knownProfile.user_name ?? null,
            user_image_url: row.user_image_url ?? knownProfile.user_image_url ?? null
        };
    }, [getKnownUserProfile]);

    const upsertStampCache = useCallback((stamp) => {
        if(!stamp?.id){
            return;
        }

        queryClient.setQueryData(stampsQueryKey, (old) => {
            const previous = Array.isArray(old?.stamps) ? old.stamps : [];
            const existingIndex = previous.findIndex((item) => String(item?.id) === String(stamp.id));
            let nextStamps = previous;

            if(existingIndex === -1){
                nextStamps = [...previous, stamp];
            } else {
                nextStamps = [...previous];
                nextStamps[existingIndex] = {...nextStamps[existingIndex], ...stamp};
            }

            nextStamps.sort(sortByCreatedAt);
            return {...(old || {}), stamps: nextStamps};
        });
    }, [queryClient, stampsQueryKey]);

    const upsertMarginCache = useCallback((item) => {
        if(!item?.id){
            return;
        }

        queryClient.setQueryData(marginsQueryKey, (old) => {
            const previous = Array.isArray(old?.items) ? old.items : [];
            const existingIndex = previous.findIndex((entry) => String(entry?.id) === String(item.id));
            let nextItems = previous;

            if(existingIndex === -1){
                nextItems = [...previous, item];
            } else {
                nextItems = [...previous];
                nextItems[existingIndex] = {...nextItems[existingIndex], ...item};
            }

            nextItems.sort(sortByCreatedAt);
            return {...(old || {}), items: nextItems};
        });
    }, [marginsQueryKey, queryClient]);

    const removeStampFromCache = useCallback((stampId) => {
        if(!stampId){
            return null;
        }

        let removedStamp = null;
        queryClient.setQueryData(stampsQueryKey, (old) => {
            const previous = Array.isArray(old?.stamps) ? old.stamps : [];
            removedStamp = previous.find((item) => String(item?.id) === String(stampId)) || null;
            const nextStamps = previous.filter((item) => String(item?.id) !== String(stampId));
            return {...(old || {}), stamps: nextStamps};
        });
        return removedStamp;
    }, [queryClient, stampsQueryKey]);

    const removeMarginFromCache = useCallback((marginId) => {
        if(!marginId){
            return null;
        }

        let removedItem = null;
        queryClient.setQueryData(marginsQueryKey, (old) => {
            const previous = Array.isArray(old?.items) ? old.items : [];
            removedItem = previous.find((entry) => String(entry?.id) === String(marginId)) || null;
            const nextItems = previous.filter((entry) => String(entry?.id) !== String(marginId));
            return {...(old || {}), items: nextItems};
        });
        return removedItem;
    }, [marginsQueryKey, queryClient]);

    const eventBelongsToJournal = useCallback((payload) => {
        const journalIdAsString = String(journalId);
        const newJournalId = payload?.new?.journal_id;
        const oldJournalId = payload?.old?.journal_id;

        if(newJournalId !== undefined){
            return String(newJournalId) === journalIdAsString;
        }
        if(oldJournalId !== undefined){
            return String(oldJournalId) === journalIdAsString;
        }
        return null;
    }, [journalId]);

    const clearQueuedDoodleBroadcast = useCallback(() => {
        if(doodleBroadcastTimerRef.current){
            clearTimeout(doodleBroadcastTimerRef.current);
            doodleBroadcastTimerRef.current = null;
        }
    }, []);

    const sendBroadcastEvent = useCallback((eventName, payload) => {
        const channel = realtimeChannelRef.current;
        if(!channel){
            return;
        }

        channel.send({
            type: "broadcast",
            event: eventName,
            payload: payload
        }).catch((error) => {
            console.error("Failed to send canvas broadcast event:", error);
        });
    }, []);

    const flushQueuedDoodleBroadcast = useCallback(() => {
        if(!pendingDoodlePayloadRef.current){
            return;
        }

        const nextPayload = pendingDoodlePayloadRef.current;
        pendingDoodlePayloadRef.current = null;
        lastDoodleBroadcastAtRef.current = Date.now();
        sendBroadcastEvent(LIVE_DOODLE_BROADCAST_EVENT, nextPayload);
    }, [sendBroadcastEvent]);

    const queueDoodleBroadcast = useCallback((payload, immediate = false) => {
        pendingDoodlePayloadRef.current = payload;
        if(immediate){
            clearQueuedDoodleBroadcast();
            flushQueuedDoodleBroadcast();
            return;
        }

        const elapsed = Date.now() - lastDoodleBroadcastAtRef.current;
        const delay = Math.max(0, LIVE_DOODLE_BROADCAST_INTERVAL_MS - elapsed);
        if(doodleBroadcastTimerRef.current){
            return;
        }

        doodleBroadcastTimerRef.current = setTimeout(() => {
            doodleBroadcastTimerRef.current = null;
            flushQueuedDoodleBroadcast();
        }, delay);
    }, [clearQueuedDoodleBroadcast, flushQueuedDoodleBroadcast]);

    const broadcastDoodleEnd = useCallback((points = []) => {
        clearQueuedDoodleBroadcast();
        pendingDoodlePayloadRef.current = null;
        sendBroadcastEvent(LIVE_DOODLE_END_EVENT, {
            journalId: String(journalId),
            clientId: viewerClientIdRef.current,
            userId: currentUserProfile?.id || null,
            points: sanitizeNormalizedPoints(points),
            endedAt: Date.now()
        });
    }, [clearQueuedDoodleBroadcast, currentUserProfile?.id, journalId, sendBroadcastEvent]);

    useEffect(() => {
        if(!journalId){
            return;
        }

        const journalIdAsString = String(journalId);
        const realtimeChannelName = `canvas-live-${journalIdAsString}-${Math.random().toString(36).slice(2, REALTIME_CHANNEL_SUFFIX_LENGTH + 2)}`;

        const channel = supabase
        .channel(realtimeChannelName)
        .on(
            "postgres_changes",
            {event: "*", schema: "public", table: "canvas_stamps", filter: `journal_id=eq.${journalIdAsString}`},
            (payload) => {
                if(payload?.eventType === "DELETE"){
                    if(payload?.old?.id){
                        removeStampFromCache(payload.old.id);
                    }
                    return;
                }

                const nextStamp = normalizeStampRow(payload?.new);
                if(nextStamp){
                    upsertStampCache(nextStamp);
                }
            }
        )
        .on(
            "postgres_changes",
            {event: "DELETE", schema: "public", table: "canvas_stamps"},
            (payload) => {
                const match = eventBelongsToJournal(payload);
                if(match === true && payload?.old?.id){
                    removeStampFromCache(payload.old.id);
                    return;
                }

                // Fallback for environments where DELETE payload omits journal_id.
                if(match === null){
                    queryClient.invalidateQueries({queryKey: stampsQueryKey});
                }
            }
        )
        .on(
            "postgres_changes",
            {event: "*", schema: "public", table: "canvas_margin_items", filter: `journal_id=eq.${journalIdAsString}`},
            (payload) => {
                if(payload?.eventType === "DELETE"){
                    if(payload?.old?.id){
                        removeMarginFromCache(payload.old.id);
                    }
                    return;
                }

                const nextMargin = normalizeMarginRow(payload?.new);
                if(nextMargin){
                    upsertMarginCache(nextMargin);
                }
            }
        )
        .on(
            "postgres_changes",
            {event: "DELETE", schema: "public", table: "canvas_margin_items"},
            (payload) => {
                const match = eventBelongsToJournal(payload);
                if(match === true && payload?.old?.id){
                    removeMarginFromCache(payload.old.id);
                    return;
                }

                // Fallback for environments where DELETE payload omits journal_id.
                if(match === null){
                    queryClient.invalidateQueries({queryKey: marginsQueryKey});
                }
            }
        )
        .on(
            "broadcast",
            {event: LIVE_DOODLE_BROADCAST_EVENT},
            ({payload}) => {
                if(!payload || String(payload?.journalId) !== journalIdAsString){
                    return;
                }
                const remoteClientId = typeof payload?.clientId === "string" ? payload.clientId : "";
                if(!remoteClientId || remoteClientId === viewerClientIdRef.current){
                    return;
                }

                const points = sanitizeNormalizedPoints(payload?.points);
                if(points.length < 2){
                    return;
                }

                setLiveDoodlesByClient((prev) => ({
                    ...prev,
                    [remoteClientId]: {
                        clientId: remoteClientId,
                        points: points,
                        color: typeof payload?.color === "string" ? payload.color : "#5f92ff",
                        size: Number(payload?.size) || 2.8,
                        updatedAt: Date.now()
                    }
                }));
            }
        )
        .on(
            "broadcast",
            {event: LIVE_DOODLE_END_EVENT},
            ({payload}) => {
                if(!payload || String(payload?.journalId) !== journalIdAsString){
                    return;
                }
                const remoteClientId = typeof payload?.clientId === "string" ? payload.clientId : "";
                if(!remoteClientId || remoteClientId === viewerClientIdRef.current){
                    return;
                }

                setLiveDoodlesByClient((prev) => {
                    const next = {...prev};
                    delete next[remoteClientId];
                    return next;
                });
            }
        )
        .subscribe();

        realtimeChannelRef.current = channel;

        return () => {
            if(realtimeChannelRef.current === channel){
                realtimeChannelRef.current = null;
            }
            supabase.removeChannel(channel);
        };
    }, [eventBelongsToJournal, journalId, marginsQueryKey, normalizeMarginRow, normalizeStampRow, queryClient, removeMarginFromCache, removeStampFromCache, stampsQueryKey, upsertMarginCache, upsertStampCache]);

    useEffect(() => {
        setLiveDoodlesByClient({});
    }, [journalId]);

    useEffect(() => {
        const intervalId = setInterval(() => {
            const now = Date.now();
            setLiveDoodlesByClient((prev) => {
                const next = {};
                let hasChanged = false;

                Object.entries(prev).forEach(([clientId, value]) => {
                    if(now - (value?.updatedAt || 0) <= LIVE_DOODLE_STALE_MS){
                        next[clientId] = value;
                    } else {
                        hasChanged = true;
                    }
                });

                return hasChanged ? next : prev;
            });
        }, Math.max(500, Math.round(LIVE_DOODLE_STALE_MS / 2)));

        return () => {
            clearInterval(intervalId);
        };
    }, []);

    useEffect(() => {
        return () => {
            clearQueuedDoodleBroadcast();
            pendingDoodlePayloadRef.current = null;
            if(currentDoodlePointsRef.current.length >= 2 && realtimeChannelRef.current){
                broadcastDoodleEnd(currentDoodlePointsRef.current);
            }
        };
    }, [broadcastDoodleEnd, clearQueuedDoodleBroadcast]);

    const addStampMutation = useMutation({
        mutationFn: (payload) => addCanvasStamp(session?.access_token, payload),
        onMutate: async(payload) => {
            const tempId = createOptimisticId(OPTIMISTIC_STAMP_PREFIX);
            upsertStampCache(normalizeStampRow({
                id: tempId,
                journal_id: journalId,
                user_id: currentUserProfile?.id || null,
                snippet_id: payload?.snippetId,
                word_key: payload?.wordKey || null,
                stamp_type: payload?.stampType,
                x: payload?.x,
                y: payload?.y,
                created_at: new Date().toISOString(),
                user_name: currentUserProfile?.name || null,
                user_image_url: currentUserProfile?.image_url || null
            }));
            return {tempId: tempId};
        },
        onSuccess: (response, _payload, context) => {
            if(context?.tempId){
                removeStampFromCache(context.tempId);
            }

            const savedStamp = normalizeStampRow(response?.stamp);
            if(savedStamp){
                upsertStampCache(savedStamp);
            }
        },
        onError: (error, _payload, context) => {
            if(context?.tempId){
                removeStampFromCache(context.tempId);
            }
            console.error("Failed to add stamp:", error);
        }
    });

    const deleteStampMutation = useMutation({
        mutationFn: (stampId) => deleteCanvasStamp(session?.access_token, stampId),
        onMutate: async(stampId) => {
            const removedStamp = removeStampFromCache(stampId);
            return {removedStamp: removedStamp};
        },
        onError: (error, _stampId, context) => {
            if(context?.removedStamp){
                upsertStampCache(context.removedStamp);
            }
            console.error("Failed to delete stamp:", error);
        },
        onSuccess: (_response, stampId) => {
            removeStampFromCache(stampId);
        }
    });

    const addMarginMutation = useMutation({
        mutationFn: (payload) => addCanvasMargin(session?.access_token, payload),
        onMutate: async(payload) => {
            const tempId = createOptimisticId(OPTIMISTIC_MARGIN_PREFIX);
            upsertMarginCache(normalizeMarginRow({
                id: tempId,
                journal_id: journalId,
                user_id: currentUserProfile?.id || null,
                item_type: payload?.itemType,
                payload: payload?.payload || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                user_name: currentUserProfile?.name || null,
                user_image_url: currentUserProfile?.image_url || null
            }));
            return {tempId: tempId};
        },
        onSuccess: (response, _payload, context) => {
            if(context?.tempId){
                removeMarginFromCache(context.tempId);
            }

            const savedItem = normalizeMarginRow(response?.item);
            if(savedItem){
                upsertMarginCache(savedItem);
            }
        },
        onError: (error, _payload, context) => {
            if(context?.tempId){
                removeMarginFromCache(context.tempId);
            }
            console.error("Failed to add canvas margin item:", error);
        }
    });

    const deleteMarginMutation = useMutation({
        mutationFn: (marginId) => deleteCanvasMargin(session?.access_token, marginId),
        onMutate: async(marginId) => {
            const removedItem = removeMarginFromCache(marginId);
            return {removedItem: removedItem};
        },
        onError: (error, _marginId, context) => {
            if(context?.removedItem){
                upsertMarginCache(context.removedItem);
            }
            console.error("Failed to delete canvas margin item:", error);
        },
        onSuccess: (_response, marginId) => {
            removeMarginFromCache(marginId);
        }
    });

    const addStampAt = ({stampType, x, y, targetId = CANVAS_ROOT_SNIPPET_ID}) => {
        if(!session){
            if(openAuthModal){
                openAuthModal();
            }
            return;
        }

        const normalizedStampType = STAMP_ICONS[stampType] ? stampType : activeStampType;
        if(!STAMP_ICONS[normalizedStampType]){
            return;
        }

        const normalizedX = clamp(x, 0, 1);
        const normalizedY = clamp(y, 0, 1);

        addStampMutation.mutate({
            journalId: journalId,
            snippetId: targetId || CANVAS_ROOT_SNIPPET_ID,
            stampType: normalizedStampType,
            x: normalizedX,
            y: normalizedY
        });
    };

    const addMarginItem = ({itemType, payload}) => {
        if(!session){
            if(openAuthModal){
                openAuthModal();
            }
            return;
        }

        if(itemType !== "doodle"){
            return;
        }
        if(!canUseDoodle){
            return;
        }

        addMarginMutation.mutate({
            journalId: journalId,
            itemType: itemType,
            payload: payload
        });
    };

    const handleAddStampOnObject = (targetId, evt) => {
        if(activeTool !== "stamp"){
            return;
        }
        if(!session){
            if(openAuthModal){
                openAuthModal();
            }
            return;
        }

        const stage = evt.target.getStage();
        const pointer = stage?.getPointerPosition();
        if(!pointer){
            return;
        }

        addStampAt({
            stampType: activeStampType,
            targetId: targetId,
            x: pointer.x / stageWidth,
            y: pointer.y / stageHeight
        });
    };

    const handlePlaceStampOnCanvas = (evt) => {
        if(activeTool !== "stamp"){
            return;
        }
        const stage = evt.target.getStage();
        if(!stage || evt.target !== stage){
            return;
        }

        const pointer = stage.getPointerPosition();
        if(!pointer){
            return;
        }

        addStampAt({
            stampType: activeStampType,
            x: pointer.x / stageWidth,
            y: pointer.y / stageHeight
        });
    };

    const getNormalizedPointer = (stage) => {
        const pointer = stage?.getPointerPosition();
        if(!pointer){
            return null;
        }

        return {
            x: clamp(pointer.x / stageWidth, 0, 1),
            y: clamp(pointer.y / stageHeight, 0, 1)
        };
    };

    const handleCanvasPointerDown = (evt) => {
        if(isMobileViewport && isMobileDockOpen){
            setIsMobileDockOpen(false);
        }

        if(activeTool === "doodle" && !canUseDoodle){
            setActiveTool("stamp");
            return;
        }

        const nativeEvent = evt?.evt;
        if(activeTool === "doodle" && nativeEvent?.cancelable){
            nativeEvent.preventDefault();
        }

        if(activeTool !== "doodle"){
            return;
        }

        if(!session){
            if(openAuthModal){
                openAuthModal();
            }
            return;
        }

        const stage = evt.target.getStage();
        const pointer = getNormalizedPointer(stage);
        if(!pointer){
            return;
        }

        const startingPoints = [pointer.x, pointer.y];
        currentDoodlePointsRef.current = startingPoints;
        setIsDrawing(true);
        setCurrentDoodlePoints(startingPoints);
        queueDoodleBroadcast({
            journalId: String(journalId),
            clientId: viewerClientIdRef.current,
            userId: currentUserProfile?.id || null,
            points: startingPoints,
            color: doodleColor,
            size: doodleSize,
            startedAt: Date.now()
        }, true);
    };

    const handleCanvasPointerMove = (evt) => {
        if(activeTool === "doodle" && !canUseDoodle){
            return;
        }

        const nativeEvent = evt?.evt;
        if(activeTool === "doodle" && nativeEvent?.cancelable){
            nativeEvent.preventDefault();
        }

        if(activeTool !== "doodle" || !isDrawing){
            return;
        }

        const stage = evt.target.getStage();
        const pointer = getNormalizedPointer(stage);
        if(!pointer){
            return;
        }

        const nextPoints = [...currentDoodlePointsRef.current, pointer.x, pointer.y];
        currentDoodlePointsRef.current = nextPoints;
        setCurrentDoodlePoints(nextPoints);
        queueDoodleBroadcast({
            journalId: String(journalId),
            clientId: viewerClientIdRef.current,
            userId: currentUserProfile?.id || null,
            points: nextPoints,
            color: doodleColor,
            size: doodleSize,
            updatedAt: Date.now()
        });
    };

    const handleCanvasPointerUp = () => {
        if(activeTool === "doodle" && !canUseDoodle){
            setIsDrawing(false);
            setCurrentDoodlePoints([]);
            currentDoodlePointsRef.current = [];
            return;
        }

        if(activeTool !== "doodle"){
            return;
        }

        const finishedPoints = currentDoodlePointsRef.current;
        if(isDrawing && finishedPoints.length >= 4){
            addMarginItem({
                itemType: "doodle",
                payload: {
                    points: finishedPoints,
                    color: doodleColor,
                    size: doodleSize
                }
            });
        }

        if(finishedPoints.length >= 2){
            broadcastDoodleEnd(finishedPoints);
        }

        setIsDrawing(false);
        setCurrentDoodlePoints([]);
        currentDoodlePointsRef.current = [];
    };

    const handleStageClick = (evt) => {
        if(activeTool === "stamp"){
            handlePlaceStampOnCanvas(evt);
        }
    };

    const handleStampDragStart = (stampType) => (event) => {
        if(activeTool !== "stamp"){
            event.preventDefault();
            return;
        }
        if(!session){
            if(openAuthModal){
                openAuthModal();
            }
            event.preventDefault();
            return;
        }

        setDraggingStampType(stampType);
        if(event.dataTransfer){
            event.dataTransfer.effectAllowed = "copy";
            event.dataTransfer.setData("application/x-iskrib-stamp", stampType);
            event.dataTransfer.setData("text/plain", stampType);
        }
    };

    const handleStampDragEnd = () => {
        setDraggingStampType("");
        setIsDropActive(false);
    };

    const handleStageDragOver = (event) => {
        if(activeTool !== "stamp"){
            return;
        }
        const transferredStamp = event.dataTransfer?.getData("application/x-iskrib-stamp");
        if(!draggingStampType && !STAMP_ICONS[transferredStamp]){
            return;
        }
        event.preventDefault();
        if(event.dataTransfer){
            event.dataTransfer.dropEffect = "copy";
        }
        if(!isDropActive){
            setIsDropActive(true);
        }
    };

    const handleStageDragLeave = () => {
        if(isDropActive){
            setIsDropActive(false);
        }
    };

    const handleStageDrop = (event) => {
        if(activeTool !== "stamp"){
            return;
        }
        event.preventDefault();

        const droppedStampType = event.dataTransfer?.getData("application/x-iskrib-stamp") || draggingStampType;
        const stageContainer = stageRef.current?.container();
        if(!stageContainer || !STAMP_ICONS[droppedStampType]){
            setDraggingStampType("");
            setIsDropActive(false);
            return;
        }

        const stageRect = stageContainer.getBoundingClientRect();
        const localX = event.clientX - stageRect.left;
        const localY = event.clientY - stageRect.top;

        const normalizedX = localX / stageRect.width;
        const normalizedY = localY / stageRect.height;
        addStampAt({
            stampType: droppedStampType,
            x: normalizedX,
            y: normalizedY
        });

        setDraggingStampType("");
        setIsDropActive(false);
    };

    const stamps = stampData?.stamps || [];
    const marginItems = marginData?.items || [];
    const doodleItems = marginItems.filter((item) => item?.item_type === "doodle");
    const liveDoodleItems = Object.values(liveDoodlesByClient);
    const stickyItems = marginItems.filter((item) => item?.item_type === "sticky");
    const isDockVisible = !isMobileViewport || isMobileDockOpen;

    return (
        <div className={`${styles.editorRoot} ${styles.viewerRoot}`}>
            <div
                ref={shellRef}
                className={`${styles.stageShell} ${parsedCanvasDoc?.meta?.theme === "dark" ? styles.isDark : ""} ${isDropActive ? styles.isDropActive : ""} ${activeTool === "doodle" && canUseDoodle ? styles.isDoodleActive : ""}`}
                onDragOver={handleStageDragOver}
                onDragLeave={handleStageDragLeave}
                onDrop={handleStageDrop}
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
                        shouldPreventTouchDefault={activeTool === "doodle" && canUseDoodle}
                        activeTool={activeTool === "doodle" && canUseDoodle ? "doodle" : "select"}
                        className={styles.stage}
                        onPointerDown={handleCanvasPointerDown}
                        onPointerMove={handleCanvasPointerMove}
                        onPointerUp={handleCanvasPointerUp}
                        onStageClick={handleStageClick}
                        onStageTap={handleStageClick}
                        onSnippetPress={(snippet, event) => handleAddStampOnObject(snippet?.id, event)}
                        onImagePress={(image, event) => handleAddStampOnObject(image?.id, event)}
                    >
                        <Layer>
                            {stamps.map((stamp) => {
                                const canDelete = currentUserId && (stamp.user_id === currentUserId || authorId === currentUserId);
                                return (
                                    <StampNode
                                        key={stamp.id}
                                        stamp={stamp}
                                        stageWidth={stageWidth}
                                        stageHeight={stageHeight}
                                        stampScale={stampScale}
                                        canDelete={canDelete}
                                        onDelete={() => deleteStampMutation.mutate(stamp.id)}
                                    />
                                );
                            })}
                        </Layer>

                        <Layer>
                            {doodleItems.map((item) => {
                                const canDelete = currentUserId && (item.user_id === currentUserId || authorId === currentUserId);
                                const points = Array.isArray(item?.payload?.points)
                                    ? item.payload.points
                                        .map((point) => Number(point))
                                        .filter((point) => !Number.isNaN(point))
                                    : [];
                                const stagePoints = points.map((point, index) => (
                                    index % 2 === 0 ? point * stageWidth : point * stageHeight
                                ));
                                return (
                                    <Line
                                        key={item.id}
                                        points={stagePoints}
                                        stroke={item?.payload?.color || "#5f92ff"}
                                        strokeWidth={(Number(item?.payload?.size) || 2.8) * doodleStrokeScale}
                                        lineCap="round"
                                        lineJoin="round"
                                        tension={0.35}
                                        onClick={() => {
                                            if(canDelete){
                                                deleteMarginMutation.mutate(item.id);
                                            }
                                        }}
                                        onTap={() => {
                                            if(canDelete){
                                                deleteMarginMutation.mutate(item.id);
                                            }
                                        }}
                                    />
                                );
                            })}

                            {liveDoodleItems.map((doodle) => (
                                <Line
                                    key={`live-doodle-${doodle.clientId}`}
                                    points={doodle.points.map((point, index) => (
                                        index % 2 === 0 ? point * stageWidth : point * stageHeight
                                    ))}
                                    stroke={doodle.color || "#5f92ff"}
                                    strokeWidth={(Number(doodle.size) || 2.8) * doodleStrokeScale}
                                    lineCap="round"
                                    lineJoin="round"
                                    tension={0.35}
                                    opacity={0.86}
                                    listening={false}
                                />
                            ))}

                            {isDrawing && currentDoodlePoints.length >= 2 && (
                                <Line
                                    points={currentDoodlePoints.map((point, index) => (
                                        index % 2 === 0 ? point * stageWidth : point * stageHeight
                                    ))}
                                    stroke={doodleColor}
                                    strokeWidth={doodleSize * doodleStrokeScale}
                                    lineCap="round"
                                    lineJoin="round"
                                    tension={0.35}
                                />
                            )}
                        </Layer>

                        <Layer>
                            {stickyItems.map((item) => {
                                const canDelete = currentUserId && (item.user_id === currentUserId || authorId === currentUserId);
                                const stickyX = clamp((Number(item?.payload?.x) || 0) * stageWidth, 0, Math.max(0, stageWidth - stickyWidth));
                                const stickyY = clamp((Number(item?.payload?.y) || 0) * stageHeight, 0, Math.max(0, stageHeight - stickyHeight));
                                return (
                                    <Group
                                        key={item.id}
                                        x={stickyX}
                                        y={stickyY}
                                        onClick={() => {
                                            if(canDelete){
                                                deleteMarginMutation.mutate(item.id);
                                            }
                                        }}
                                        onTap={() => {
                                            if(canDelete){
                                                deleteMarginMutation.mutate(item.id);
                                            }
                                        }}
                                    >
                                        <Rect
                                            width={stickyWidth}
                                            height={stickyHeight}
                                            cornerRadius={stickyCornerRadius}
                                            fill={item?.payload?.color || "#fff4a8"}
                                            shadowColor="rgba(0,0,0,0.18)"
                                            shadowBlur={stickyShadowBlur}
                                            shadowOffsetY={stickyShadowOffsetY}
                                        />
                                        <Text
                                            x={stickyPadding}
                                            y={stickyPadding}
                                            width={stickyWidth - (stickyPadding * 2)}
                                            height={stickyHeight - (stickyPadding * 2)}
                                            text={item?.payload?.text || ""}
                                            fontSize={stickyFontSize}
                                            lineHeight={1.25}
                                            fill="#1b1c1e"
                                            wrap="word"
                                        />
                                    </Group>
                                );
                            })}
                        </Layer>
                    </CanvasSurface>
                </div>
                <div className={styles.stageHud}>
                    <span className={styles.zoomBadge}>{activeTool === "stamp" ? "Stamp mode" : "Doodle mode"}</span>
                    {activeTool === "doodle" && canUseDoodle && <span className={styles.gestureHint}>Press and drag to doodle</span>}
                </div>
            </div>

            <div className={styles.editorFooter}>
                <span className={styles.wordCount}>
                    Community Margin · {stamps.length} {stamps.length === 1 ? "stamp" : "stamps"} · {doodleItems.length} {doodleItems.length === 1 ? "doodle" : "doodles"}
                </span>
            </div>

            <div className={`${styles.toolbarDock} ${styles.toolbarDockInCv}`}>
                {isMobileViewport && (
                    <button
                        type="button"
                        aria-label={isDockVisible ? "Close tool dock" : "Open tool dock"}
                        className={`${styles.toolbarOrb} ${isDockVisible ? styles.toolbarOrbOpen : ""}`}
                        onClick={() => setIsMobileDockOpen((prev) => !prev)}
                    >
                        {isDockVisible ? "Close" : "Tools"}
                    </button>
                )}

                {isDockVisible && (
                    <div className={styles.toolbarPanel}>
                        <div className={styles.toolbarRow}>
                            <button
                                type="button"
                                className={`${styles.toolButton} ${activeTool === "stamp" ? styles.toolButtonActive : ""}`}
                                onClick={() => setActiveTool("stamp")}
                            >
                                Stamps
                            </button>
                            {canUseDoodle && (
                                <button
                                    type="button"
                                    className={`${styles.toolButton} ${activeTool === "doodle" ? styles.toolButtonActive : ""}`}
                                    onClick={() => setActiveTool("doodle")}
                                >
                                    Doodle
                                </button>
                            )}
                        </div>

                        {activeTool === "stamp" && (
                            <div className={styles.toolbarRow}>
                                {Object.entries(STAMP_ICONS).map(([stampType, icon]) => (
                                    <button
                                        key={stampType}
                                        type="button"
                                        className={`${styles.toolButton} ${activeStampType === stampType ? styles.toolButtonActive : ""}`}
                                        onClick={() => setActiveStampType(stampType)}
                                        draggable={Boolean(session)}
                                        onDragStart={handleStampDragStart(stampType)}
                                        onDragEnd={handleStampDragEnd}
                                        title={session ? "Drag onto the canvas to place this stamp" : "Sign in to place stamps"}
                                        style={{fontSize: "1rem", lineHeight: 1, minWidth: "2.3rem"}}
                                    >
                                        {icon}
                                    </button>
                                ))}
                            </div>
                        )}

                        {activeTool === "doodle" && canUseDoodle && (
                            <div className={styles.toolbarColumn}>
                                <div className={styles.colorSwatches}>
                                    {DOODLE_COLOR_PRESETS.map((color) => (
                                        <button
                                            key={color}
                                            type="button"
                                            className={`${styles.colorSwatch} ${doodleColor.toLowerCase() === color.toLowerCase() ? styles.colorSwatchActive : ""}`}
                                            onClick={() => setDoodleColor(color)}
                                            title={`Use ${color} doodle color`}
                                            aria-label={`Select doodle color ${color}`}
                                            style={{backgroundColor: color}}
                                        />
                                    ))}
                                </div>
                                <div className={styles.toolbarRow}>
                                    <label className={styles.customColorLabel}>
                                        Custom
                                        <input
                                            type="color"
                                            value={doodleColor}
                                            onChange={(event) => setDoodleColor(event.target.value)}
                                            className={styles.colorInput}
                                            title="Doodle color"
                                        />
                                    </label>
                                    <input
                                        type="range"
                                        min={1}
                                        max={10}
                                        step={0.2}
                                        value={doodleSize}
                                        onChange={(event) => setDoodleSize(Number(event.target.value))}
                                        className={styles.sizeRange}
                                    />
                                    <span className={styles.toolHint}>Press and drag on canvas</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CanvasViewer;
