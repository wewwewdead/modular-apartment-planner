# Move "Following" Button to Nav Row

## Context
The "Following" tab is currently in the `.newsfeed-header` alongside Writings/Opinions. The user wants it moved to the `.search-nav-row` (where Freedom Wall and Stories buttons live) instead — both on desktop and mobile. This keeps the header tabs clean (just Writings/Opinions) while making Following discoverable as a navigation button.

## File to Modify
`client/src/components/HomePage/postCards/PostCards.jsx`

### 1. Remove "Following" from `header_links` (line 79)
Change back to:
```js
const header_links = [
    {label: 'Writings', path: '/home'},
    {label: 'Opinions', path: '/home/opinions'},
]
```

### 2. Add "Following" button to `.search-nav-row` (line ~617)
Add a new button alongside Freedom Wall and Stories, styled with `search-nav-btn`. Use an active class when `isFollowingFeed` is true to indicate current state:

```jsx
<div className="search-nav-row">
    <button type="button" className={`search-nav-btn search-nav-following${isFollowingFeed ? ' search-nav-active' : ''}`} onClick={() => navigate('/home/following')}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
        </svg>
        Following
    </button>
    {/* ...existing Freedom Wall and Stories buttons... */}
</div>
```

### 3. Add CSS for `.search-nav-following` in `postcards.css`
Add matching styles alongside `.search-nav-fw` and `.search-nav-stories` (~line 120):
```css
.search-nav-following{
    border: 1.5px solid rgba(234, 179, 56, 0.35);
    background: linear-gradient(135deg, rgba(234, 179, 56, 0.12), rgba(255, 204, 51, 0.08));
    color: #e6a817;
}
.search-nav-following:hover{
    background: linear-gradient(135deg, rgba(234, 179, 56, 0.22), rgba(255, 204, 51, 0.16));
    box-shadow: 0 0 10px rgba(234, 179, 56, 0.15);
}
.search-nav-active{
    background: linear-gradient(135deg, rgba(234, 179, 56, 0.30), rgba(255, 204, 51, 0.22));
    box-shadow: 0 0 12px rgba(234, 179, 56, 0.2);
    border-color: rgba(234, 179, 56, 0.55);
}
```

## Verification
1. "Following" no longer appears in the Writings/Opinions header tabs
2. "Following" button appears in the nav row next to Freedom Wall and Stories
3. Clicking it navigates to `/home/following` and shows the following feed
4. The button has an active/highlighted state when on the following page
5. Works on both desktop and mobile viewports
