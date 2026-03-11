import { useState } from 'react';
import Modal from './Modal';
import styles from './NewProjectModal.module.css';
import modalStyles from './Modal.module.css';

export default function NewProjectModal({ onConfirm, onClose }) {
  const [name, setName] = useState('Untitled Project');

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm({ name: name.trim() || 'Untitled Project' });
  };

  return (
    <Modal title="New Project" onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div>
          <label className={styles.label}>Project Name</label>
          <input
            className={styles.nameInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onFocus={(e) => e.target.select()}
          />
        </div>

        <div className={styles.actions}>
          <button type="button" className={modalStyles.modalBtn} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={modalStyles.modalBtn}>
            Create
          </button>
        </div>
      </form>
    </Modal>
  );
}
