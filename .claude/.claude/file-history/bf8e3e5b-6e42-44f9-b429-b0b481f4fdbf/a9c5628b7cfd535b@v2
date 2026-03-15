import './FeedCardSkeleton.css';

const SkeletonCard = () => (
    <div className="skel-card">
        <div className="skel-header">
            <div className="skel-avatar skel-shimmer" />
            <div className="skel-meta">
                <div className="skel-name skel-shimmer" />
                <div className="skel-date skel-shimmer" />
            </div>
        </div>
        <div className="skel-title skel-shimmer" />
        <div className="skel-line skel-shimmer" />
        <div className="skel-line skel-line--short skel-shimmer" />
        <div className="skel-actions">
            <div className="skel-action skel-shimmer" />
            <div className="skel-action skel-shimmer" />
            <div className="skel-action skel-shimmer" />
        </div>
    </div>
);

const FeedCardSkeleton = ({ count = 4 }) => (
    <div className="skel-feed">
        {Array.from({ length: count }, (_, i) => (
            <SkeletonCard key={i} />
        ))}
    </div>
);

export default FeedCardSkeleton;
