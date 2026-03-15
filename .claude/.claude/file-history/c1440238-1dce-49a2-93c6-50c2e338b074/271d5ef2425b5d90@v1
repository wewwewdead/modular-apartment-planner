import { useMemo, useState } from "react";
import { MoonLoader } from "react-spinners";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getCanvasGallery } from "../../../../API/Api";
import { useAuth } from "../../../Context/useAuth";
import formatPostDate from "../../../../helpers/formatDateString";
import VerifiedBadge from "../../Badge/VerifiedBadge";
import { parseCanvasDoc } from "../../../utils/canvasDoc";
import { handleImageFallback } from "../../../utils/handleImageFallback";
import "./gallery.css";

const getAspectRatioValue = (aspectRatio) => (aspectRatio === "4:5" ? "4 / 5" : "1 / 1");

const CanvasPreview = ({canvasDoc}) => {
    const parsedCanvasDoc = useMemo(() => parseCanvasDoc(canvasDoc), [canvasDoc]);
    const previewSnippets = (parsedCanvasDoc?.snippets || []).slice(0, 6);
    const firstImage = parsedCanvasDoc?.images?.[0]?.src || null;
    const aspectRatioValue = getAspectRatioValue(parsedCanvasDoc?.meta?.aspectRatio);

    return (
        <div className={`gallery-preview-shell ${parsedCanvasDoc?.meta?.theme === 'dark' ? 'is-dark' : ''}`} style={{aspectRatio: aspectRatioValue}}>
            {firstImage && (
                <img
                    className="gallery-preview-image"
                    src={firstImage}
                    alt="Canvas visual"
                    loading="lazy"
                    onError={handleImageFallback}
                />
            )}

            <div className="gallery-preview-snippets">
                {previewSnippets.map((snippet) => (
                    <div
                        key={snippet.id}
                        className={`gallery-preview-snippet ${snippet.fontStyle === 'bold' ? 'is-bold' : ''}`}
                        style={{
                            left: `${Math.min(Math.max((snippet?.x || 0.2) * 100, 5), 85)}%`,
                            top: `${Math.min(Math.max((snippet?.y || 0.2) * 100, 6), 88)}%`,
                            transform: `translate(-50%, -50%) rotate(${snippet?.rotation || 0}deg)`
                        }}
                    >
                        {(snippet?.text || '').slice(0, 44)}
                    </div>
                ))}
            </div>
        </div>
    );
}

const GalleryPage = () => {
    const navigate = useNavigate();
    const {user} = useAuth();
    const userId = user?.userData?.[0]?.id || null;
    const [sortMode, setSortMode] = useState('hottest');

    const {data, isLoading, isFetching} = useQuery({
        queryKey: ['canvasGallery', userId, sortMode],
        queryFn: () => getCanvasGallery(userId, 60, sortMode),
        refetchOnWindowFocus: false,
        staleTime: 1000 * 45
    });

    const journals = useMemo(() => (
        (data?.data || []).filter((journal) => journal?.post_type === "canvas")
    ), [data?.data]);

    if(isLoading){
        return (
            <div className="gallery-loading-state">
                <MoonLoader loading={isLoading} color="var(--loader-color)" size={20} />
            </div>
        );
    }

    return (
        <div className="gallery-page-root">
            <div className="gallery-top-bar">
                <div className="gallery-title-shell">
                    <h2 className="gallery-title">Gallery</h2>
                    <p className="gallery-subtitle">Canvas posts arranged as visual pieces</p>
                </div>

                <div className="gallery-sort-shell">
                    <button
                        type="button"
                        className={`gallery-sort-btn ${sortMode === 'hottest' ? 'is-active' : ''}`}
                        onClick={() => setSortMode('hottest')}
                    >
                        Hottest
                    </button>
                    <button
                        type="button"
                        className={`gallery-sort-btn ${sortMode === 'newest' ? 'is-active' : ''}`}
                        onClick={() => setSortMode('newest')}
                    >
                        Newest
                    </button>
                </div>
            </div>

            {isFetching && (
                <div className="gallery-refresh-pill">Refreshing...</div>
            )}

            {journals.length === 0 ? (
                <div className="gallery-empty-state">No public canvases yet.</div>
            ) : (
                <div className="gallery-masonry">
                    {journals.map((journal) => (
                        <article
                            key={journal.id}
                            className="gallery-card"
                            onClick={() => navigate(`/home/post/${journal.id}`)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => {
                                if(event.key === 'Enter' || event.key === ' '){
                                    event.preventDefault();
                                    navigate(`/home/post/${journal.id}`);
                                }
                            }}
                        >
                            <CanvasPreview canvasDoc={journal?.canvas_doc} />
                            <div className="gallery-card-body">
                                <h3 className="gallery-card-title">{journal?.title || 'Untitled Canvas'}</h3>
                                <div className="gallery-card-meta">
                                    <span className="gallery-author">{journal?.users?.name || 'Unknown'}</span>
                                    <VerifiedBadge badge={journal?.users?.badge} size={13} />
                                    <span className="gallery-meta-dot">•</span>
                                    <span>{formatPostDate(journal?.created_at)}</span>
                                </div>
                                <div className="gallery-card-score">
                                    <span>Hot score</span>
                                    <span>{journal?.hot_score || 0}</span>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}

export default GalleryPage;
