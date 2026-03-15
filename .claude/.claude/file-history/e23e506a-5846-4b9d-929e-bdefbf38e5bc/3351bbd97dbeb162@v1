const getShareUrl = (journalId) => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL?.trim();
    const base = backendUrl
        ? backendUrl.replace(/\/+$/, '')
        : `${window.location.origin}/api`;
    return `${base}/share/post/${journalId}`;
};

export default getShareUrl;
