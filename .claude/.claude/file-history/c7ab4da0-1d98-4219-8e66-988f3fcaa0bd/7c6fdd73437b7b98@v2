import formatPostDate from "../../../../helpers/formatDateString";
import { handleImageFallback } from "../../../utils/handleImageFallback";
import "./interestSections.css";

const InterestSections = ({ sections, onPostClick }) => {
    if (!sections || sections.length === 0) return null;

    return (
        <div className="interest-sections">
            {sections.map((section) => (
                <div key={section.interest} className="interest-section">
                    <div className="interest-section-header">
                        <span className="interest-section-title">
                            Trending in {section.interest}
                        </span>
                    </div>
                    <div className="interest-section-scroll">
                        {section.posts.map((post) => {
                            const thumbnail = post.thumbnail_url || null;
                            const excerpt = post.preview_text || '';
                            const title = post.title || 'Untitled';
                            const displayTitle = title.length > 50 ? title.slice(0, 50) + '...' : title;

                            return (
                                <div
                                    key={post.id}
                                    className="interest-card"
                                    onClick={() => onPostClick(post.id)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            onPostClick(post.id);
                                        }
                                    }}
                                >
                                    {thumbnail && (
                                        <div className="interest-card-image">
                                            <img
                                                src={thumbnail}
                                                alt=""
                                                loading="lazy"
                                                onError={handleImageFallback}
                                            />
                                        </div>
                                    )}
                                    <div className="interest-card-body">
                                        <h4 className="interest-card-title">{displayTitle}</h4>
                                        {excerpt && (
                                            <p className="interest-card-excerpt">{excerpt.slice(0, 80)}{excerpt.length > 80 ? '...' : ''}</p>
                                        )}
                                        <div className="interest-card-meta">
                                            <span className="interest-card-author">{post.user_name || 'Anonymous'}</span>
                                            <span className="interest-card-dot">&middot;</span>
                                            <span className="interest-card-date">{formatPostDate(post.created_at)}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default InterestSections;
