import BASE_URL from "../src/utils/apiBaseUrl";
import apiRequest from "../src/utils/apiRequest";

export const checkUser = async(userId) => {
    const response = await apiRequest(`${BASE_URL}/check-user?userId=${userId}`,{
        method: 'GET',
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error || 'failed to get user data')
    }
    const userData = await response.json()
    // console.log(userData)
    return userData;
}
export const submitProfileData = async(body, token)=>{
    const headers = {}
    if(token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/upload-user-data`, {
        method: 'POST',
        headers: headers,
        body: body
    })
    if(!response.ok){
        const error = await response.json();
        throw new Error(error || 'Failed to upload data');
    }
    const data = await response.json();
    // console.log(data)
    return data;
}

export const updateProfileData = async(body, token) => {
    if(body){
        // console.log(body)
    }
    const headers = {};
    if(token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/update-user-data`, {
        method: 'POST',
        headers: headers,
        body: body
    })
    if(!response.ok){
        const error = await response.json();
        throw new Error(error || 'failed to update profile data')
    }
    const data = await response.json();
    // console.log(data)
}
export const getUserByUsername = async(username) => {
    const response = await apiRequest(`${BASE_URL}/user/${encodeURIComponent(username)}`, {
        method: 'GET',
    });
    if(!response.ok){
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to fetch user by username');
    }
    return await response.json();
}

export const checkUsernameAvailability = async(username) => {
    const response = await apiRequest(`${BASE_URL}/check-username/${encodeURIComponent(username)}`, {
        method: 'GET',
    });
    if(!response.ok){
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to check username');
    }
    return await response.json();
}

export const updateUsername = async(token, username) => {
    const headers = {'Content-Type': 'application/json'};
    if(token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/update-username`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ username })
    });
    if(!response.ok){
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to update username');
    }
    return await response.json();
}

export const getUserData = async(userId) =>{

    const response = await apiRequest(`${BASE_URL}/getUserData?userId=${userId}`, {
        method: 'GET',
    })
    if(!response.ok){
        const error = await response.json()
        throw new Error(error || 'Failed to fetch user data');
    }
     const data = await response.json();
     return data;
}

export const updateFontColor = async(token, fontColor) => {
    const headers = {};
    if(token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/updateFontColor`, {
        method: 'POST',
        headers: headers,
        body: fontColor
    })

    if(!response.ok){
        const error = await response.json()
        throw new Error(error)
    }

    const data = await response.json();
    return data;
}

export const saveJournalImage = async(token, body) => {
    const headers = {};
    if(token) headers['Authorization'] = `Bearer ${token}`;
    const response = await apiRequest(`${BASE_URL}/save-journal-image`, {
        method: 'POST',
        body: body,
        headers: headers
    })
    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }
    const data = await response.json();
    // console.log(data)
    return data;
}

export const saveJournal = async(token, body) => {
    // console.log(body)
    const headers = {}
    if(token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/save-journal`, {
        method: 'POST',
        headers,
        body: body,
    })
    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }
    const data = await response.json();
    // console.log(data)
    return data;
}

export const updateJournal = async(token, body) => {
    const headers = {};
    if(token) headers['Authorization'] = `Bearer ${token}`;

    const response =  await apiRequest(`${BASE_URL}/update-journal`, {
        method: 'POST',
        headers: headers,
        body: body
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }

    const message = await response.json();
    // console.log(message)
    return message;
}

export const deleteJournalImage = async(token, url) => {
    // console.log(url)
    let img_url = ''
    let data = {
        filepath: []
    };
    
    if(url.length){
        // console.log(url.length)
        url.forEach(element => {
            data.filepath.push(element.split('/journal-images/').pop());
    });
       
        // img_url = url.split('/journal-images/').pop()
        // if(img_url){
        //     data = {
        //         filepath: img_url
        //     }

        // }
        // console.log(url.split('/journal-images/').pop(),'url') //pop() method will remove the last element in the array and returns it;
        //in that case i can get the fileName e.g https://hufaxmqdofaycnhdzrxf.supabase.co/storage/v1/object/public/journal-images/user_id_7ceaa0ad-0266-4966-bfe6-ec152b2d9f75/1760963803951_4720148b-c85b-4af3-99e0-dd2ce87c10b0.webp
    }

    // console.log(data.filepath)
    const headers = {'Content-Type': 'application/json',}
    if(token) headers['Authorization'] = `Bearer ${token}`;
    const response = await apiRequest(`${BASE_URL}/delete-journal-images`, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: headers
    })
    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }
    const message = await response.json();
    // console.log(message)
    return message;

}

export const getFollowingFeed = async(token, cursor = null, limit = 5) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let url = cursor
        ? `${BASE_URL}/journals/following?limit=${limit}&before=${cursor}`
        : `${BASE_URL}/journals/following?limit=${limit}`;

    const response = await apiRequest(url, {
        method: 'GET',
        headers: headers
    });

    if (!response.ok) {
        throw new Error('Failed to fetch following feed');
    }

    return await response.json();
}

export const getJournals = async(cursor = null, limit = 5, userId) =>{
    // console.log(userId)
    try {
        let url = cursor
        ? `${BASE_URL}/journals?limit=${limit}&before=${cursor}`
        : `${BASE_URL}/journals?limit=${limit}`;
        if(userId) url += `&userId=${userId}`;

        const response = await apiRequest(url, {
            method: 'GET'
        });

        if(!response.ok){
            throw new Error('Failed to fetch journals');
        }

        const data = await response.json();
        // console.log(data)
        return data;
    } catch (error) {
        console.error('Error fetching journals:', error);
        throw error;
    }
}

export const getMonthlyHottestJournals = async(userId, limit = 10) => {
    const parsedLimit = Number(limit);
    if(Number.isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 10){
        throw new Error('limit should be an integer between 1 and 10');
    }

    let url = `${BASE_URL}/journals/hottest-monthly?limit=${parsedLimit}`;
    if(userId){
        url += `&userId=${encodeURIComponent(userId)}`;
    }

    const response = await apiRequest(url, {
        method: 'GET'
    });

    if(!response.ok){
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to fetch monthly hottest journals');
    }

    const data = await response.json();
    return data;
}

export const getCanvasGallery = async(userId, limit = 36, sort = 'hottest', cursor = null) => {
    const parsedLimit = Number(limit);
    if(Number.isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 72){
        throw new Error('limit should be an integer between 1 and 72');
    }

    const normalizedSort = typeof sort === 'string' && sort.trim().toLowerCase() === 'newest'
        ? 'newest'
        : 'hottest';

    let url = `${BASE_URL}/journals/canvas/gallery?limit=${parsedLimit}&sort=${encodeURIComponent(normalizedSort)}`;
    if(userId){
        url += `&userId=${encodeURIComponent(userId)}`;
    }
    if(cursor){
        url += `&cursor=${encodeURIComponent(cursor)}`;
    }

    const response = await apiRequest(url, {
        method: 'GET'
    });

    if(!response.ok){
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to fetch canvas gallery');
    }

    return await response.json();
}

export const searchUsers = async(query, limit = 10) => {
    const normalizedQuery = typeof query === 'string' ? query.trim() : '';
    if(!normalizedQuery){
        return {data: [], hasMore: false};
    }

    const url = `${BASE_URL}/users/search?query=${encodeURIComponent(normalizedQuery)}&limit=${limit}`;

    const response = await apiRequest(url, {
        method: 'GET'
    });

    if(!response.ok){
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to search users');
    }

    return await response.json();
}

export const searchJournals = async(query, limit = 10, userId) => {
    const normalizedQuery = typeof query === 'string' ? query.trim() : '';
    if(!normalizedQuery){
        return {data: [], hasMore: false, mode: 'keyword'};
    }

    let url = `${BASE_URL}/journals/search?query=${encodeURIComponent(normalizedQuery)}&limit=${limit}`;
    if(userId){
        url += `&userId=${encodeURIComponent(userId)}`;
    }

    const response = await apiRequest(url, {
        method: 'GET'
    });

    if(!response.ok){
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to search journals');
    }

    const data = await response.json();
    return data;
}

export const getJournalById = async(journalId, userId) => {
    if (!journalId) {
        throw new Error('journalId is required');
    }

    let url = `${BASE_URL}/journal/${encodeURIComponent(journalId)}`;
    if (userId) {
        url += `?userId=${encodeURIComponent(userId)}`;
    }

    const response = await apiRequest(url, {
        method: 'GET'
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to fetch journal');
    }

    const data = await response.json();
    return data;
}
export const getUserJournals = async(cursor = null, limit = 5, userId, token) =>{
    try {
        const headers = {};
        if(token) headers['Authorization'] = `Bearer ${token}`;
        const url = cursor ? `${BASE_URL}/userJournals?limit=${limit}&before=${cursor}&userId=${userId}` : `${BASE_URL}/userJournals?limit=${limit}&userId=${userId}`;

        const response = await apiRequest(url, {
            method: 'GET',
            headers: headers
        })
        
        if(!response.ok){
            throw new Error('failed to get response');
        }
        const data = await response.json();
        // console.log(data);
        return data
    } catch (error) {
        console.error('Error fetching user journals:', error);
        throw error;
    }
}

export const getProfileMedia = async(token, cursor = null, limit = 5) => {
    const headers = {};
    if(token) headers['Authorization'] = `Bearer ${token}`;
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if(cursor){
        params.set('cursor', cursor);
    }

    const response = await apiRequest(`${BASE_URL}/profileMedia?${params.toString()}`, {
        method: 'GET',
        headers: headers
    });

    if(!response.ok){
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to fetch profile media');
    }

    return await response.json();
}

export const getVisitedProfileMedia = async(token, userId, cursor = null, limit = 5) => {
    if(!userId){
        throw new Error("userId is required");
    }

    const headers = {};
    if(token) headers["Authorization"] = `Bearer ${token}`;

    const params = new URLSearchParams();
    params.set("userId", String(userId));
    params.set("limit", String(limit));
    if(cursor){
        params.set("cursor", cursor);
    }

    const response = await apiRequest(`${BASE_URL}/visitedProfileMedia?${params.toString()}`, {
        method: "GET",
        headers: headers
    });

    if(!response.ok){
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || "failed to fetch visited profile media");
    }

    return await response.json();
}

export const deleteProfileMediaImage = async(token, payload) => {
    const headers = {"Content-Type": "application/json"};
    if(token) headers["Authorization"] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/media/image`, {
        method: "DELETE",
        headers: headers,
        body: JSON.stringify(payload || {})
    });

    if(!response.ok){
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || "failed to delete profile media image");
    }

    return await response.json();
}

export const getVisitedUserJournals = async(cursor = null, limit = 5, userId, loggedInUserId) =>{
    // console.log('getVisit');
    try {
        const url = cursor ? `${BASE_URL}/visitedUserJournals?limit=${limit}&before=${cursor}&userId=${userId}&loggedInUserId=${loggedInUserId}` : `${BASE_URL}/visitedUserJournals?limit=${limit}&userId=${userId}&loggedInUserId=${loggedInUserId}`;

        const response = await apiRequest(url, {
            method: 'GET'
        })
        
        if(!response.ok){
            throw new Error('failed to get response');
        }
        const data = await response.json();
        // console.log(data);
        return data
    } catch (error) {
        console.error('Error fetching user journals:', error);
        throw error;
    }
}

export const deleteJournal = async(journalId, token) =>{
    const headers = {};

    if(token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/deleteJournal/${journalId}`, {
        method: 'delete',
        headers: headers
    })
    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }
    const data = await response.json();
    // console.log(data)
    return data;
}

export const clickLike = async(token, body) => {
    const headers = {'Content-Type': 'application/json'}; //use content type because it will receive a object type of data
    if(token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/like`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body) //tringify the plain object
    })
    if(!response.ok){
        throw new Error('error adding like')
    }
    const message = await response.json();
    // console.log(message)
    return message;
}

export const addComment = async(token, body) =>{
    const headers = {'Content-Type': 'application/json'};
    if(token) headers['Authorization'] = `Bearer ${token}`;
    const response = await apiRequest(`${BASE_URL}/addComment`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
    })
    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }
    const data = await response.json();
    return data;
};
export const getComments = async(cursor= null, limit= 10, postId) =>{
    try {
        const url = cursor ? `${BASE_URL}/getComments?postId=${postId}&limit=${limit}&before=${cursor}` : `${BASE_URL}/getComments?postId=${postId}&limit=${limit}`;
        const response = await apiRequest(url, {
            method: 'GET'
        })

        if(!response.ok){
            throw new Error('failed to fetch comments');
        }
        const data = await response.json();
        // console.log(data);
        return data;
    } catch (error) {
        console.error('Error fetching comments:', error);
        throw error;
    }
}

export const createCanvasRemix = async(token, payload) => {
    const headers = {'Content-Type': 'application/json'};
    if(token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/canvas/remix`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload || {})
    });

    if(!response.ok){
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to create canvas remix');
    }

    return await response.json();
}

export const updateRepostCaption = async(token, {journalId, caption}) => {
    const headers = {'Content-Type': 'application/json'};
    if(token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/update-repost-caption`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({journalId, caption})
    });

    if(!response.ok){
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to update repost caption');
    }

    return await response.json();
}

export const createRepost = async(token, {sourceJournalId, caption}) => {
    const headers = {'Content-Type': 'application/json'};
    if(token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/repost`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({sourceJournalId, caption})
    });

    if(!response.ok){
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to create repost');
    }

    return await response.json();
}

export const addBookmark = async(token, journalId) =>{
    const headers = {'Content-Type': 'application/json'};
    if(token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/addBoorkmark`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(journalId),
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error('error:', error);
    }

    const message = await response.json();
    // console.log(message);
    return message;
}

export const getBookmarks = async(cursor= null, limit= 5, userId, token) =>{
    const headers = {};
    if(token) headers['Authorization'] = `Bearer ${token}`;
    const url = cursor ? `${BASE_URL}/getBookmarks?limit=${limit}&before=${cursor}&userId=${userId}` : `${BASE_URL}/getBookmarks?limit=${limit}&userId=${userId}`;
    const response = await apiRequest(url, {
        method: 'GET',
        headers: headers,
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }
    const data = await response.json();
    // console.log(data)
    return data;
}

export const addFollows = async(followsData, token) => {
    const headers ={'Content-Type': 'application/json'}
    if(token) headers['Authorization'] = `Bearer ${token}`;
    const response = await apiRequest(`${BASE_URL}/addFollows`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(followsData),
    })

    if(!response.ok){
        const error = await response.json()
        throw new Error(error);
    }
    const data = await response.json();
    // console.log(data);
    return data;
}

export const getFollowsData = async(loggedInUserId, userIdToFollow) =>{
    const response = await apiRequest(`${BASE_URL}/getFollowsData?userId=${userIdToFollow}&loggedInUserId=${loggedInUserId}`,{
        method: 'GET'
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }
    const data = await response.json();
    // console.log(data)
    return data;
}

export const getNotificationsCount = async(userId, token) => {
    const headers = {};
    if(token) headers['Authorization'] = `Bearer ${token}`;
    const response = await apiRequest(`${BASE_URL}/getCountNotifications?userId=${userId}`, { headers: headers });
    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }
    const data = await response.json();
    // console.log(data)
    return data;
}

export const getNotifications = async(token, cursor = null, limit = 5) =>{
    const headers = {}
    if(token) headers['Authorization'] = `Bearer ${token}`
    const url = cursor ? `${BASE_URL}/getNotifications?before=${cursor}&limit=${limit}` : `${BASE_URL}/getNotifications?limit=${limit}`;
    const response = await apiRequest(url, {
        method: 'GET',
        headers: headers
    })
    if(!response){
        const error = await response.json();
        throw new Error(error);
    }
    const data = await response.json();
    return data;
}

export const readNotification = async(token, notifId, source) =>{
    const headers = {'Content-Type': 'application/json'};
    if(token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/readNotification`, {
        method: 'POST',
        body: JSON.stringify({notifId, source}),
        headers: headers
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }
    const message = await response.json();
    // console.log(message)
    return message;
}

export const deleteNotification = async(token, notifId, source) =>{
    const headers = {};
    if(token) headers['Authorization'] = `Bearer ${token}`;

    const url = source ? `${BASE_URL}/deleteNotification/${notifId}?source=${source}` : `${BASE_URL}/deleteNotification/${notifId}`;
    const response = await apiRequest(url, {
        method: 'DELETE',
        headers: headers
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }
    const message = await response.json();
    // console.log(message)
    return message;
}

export const getUnreadNotification = async(token, cursor, limit=5)=>{
    const headers = {};
    if(token)headers['Authorization'] = `Bearer ${token}`;

    const url = cursor ? `${BASE_URL}/getUnreadNotification?before=${cursor}&limit=${limit}` : `${BASE_URL}/getUnreadNotification?limit=${limit}`
    const response = await apiRequest(url, {
        method: 'GET',
        headers: headers
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }
    const data = await response.json();
    // console.log(data);
    return data;
}

export const addJournalViews = async(token, body) =>{
    const headers ={};
    if(token)headers['Authorization'] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/addViews`, {
        method: 'POST',
        headers: headers,
        body: body
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }

    const message = await response.json();
    // console.log(message);
    return message;
}

export const updatePrivacy = async(token, body) =>{
    const headers = {};
    if(token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/updatePrivacy`, {
        method: 'POST',
        body: body,
        headers: headers
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }

    const message = await response.json();
    // console.log(message);
    return message;
}

export const addCollections = async(token, body) => {
    const headers = {};
    if(token) headers['Authorization'] = `Bearer ${token}`;
    
    const response = await apiRequest(`${BASE_URL}/addCollections`, {
        method: 'POST',
        headers: headers,
        body: body
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }

    const message = await response.json();
    // console.log(message)
    return message;
}

export const getCollections = async(userId, cursor, limit, token) =>{
    const headers = {};
    if(token) headers['Authorization'] = `Bearer ${token}`;
    const url = cursor ? `${BASE_URL}/getCollections?userId=${userId}&before=${cursor}&limit=${limit}` : `${BASE_URL}/getCollections?userId=${userId}&limit=${limit}`

    const response = await apiRequest(url, {
        method: 'GET',
        headers: headers,
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }

    const data = await response.json();
    // console.log(data)
    return data
}

export const getCollectionJournals = async(collectionId, cursor, limit, token) =>{
    const headers = {};

    if(token) headers['Authorization'] = `Bearer ${token}`;
    const url = cursor ? `${BASE_URL}/getCollectionJournals?collectionId=${collectionId}&before=${cursor}&limit=${limit}` : `${BASE_URL}/getCollectionJournals?collectionId=${collectionId}&limit=${limit}`;
    const response = await apiRequest(url, {
        method: 'GET',
        headers: headers
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }

    const data = await response.json()
    return data
}

export const getNotCollectedJournals = async(cursor, limit, userId, collectionId, token) =>{
    const headers = {};
    if(token) headers['Authorization'] = `Bearer ${token}`;
    const url = cursor ? `${BASE_URL}/getNotCollectedPost?before=${cursor}&limit=${limit}&userId=${userId}&collectionId=${collectionId}` :  `${BASE_URL}/getNotCollectedPost?limit=${limit}&userId=${userId}&collectionId=${collectionId}`;

    const response = await apiRequest(url, {
        method: 'GET',
        headers: headers,
    })
    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }

    const data = await response.json();
    // console.log(data)
    return data;
}
export const addJournalCollection = async(token, body) => {
    const headers = {};
    if(token) headers['Authorization'] = `Bearer ${token}`;
    
    const response = await apiRequest(`${BASE_URL}/updateCollection`, {
        method: 'post',
        headers: headers,
        body: body
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }

    const message = response.json();
    // console.log(message);
    return message;
}

export const deleteCollection = async(token, collectionId) =>{
    const headers = {};
    if(token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/deleteCollection/${collectionId}`, {
        method: 'delete',
        headers: headers
    })
    if(!response.ok){
        const error = await response.json();
        throw new Error(error)
    }

    const message = await response.json();
    // console.log(message)
    return message;
}

export const updateCollectionPrivacy = async(body, token) =>{
    const headers = {};
    if(token) headers['Authorization'] = `Bearer ${token}`;
    const response = await apiRequest(`${BASE_URL}/updatePrivacyCollection`, {
        method: 'post',
        body: body,
        headers: headers,
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }

    const message = await response.json();

    // console.log(message);
    return message;
}

export const addOpinion = async(body, token) =>{
    const headers = {};
    if(token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/addOpinion`, {
        method: 'POST',
        body: body,
        headers: headers
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }
    const data = await response.json();
    // console.log(data)
    return data;
}

export const getOpinions = async(cursor, limit) =>{
    const url = cursor ? `${BASE_URL}/getOpinions?before=${cursor}&limit=${limit}` : `${BASE_URL}/getOpinions?limit=${limit}`;

    const response = await apiRequest(url, {
        method: 'GET'
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error)
    }

    const data = await response.json()
    // console.log(data);
    return data;
}

export const getUserOpinions = async(cursor, limit, userId) =>{
    const url = cursor ? `${BASE_URL}/getUserOpinions?before=${cursor}&limit=${limit}&userId=${userId}` : `${BASE_URL}/getUserOpinions?limit=${limit}&userId=${userId}`;

    const response = await apiRequest(url, {
        method: 'GET',
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }

    const data = await response.json();
    // console.log(data);
    return data;
}

export const getMyOpinions = async(cursor, limit, token) => {
    // console.log(cursor)
    const headers ={}
    if(token) headers['Authorization'] = `Bearer ${token}`;

    const url =  cursor ? `${BASE_URL}/getMyOpinions?before=${cursor}&limit=${limit}` : `${BASE_URL}/getMyOpinions?limit=${limit}`;

    const response = await apiRequest(url, {
        method: 'get',
        headers: headers
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }

    const data = await response.json();
    // console.log(data);
    return data;
}

export const addReply = async(userId, postId, parentId, body, receiverId, token) =>{
    const headers = {};
    if(token) headers['Authorization'] = `Bearer ${token}`;
    const response = await apiRequest(`${BASE_URL}/submitReply/${parentId}/${userId}/${postId}/${receiverId}`, {
        method: 'POST',
        body: body,
        headers: headers
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }
    
    const messsage = await response.json();
    // console.log(messsage)
    return messsage;
}

export const getPostReplies = async(parent_id, limit, cursor) =>{
    const url = cursor ? `${BASE_URL}/getPostReplies/${parent_id}?limit=${limit}&before=${cursor}` : `${BASE_URL}/getPostReplies/${parent_id}?limit=${limit}`;

    const response = await apiRequest(url, {
        method: 'GET'
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }

    const data = await response.json();
    // console.log(data);
    return data;
}

export const getViewOpinion = async(postId, userId) =>{
    const url = `${BASE_URL}/viewOpinion/${postId}/${userId}`;

    const response = await apiRequest(url, {
        method: 'GET'
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }

    const data = await response.json();
    // console.log(data);
    return data;
}

export const addReplyOpinion = async(body, receiver_id, user_id, parent_id, token) =>{
    const headers = {};
    if(token) headers['Authorization'] = `Bearer ${token}`;
    
    const response = await apiRequest(`${BASE_URL}/addOpinionReply/${parent_id}/${user_id}/${receiver_id}`, {
        method: 'POST',
        body: body,
        headers: headers
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }
    const message = await response.json();
    return message;
}

export const getOpinionReply = async(parentId, limit, cursor) =>{
    const url =  cursor ? `${BASE_URL}/getOpinionReply/${parentId}?limit=${limit}&cursor=${cursor}` : `${BASE_URL}/getOpinionReply/${parentId}?limit=${limit}`;

    const response = await apiRequest(url, {
        method: 'GET'
    })

    if(!response.ok){
        const error = await response.json();
        throw new Error(error);
    }
    const data = await response.json();
    return data;

}

export const requestConstellation = async (token, starIdA, starIdB, label = '') => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/constellation/request`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ starIdA, starIdB, label }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to request constellation');
    }

    return await response.json();
};

export const respondConstellation = async (token, constellationId, accept) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/constellation/respond`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ constellationId, accept }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to respond to constellation');
    }

    return await response.json();
};

export const getViewportConstellations = async (postIds) => {
    if (!Array.isArray(postIds) || postIds.length === 0) {
        return { data: [] };
    }

    const params = new URLSearchParams();
    params.set('postIds', postIds.join(','));

    const response = await apiRequest(`${BASE_URL}/constellation/viewport?${params.toString()}`, {
        method: 'GET',
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to fetch constellations');
    }

    return await response.json();
};

export const deleteConstellation = async (token, constellationId) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/constellation/${encodeURIComponent(constellationId)}`, {
        method: 'DELETE',
        headers: headers,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to delete constellation');
    }

    return await response.json();
};

export const getUniversePosts = async(minX, maxX, minY, maxY, limit = 200) => {
    const params = new URLSearchParams();
    params.set('minX', String(minX));
    params.set('maxX', String(maxX));
    params.set('minY', String(minY));
    params.set('maxY', String(maxY));
    params.set('limit', String(limit));

    const response = await apiRequest(`${BASE_URL}/universe/posts?${params.toString()}`, {
        method: 'GET'
    });

    if(!response.ok){
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to fetch universe posts');
    }

    return await response.json();
}

// export const getLikedPosts = async(token) =>{
//     const headers = {}
//     if(token) headers['Authorization'] = `Bearer ${token}`
//     try {
//         const response = await apiRequest(`${BASE_URL}/getLikes`, {
//             method: 'GET',
//             headers: headers
//         });
        
//         if(!response.ok){
//             throw new Error('Error fetching likes data')
//         }
//         const data = await response.json()
//         console.log(data)
//         return data
//     } catch (error) {
//         console.error('Error fetching likes data:', error);
//         throw error;
//     }
// }

export const getRelatedPosts = async (journalId) => {
    if (!journalId) return { posts: [], confidence: 'none', topSimilarity: 0 };

    const response = await apiRequest(`${BASE_URL}/journal/${encodeURIComponent(journalId)}/related`, {
        method: 'GET',
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to fetch related posts');
    }

    return await response.json();
}

// ─── Streaks ───
export const getStreak = async (userId) => {
    if (!userId) return null;
    const response = await apiRequest(`${BASE_URL}/streak/${encodeURIComponent(userId)}`, {
        method: 'GET',
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to fetch streak');
    }
    return await response.json();
}

// ─── Daily Prompts ───
export const getTodaysPrompt = async () => {
    const response = await apiRequest(`${BASE_URL}/prompt/today`, {
        method: 'GET',
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to fetch prompt');
    }
    return await response.json();
}

export const getPromptResponses = async (promptId, cursor = null, limit = 5) => {
    if (!promptId) return { responses: [] };
    const url = cursor
        ? `${BASE_URL}/prompt/${encodeURIComponent(promptId)}/responses?limit=${limit}&before=${cursor}`
        : `${BASE_URL}/prompt/${encodeURIComponent(promptId)}/responses?limit=${limit}`;
    const response = await apiRequest(url, {
        method: 'GET',
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to fetch prompt responses');
    }
    return await response.json();
}

// ─── Reactions ───
export const toggleReaction = async (token, body) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/reaction`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error('error toggling reaction');
    }
    return await response.json();
}

export const getPostReactions = async (journalId) => {
    if (!journalId) return { reactions: [] };
    const response = await apiRequest(`${BASE_URL}/reactions/${encodeURIComponent(journalId)}`, {
        method: 'GET',
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to fetch reactions');
    }
    return await response.json();
}

// ─── Weekly Recap ───
export const getWeeklyRecap = async (token) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await apiRequest(`${BASE_URL}/recap/weekly`, {
        method: 'GET',
        headers,
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'failed to fetch weekly recap');
    }
    return await response.json();
}

