

import styles from './NoteCard.module.css';

export const SkeletonLoader = () => {
    return (
        <div className={styles.skeletonContainer}>
            {/* Title Skeleton */}
            <div className={`${styles.skeletonBlock} ${styles.skeletonTitle}`} />

            {/* Content Skeletons */}
            <div className={styles.skeletonBlock} />
            <div className={`${styles.skeletonBlock} ${styles.skeletonTextShort}`} />

            <div style={{ height: '8px' }} /> {/* Spacer */}

            <div className={styles.skeletonBlock} />
            <div className={`${styles.skeletonBlock} ${styles.skeletonTextShort}`} />

            <div style={{ height: '8px' }} /> {/* Spacer */}

            <div className={`${styles.skeletonBlock} ${styles.skeletonImage}`} />
        </div>
    );
};
