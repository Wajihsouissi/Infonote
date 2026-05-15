import React from 'react';
import { useStore } from '../../store/useStore';
import { ArrowLeft, ShoppingBag, Search, Filter, Grid, List } from 'lucide-react';
import styles from './MarketplacePage.module.css';

export const MarketplacePage: React.FC = () => {
  const setCurrentView = useStore((state) => state.setCurrentView);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button 
          className={styles.backButton}
          onClick={() => setCurrentView('landing')}
        >
          <ArrowLeft size={20} />
          <span>Back to Home</span>
        </button>
        <div className={styles.title}>
          <ShoppingBag size={24} className={styles.titleIcon} />
          <h1>Marketplace</h1>
        </div>
        <div className={styles.userSection}>
           <div className={styles.searchBar}>
             <Search size={18} />
             <input type="text" placeholder="Search templates..." />
           </div>
        </div>
      </header>

      <main className={styles.content}>
        <div className={styles.sidebar}>
          <h3>Categories</h3>
          <ul>
            <li className={styles.active}>All Templates</li>
            <li>Note Templates</li>
            <li>Kanban Boards</li>
            <li>Knowledge Bases</li>
            <li>Project Plans</li>
          </ul>

          <div className={styles.filterSection}>
            <h3>Filters</h3>
            <div className={styles.filterItem}>
              <Filter size={16} />
              <span>Refine Results</span>
            </div>
          </div>
        </div>

        <div className={styles.mainGrid}>
          <div className={styles.toolbar}>
            <span>Showing 0 results</span>
            <div className={styles.viewToggle}>
              <Grid size={18} />
              <List size={18} />
            </div>
          </div>

          <div className={styles.placeholder}>
            <div className={styles.placeholderIcon}>
              <ShoppingBag size={64} />
            </div>
            <h2>Coming Soon</h2>
            <p>We are building a marketplace for premium Infonote templates. Stay tuned!</p>
          </div>
        </div>
      </main>
    </div>
  );
};
