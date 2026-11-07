/*
 * The loading kit (docs/loading-states.md §4): every wait in the app is built
 * from these, so none of them has to re-decide timing, motion or words.
 */
export { default as LoadingBar } from './LoadingBar';
export { default as LoadingPill } from './LoadingPill';
export { default as PanePlaceholder } from './PanePlaceholder';
export { default as Skeleton } from './Skeleton';
export { default as BusyButton } from './BusyButton';
export { default as Spinner } from './Spinner';
export { afterPaint, useAfterPaint } from './afterPaint';
export { loadingClock, useDelayedFlag, usePresence } from './timing';
export * from './loadingCopy';
