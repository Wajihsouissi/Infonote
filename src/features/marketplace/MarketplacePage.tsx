import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { ArrowLeft, ShoppingBag, Search, Filter, Grid, List, Layout, Box, Star, Clock } from '../../components/icons';
import styles from './MarketplacePage.module.css';

export const MarketplacePage: React.FC = () => {
  const setCurrentView = useStore((state) => state.setCurrentView);
  const [activeView, setActiveView] = useState<'grid' | 'list'>('grid');

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button 
            className={styles.backButton}
            onClick={() => setCurrentView('landing')}
          >
            <ArrowLeft size={16} />
            <span>Dashboard</span>
          </button>
          <div className={styles.title}>
            <ShoppingBag size={22} className={styles.titleIcon} />
            <h1>Marketplace</h1>
          </div>
        </div>
        <div className={styles.userSection}>
           <div className={styles.searchBar}>
             <Search size={16} className={styles.searchIcon} />
             <input type="text" placeholder="Search templates and assets..." />
           </div>
        </div>
      </header>

      <main className={styles.content}>
        <div className={styles.sidebar}>
          <div className={styles.sidebarSection}>
            <h3>Categories</h3>
            <ul>
              <li className={styles.active}>
                <Layout size={16} /> All Templates
              </li>
              <li>
                <Box size={16} /> Note Templates
              </li>
              <li>
                <Layout size={16} /> Kanban Boards
              </li>
              <li>
                <Star size={16} /> Featured
              </li>
              <li>
                <Clock size={16} /> Recently Added
              </li>
            </ul>
          </div>

          <div className={styles.sidebarSection}>
            <h3>Filters</h3>
            <div className={styles.filterItem}>
              <Filter size={16} />
              <span>Refine Results</span>
            </div>
          </div>
        </div>

        <div className={styles.mainGrid}>
          <div className={styles.toolbar}>
            <span>0 premium templates available</span>
            <div className={styles.viewToggle}>
              <button 
                className={`${styles.viewBtn} ${activeView === 'grid' ? styles.active : ''}`}
                onClick={() => setActiveView('grid')}
              >
                <Grid size={16} />
              </button>
              <button 
                className={`${styles.viewBtn} ${activeView === 'list' ? styles.active : ''}`}
                onClick={() => setActiveView('list')}
              >
                <List size={16} />
              </button>
            </div>
          </div>

          <div className={styles.placeholder}>
            <div className={styles.placeholderIcon}>
              <ShoppingBag size={42} />
            </div>
            <h2>Coming Soon</h2>
            <p>We are building a premium marketplace for high-quality Chnk it templates, canvas modules, and custom workflows. Stay tuned!</p>
          </div>
        </div>
      </main>
    </div>
  );
};
