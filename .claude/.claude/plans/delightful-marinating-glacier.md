# ProfilePage Editor UI Enhancement Plan

## Context
The ProfilePage editor components have several bugs (missing desktop overlay, typos, no error feedback, double-click saves) and the UI doesn't fully match the app's warm glass-morphism design philosophy (blue loaders in a gold/brown palette, no input focus states, jarring `scale(0)` animation). This plan fixes all bugs and polishes the editor to feel smooth and delightful.

---

## Bug Fixes (9 bugs)

| # | Bug | File(s) | Fix |
|---|-----|---------|-----|
| 1 | `.profile-editor-bg` overlay **only defined in mobile** media queries - desktop has no backdrop | `myprofile.css` | Add desktop base rule matching `.profile-layout-builder-bg` pattern |
| 2 | Typo `hancleClickCancelFontSelect` | `MyProfile.jsx`, `ProfileFontColorSelector.jsx` | Rename to `handleClickCancelFontSelect` |
| 3 | Typo `opendRichTextEditor` | `MyProfile.jsx` | Rename to `openRichTextEditor` |
| 4 | Typo CSS class `canvel-save-container` | `ProfileBackgroundPicker.jsx`, `myprofile.css` | Rename to `cancel-save-container` |
| 5 | `setProfileEditAvatar(file)` called twice | `MyProfile.jsx:121,123` | Remove the duplicate on line 121 |
| 6 | BarLoader `color="rgb(40,115,255)"` (blue) clashes with warm palette | All 3 modals | Change to `var(--accent-purple)` (gold `#C4943E`) matching existing editors |
| 7 | Save button clickable during save (double-submit) | `ProfileEditModal.jsx` | Add `.is-saving` class + click guard |
| 8 | No error feedback - errors thrown silently | `MyProfile.jsx` handlers | Add `saveError` state, error toast, restructure try/catch to not close modal on error |
| 9 | Cancel font color resets to `""` instead of last saved value | `MyProfile.jsx:289` | Reset to `userData?.profile_font_color \|\| ""` |

---

## UI Improvements

### 1. `myprofile.css` - Foundation styles
- **Desktop `.profile-editor-bg`** overlay: `position: absolute; inset: 0; var(--bg-backdrop); backdrop-filter: blur(5px); z-index: 135`
- **Input focus rings:** `.edit-profile-input-name-container:focus-within` and bio container get `border-color: var(--accent-dark)` transition
- **Save button disabled:** `.profile-edit-save-bttn.is-saving` with `opacity: 0.6; pointer-events: none`
- **`.save-button.is-saving`** same pattern for bg picker and font color modals
- **Error toast:** `.profile-save-error-toast` - fixed bottom center, `var(--color-danger)` bg, auto-dismiss animation
- **Selected gradient:** `.gradient-box.gradient-selected` - outline ring `var(--accent-dark)`
- **Avatar hover reveal:** `.profile-edit-image-bg` starts `opacity: 0`, parent `:hover` reveals it
- **Font color swatch:** Increase to `60px`, `border-radius: 12px`, add hover scale + `.font-color-hex-label`
- **Font selector height:** Change from fixed `120px` to `fit-content`

### 2. `MyProfile.jsx` - Parent state & handlers
- Fix all 3 typos (bugs #2, #3, #5)
- Add `saveError` state + `showError()` helper with 4s auto-clear
- Restructure `handleSaveProfileEdit`: only close modal + invalidate cache on success, show error on catch
- Restructure `handleSaveProfileConfig`: same pattern
- Restructure `handleClickSaveFontColor`: same pattern
- Fix cancel handler to revert to `userData?.profile_font_color`
- Pass `gradientPicked` to `ProfileBackgroundPicker`
- Render error toast JSX

### 3. `ProfileEditModal.jsx`
- BarLoader: `color="var(--accent-purple)"`
- Save button: click guard + `.is-saving` class + "Saving..." text
- Animation: change `initial={{ scale: 0 }}` to `initial={{ scale: 0.9, opacity: 0, y: 20 }}` (less jarring)
- Backdrop click-to-close: `onClick={closeEditor}` on `.profile-editor-bg`, `stopPropagation` on container

### 4. `ProfileBackgroundPicker.jsx`
- Fix `canvel-save-container` → `cancel-save-container`
- Capitalize buttons: "cancel"→"Cancel", "save"→"Save"/"Saving..."
- BarLoader: warm color
- Accept `gradientPicked` prop, apply `.gradient-selected` class to matching gradient
- Save button disabled during save

### 5. `ProfileFontColorSelector.jsx`
- Fix prop `hancleClickCancelFontSelect` → `handleClickCancelFontSelect`
- BarLoader: warm color
- Add hex label: `<div className="font-color-hex-label">{fontColor || "No color"}</div>`
- Save button disabled during save

### 6. `ProfileHeroSection.jsx`
- Add `title` attributes: "Edit your profile", "Change font color", "Share profile"

---

## Implementation Order
1. `myprofile.css` (all new classes must exist before JSX references them)
2. `MyProfile.jsx` (parent fixes enable child prop changes)
3. `ProfileEditModal.jsx`
4. `ProfileBackgroundPicker.jsx`
5. `ProfileFontColorSelector.jsx`
6. `ProfileHeroSection.jsx`

## Verification
1. Open profile page on desktop - click "Edit Profile" and verify backdrop overlay appears
2. Edit name/bio, change avatar, save - verify loading state on button, no double-click
3. Intentionally disconnect network → save → verify error toast appears and modal stays open
4. Open background picker → select gradient → verify selected gradient has outline ring
5. Open font color picker → pick color → verify hex label updates, save works, cancel reverts to saved color
6. Hover icon buttons → verify tooltips appear
7. Test on mobile (428px) → verify all modals still work correctly
8. Check dark mode → verify all CSS variables adapt properly
