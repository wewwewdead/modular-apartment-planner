const reactionMessages = {
    fire: 'Fired your post',
    heart: 'Loved your post',
    mind_blown: 'Was mind-blown by your post',
    clap: 'Clapped your post',
    laugh: 'Laughed at your post',
    sad: 'Was moved by your post',
};

const notificationTypeMap = {
    like: 'Liked your post',
    reaction: 'Reacted to your post',
    comment: 'Commented on your post',
    reply: 'Replied on your comment',
    follow: 'Follows you',
    repost: 'Reposted your post',
    opinion_reply: 'Replied to your opinion',
    constellation_request: 'Wants to link stars with you',
    constellation_accepted: 'Accepted your constellation link',
    hottest_post: 'Your post is #1 Hottest!',
    hottest_post_replaced: 'Your post is no longer #1 Hottest',
    mention: 'Mentioned you in a post'
};

const FormatNotificationType = (type, reactionType) => {
    if (type === 'reaction' && reactionType && reactionMessages[reactionType]) {
        return reactionMessages[reactionType];
    }

    return notificationTypeMap[type] || 'Unknown notification';
}

export default FormatNotificationType;
