import React, { type CSSProperties } from 'react';
import styles from './CrystalLoader.module.css';

interface CrystalLoaderProps {
  className?: string;
  size?: number | string;
}

export const CrystalLoader: React.FC<CrystalLoaderProps> = ({ className, size }) => {
  const inlineStyle = size ? { '--loader-size': typeof size === 'number' ? `${size}px` : size } as CSSProperties : undefined;
  
  return (
    <div className={`${styles.container} ${className || ''}`} style={inlineStyle}>
      <div className={styles.loader}>
        <div className={styles.crystal} />
        <div className={styles.crystal} />
        <div className={styles.crystal} />
        <div className={styles.crystal} />
        <div className={styles.crystal} />
        <div className={styles.crystal} />
      </div>
    </div>
  );
};
