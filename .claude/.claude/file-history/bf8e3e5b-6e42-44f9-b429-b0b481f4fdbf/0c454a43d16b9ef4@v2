import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import Toast from './Toast';
import './Toast.css';

const ToastContainer = ({ toasts, onDismiss }) => {
    return createPortal(
        <div className="toast-container" aria-label="Notifications">
            <AnimatePresence mode="popLayout">
                {toasts.map((t) => (
                    <Toast key={t.id} {...t} onDismiss={onDismiss} />
                ))}
            </AnimatePresence>
        </div>,
        document.body
    );
};

export default ToastContainer;
