import { memo } from 'react';
import { Sparkles, Loader2, Layout } from 'lucide-react';
import styles from './AISkeletonCard.module.css';

export const AISkeletonCard = memo(() => {
    return (
        <div className={styles.skeletonWrapper}>
            {/* Ambient Background Glows */}
            <div className={`${styles.glowOrb} ${styles.glowOrb1}`} />
            <div className={`${styles.glowOrb} ${styles.glowOrb2}`} />

            {/* Twinkling Sparkle Decorations */}
            <div className={`${styles.sparkle} ${styles.sparkle1}`}>✦</div>
            <div className={`${styles.sparkle} ${styles.sparkle2}`}>✧</div>
            <div className={`${styles.sparkle} ${styles.sparkle3}`}>✦</div>

            <div className={styles.content}>
                {/* Heading Structure */}
                <div className={styles.headerGroup}>
                    <div className={`${styles.shimmerBlock} ${styles.iconPlaceholder}`}>
                        <Sparkles size={24} />
                    </div>
                    <div className={styles.titleLines}>
                        <div className={`${styles.shimmerBlock} ${styles.titleLineMain}`} />
                        <div className={`${styles.shimmerBlock} ${styles.titleLineSub}`} />
                    </div>
                </div>
                
                {/* Text Blocks Structure */}
                <div className={styles.textGroup}>
                    <div className={`${styles.shimmerBlock} ${styles.textLine}`} style={{ width: '95%' }} />
                    <div className={`${styles.shimmerBlock} ${styles.textLine}`} style={{ width: '85%' }} />
                    <div className={`${styles.shimmerBlock} ${styles.textLine}`} style={{ width: '90%' }} />
                    <div className={`${styles.shimmerBlock} ${styles.textLine}`} style={{ width: '60%' }} />
                </div>
                
                {/* Image Wireframe Structure */}
                <div className={`${styles.shimmerBlock} ${styles.imageWireframe}`}>
                    <Layout size={32} className={styles.imageWireframeIcon} />
                </div>
            </div>
            
            {/* Status Badge */}
            <div className={styles.statusBadge}>
                <Loader2 size={12} className="animate-spin" /> SYNTHESIZING
            </div>
        </div>
    );
});
