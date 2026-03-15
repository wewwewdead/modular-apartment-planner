import React from "react";

export const createProfileSidebarLinks = ({ location, navigatePath, navigate, notifCount, setShowEditor }) => {
    return [
        {
            path: '/home', 
            label: 'Home', action: ()=> navigatePath('/home'), 
            icon: 
            <svg xmlns="http://www.w3.org/2000/svg" width="28px" height="28px" viewBox="0 0 24 24" fill="#000000ff">
                <g id="style=fill">
                    <g id="home-line" clipPath="url(#clip0_1_110)">
                        <path id="Subtract" fillRule="evenodd" clipRule="evenodd" d="M14.3594 2.12613C13.0087 0.944612 10.9923 0.94461 9.64162 2.12612L3.2802 7.69086C2.29508 8.55261 1.72998 9.79772 1.72998 11.1066L1.72998 19.1672C1.72998 21.1459 3.33403 22.75 5.31273 22.75L18.6883 22.75C20.667 22.75 22.271 21.1459 22.271 19.1672L22.271 11.1066C22.271 9.79772 21.706 8.55261 20.7208 7.69086L14.3594 2.12613ZM10 16.1136C9.58579 16.1136 9.25 16.4494 9.25 16.8636C9.25 17.2779 9.58579 17.6136 10 17.6136L14 17.6136C14.4142 17.6136 14.75 17.2779 14.75 16.8636C14.75 16.4494 14.4142 16.1136 14 16.1136L10 16.1136Z" fill={location.pathname === '/home' ? "var(--accent-dark)" : "var(--text-muted)"}/>
                    </g>
                </g>
            </svg>
        },
        {
            path: '/home/explore',
            label: 'Explore',
            action: () => navigatePath('/home/explore'),
            icon:
            <svg xmlns="http://www.w3.org/2000/svg" width="28px" height="28px" viewBox="0 0 24 24" fill="#000000">
                <path fillRule="evenodd" d="M12,2 C17.5228475,2 22,6.4771525 22,12 C22,17.5228475 17.5228475,22 12,22 C6.4771525,22 2,17.5228475 2,12 C2,6.4771525 6.4771525,2 12,2 Z M17.9842695,7.39078625 C18.1985588,6.64477525 17.4973604,5.9435768 16.7513494,6.1578661 L16.6494246,6.19284365 L9.57835679,9.02127078 L9.47282273,9.07079854 C9.30957453,9.15937167 9.17428758,9.29167162 9.08209683,9.45256344 L9.02127078,9.57835679 L6.19284365,16.6494246 L6.1578661,16.7513494 C5.9435768,17.4973604 6.64477525,18.1985588 7.39078625,17.9842695 L7.49271102,17.949292 L14.5637788,15.1208648 L14.6693129,15.0713371 C14.8325611,14.982764 14.967848,14.850464 15.0600388,14.6895722 L15.1208648,14.5637788 L17.949292,7.49271102 L17.9842695,7.39078625 Z M12,10 C13.1045695,10 14,10.8954305 14,12 C14,13.1045695 13.1045695,14 12,14 C10.8954305,14 10,13.1045695 10,12 C10,10.8954305 10.8954305,10 12,10 Z" fill={location.pathname === '/home/explore' ? "var(--accent-dark)" : "var(--text-muted)"} />
            </svg>
        },
        {
            path: '/home/gallery',
            label: 'Gallery',
            action: () => navigatePath('/home/gallery'),
            icon:
            <svg xmlns="http://www.w3.org/2000/svg" width="28px" height="28px" viewBox="0 -960 960 960" fill={location.pathname === '/home/gallery' ? "var(--accent-dark)" : "var(--text-muted)"}>
                <path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q63 0 121.5 18.5T709-807q-17 19-26 44t-9 52q0 53 37.5 90.5T802-583q27 0 52-9t44-26q36 49 54 107.5T970-480q0 83-31.5 156T853-197q-54 54-127 85.5T570-80H480Zm-12-196q30 0 51-21t21-51q0-30-21-51t-51-21q-30 0-51 21t-21 51q0 30 21 51t51 21Zm-153-84q24 0 42-18t18-42q0-24-18-42t-42-18q-24 0-42 18t-18 42q0 24 18 42t42 18Zm6-189q17 0 28.5-11.5T361-589q0-17-11.5-28.5T321-629q-17 0-28.5 11.5T281-589q0 17 11.5 28.5T321-549Zm183-66q36 0 60-24t24-60q0-36-24-60t-60-24q-36 0-60 24t-24 60q0 36 24 60t60 24Z"/>
            </svg>
        },
        {
            path: '/profile',
            label: 'Profile', action: ()=> navigatePath('/profile'),
            icon: 
            <svg xmlns="http://www.w3.org/2000/svg" width="28px" height="28px" viewBox="0 0 24 24" fill="#000000ff">
                <g id="style=fill">
                    <g id="profile">
                        <path id="vector (Stroke)" fillRule="evenodd" clipRule="evenodd" d="M6.75 6.5C6.75 3.6005 9.1005 1.25 12 1.25C14.8995 1.25 17.25 3.6005 17.25 6.5C17.25 9.3995 14.8995 11.75 12 11.75C9.1005 11.75 6.75 9.3995 6.75 6.5Z" fill={location.pathname === '/profile' ? "var(--accent-dark)" : "var(--text-muted)"}/>
                        <path id="rec (Stroke)" fillRule="evenodd" clipRule="evenodd" d="M4.25 18.5714C4.25 15.6325 6.63249 13.25 9.57143 13.25H14.4286C17.3675 13.25 19.75 15.6325 19.75 18.5714C19.75 20.8792 17.8792 22.75 15.5714 22.75H8.42857C6.12081 22.75 4.25 20.8792 4.25 18.5714Z" fill={location.pathname === '/profile' ? "var(--accent-dark)" : "var(--text-muted)"}/>
                    </g>
                </g>
            </svg>
        },
        {
            path: '/home/notifications', 
            label: 'Notifications', 
            notifCount: notifCount > 0 ? notifCount : '',
            action: () => navigate('/home/notifications'),
            icon: 
            <svg xmlns="http://www.w3.org/2000/svg" width="28px" height="28px" viewBox="0 0 24 24" fill="#000000ff">
                <g id="style=fill">
                    <g id="notification-bell">
                        <path id="vector (Stroke)" fillRule="evenodd" clipRule="evenodd" d="M14.802 19.8317C15.4184 19.7699 15.8349 20.4242 15.5437 20.9539C15.3385 21.3271 15.0493 21.6529 14.7029 21.9197C14.3496 22.1918 13.9397 22.4006 13.5 22.5408C13.0601 22.6812 12.593 22.7522 12.1242 22.7522C11.6554 22.7522 11.1883 22.6812 10.7484 22.5408C10.3087 22.4006 9.89883 22.1918 9.54556 21.9197C9.1991 21.6529 8.90988 21.3271 8.70472 20.9539C8.41354 20.4242 8.83002 19.7699 9.44644 19.8317C9.63869 19.851 11.1433 19.9981 12.1242 19.9981C13.1051 19.9981 14.6097 19.851 14.802 19.8317Z" fill={location.pathname === '/home/notifications' ? "var(--accent-dark)" : "var(--text-muted)"}/>
                        <path id="vector (Stroke)_2" fillRule="evenodd" clipRule="evenodd" d="M8.52901 2.08755C10.7932 1.00445 13.4465 0.967602 15.7423 1.98737L15.9475 2.07851C18.3532 3.14707 19.8934 5.4622 19.8934 8.0096L19.8934 9.27297C19.8934 10.2885 20.1236 11.2918 20.5681 12.213L20.8335 12.7632C22.0525 15.29 20.465 18.2435 17.6156 18.7498L17.455 18.7783C13.93 19.4046 10.3154 19.4046 6.79044 18.7783C3.90274 18.2653 2.37502 15.1943 3.77239 12.7115L3.99943 12.3082C4.55987 11.3124 4.85335 10.1981 4.85335 9.06596L4.85335 7.79233C4.85335 5.3744 6.27704 3.16478 8.52901 2.08755Z" fill={location.pathname === '/home/notifications' ? "var(--accent-dark)" : "var(--text-muted)"}/>
                    </g>
                </g>
            </svg> 
        },
        {
            path: '/home/boomark', 
            label: 'Bookmarks', action: ()=> navigatePath('/home/bookmark'), 
            icon: 
            <svg xmlns="http://www.w3.org/2000/svg" width="28px" height="28px" viewBox="0 0 24 24" fill="none">
                <g id="style=fill">
                    <g id="bookmark">
                    <path id="Subtract" fillRule="evenodd" clipRule="evenodd" d="M8 1.25C5.37665 1.25 3.25 3.37665 3.25 6V20.4648C3.25 21.7269 4.27311 22.75 5.53518 22.75C5.98634 22.75 6.42739 22.6165 6.80278 22.3662L11.3066 19.3636C11.7265 19.0837 12.2735 19.0837 12.6934 19.3636L17.1972 22.3662C17.5726 22.6165 18.0137 22.75 18.4648 22.75C19.7269 22.75 20.75 21.7269 20.75 20.4648V6C20.75 3.37665 18.6234 1.25 16 1.25H8ZM9 6.75C8.58579 6.75 8.25 7.08579 8.25 7.5C8.25 7.91421 8.58579 8.25 9 8.25H15C15.4142 8.25 15.75 7.91421 15.75 7.5C15.75 7.08579 15.4142 6.75 15 6.75H9Z" fill={location.pathname === '/home/bookmark' ? "var(--accent-dark)" : "var(--text-muted)"}/>
                    </g>
                </g>
            </svg>
        },
        {
            label: 'Write', action: () => setShowEditor(true), 
            className: 'write-journal-bttn'
        }, // the action function will set the state  to (true)and pass to the HOME.jsx when user clicks this function
    ];
};

