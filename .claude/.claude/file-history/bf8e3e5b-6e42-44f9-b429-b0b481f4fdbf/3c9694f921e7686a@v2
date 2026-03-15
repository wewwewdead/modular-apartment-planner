import './EmptyState.css';

const EmptyState = ({ icon, title, description, action }) => (
    <div className="empty-state">
        {icon && <div className="empty-state-icon">{icon}</div>}
        <h3 className="empty-state-title">{title}</h3>
        {description && <p className="empty-state-desc">{description}</p>}
        {action && (
            <button className="empty-state-action pressable" onClick={action.onClick}>
                {action.label}
            </button>
        )}
    </div>
);

export default EmptyState;
