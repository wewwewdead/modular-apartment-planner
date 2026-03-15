const getShareBase = () => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL?.trim();
    return backendUrl
        ? backendUrl.replace(/\/+$/, '')
        : `${window.location.origin}/api`;
};

const getShareUrl = (journalId) => {
    return `${getShareBase()}/share/post/${journalId}`;
};

export const getProfileShareUrl = (username) => {
    return `${getShareBase()}/share/u/${encodeURIComponent(username)}`;
};

export default getShareUrl;
