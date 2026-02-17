import { memo, useState, useCallback } from 'react';
import { Search, X, Filter, ArrowUpDown, ArrowUp, ArrowDown, Rows, LayoutGrid, Table2, Calendar, Clock } from 'lucide-react';
import styles from './KanbanToolbar.module.css';

type SortField = 'dueDate' | 'priority' | 'createdAt' | 'label' | null;
type SortDirection = 'asc' | 'desc';
type SwimlaneField = 'assignee' | 'category' | 'priority' | null;

interface KanbanToolbarProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    priorityFilter: string[];
    onPriorityFilterChange: (priorities: string[]) => void;
    assigneeFilter: string;
    onAssigneeFilterChange: (assignee: string) => void;
    onClearFilters: () => void;
    hasActiveFilters: boolean;
    sortBy: SortField;
    sortDirection: SortDirection;
    onSortChange: (field: SortField, direction: SortDirection) => void;
    swimlaneField: SwimlaneField;
    onSwimlaneChange: (field: SwimlaneField) => void;
    viewMode: 'board' | 'table' | 'calendar' | 'timeline';
    onViewModeChange: (mode: 'board' | 'table' | 'calendar' | 'timeline') => void;
}

const priorityOptions = [
    { value: 'urgent', label: 'Urgent', color: '#ef4444' },
    { value: 'high', label: 'High', color: '#f97316' },
    { value: 'medium', label: 'Medium', color: '#eab308' },
    { value: 'low', label: 'Low', color: '#22c55e' },
];

const sortOptions = [
    { value: 'dueDate', label: 'Due Date' },
    { value: 'priority', label: 'Priority' },
    { value: 'createdAt', label: 'Created' },
    { value: 'label', label: 'Name' },
];

const swimlaneOptions = [
    { value: 'assignee', label: 'By Assignee' },
    { value: 'category', label: 'By Category' },
    { value: 'priority', label: 'By Priority' },
];

export const KanbanToolbar = memo(({
    searchQuery,
    onSearchChange,
    priorityFilter,
    onPriorityFilterChange,
    assigneeFilter,
    onAssigneeFilterChange,
    onClearFilters,
    hasActiveFilters,
    sortBy,
    sortDirection,
    onSortChange,
    swimlaneField,
    onSwimlaneChange,
    viewMode,
    onViewModeChange
}: KanbanToolbarProps) => {
    const [showPriorityMenu, setShowPriorityMenu] = useState(false);
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [showSwimlaneMenu, setShowSwimlaneMenu] = useState(false);

    const togglePriority = useCallback((priority: string) => {
        if (priorityFilter.includes(priority)) {
            onPriorityFilterChange(priorityFilter.filter(p => p !== priority));
        } else {
            onPriorityFilterChange([...priorityFilter, priority]);
        }
    }, [priorityFilter, onPriorityFilterChange]);

    const handleSortSelect = useCallback((field: SortField) => {
        if (field === sortBy) {
            // Toggle direction
            onSortChange(field, sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            // New field, default to asc (or desc for priority)
            onSortChange(field, field === 'priority' ? 'desc' : 'asc');
        }
        setShowSortMenu(false);
    }, [sortBy, sortDirection, onSortChange]);

    const clearSort = useCallback(() => {
        onSortChange(null, 'asc');
        setShowSortMenu(false);
    }, [onSortChange]);

    const currentSortLabel = sortBy ? sortOptions.find(o => o.value === sortBy)?.label : '';

    return (
        <div className={styles.toolbar}>
            {/* View Mode Toggle */}
            <div className={styles.viewToggle}>
                <button
                    className={`${styles.viewToggleBtn} ${viewMode === 'board' ? styles.viewToggleActive : ''}`}
                    onClick={() => onViewModeChange('board')}
                    title="Board View"
                >
                    <LayoutGrid size={14} />
                </button>
                <button
                    className={`${styles.viewToggleBtn} ${viewMode === 'table' ? styles.viewToggleActive : ''}`}
                    onClick={() => onViewModeChange('table')}
                    title="Table View"
                >
                    <Table2 size={14} />
                </button>
                <button
                    className={`${styles.viewToggleBtn} ${viewMode === 'calendar' ? styles.viewToggleActive : ''}`}
                    onClick={() => onViewModeChange('calendar')}
                    title="Calendar View"
                >
                    <Calendar size={14} />
                </button>
                <button
                    className={`${styles.viewToggleBtn} ${viewMode === 'timeline' ? styles.viewToggleActive : ''}`}
                    onClick={() => onViewModeChange('timeline')}
                    title="Timeline View"
                >
                    <Clock size={14} />
                </button>
            </div>

            {/* Search Input */}
            <div className={styles.searchContainer}>
                <Search size={14} className={styles.searchIcon} />
                <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Search cards..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                />
                {searchQuery && (
                    <button
                        className={styles.clearBtn}
                        onClick={() => onSearchChange('')}
                    >
                        <X size={12} />
                    </button>
                )}
            </div>

            {/* Sort Dropdown */}
            <div className={styles.filterContainer}>
                <button
                    className={`${styles.filterBtn} ${sortBy ? styles.active : ''}`}
                    onClick={() => setShowSortMenu(!showSortMenu)}
                >
                    <ArrowUpDown size={14} />
                    {sortBy ? (
                        <>
                            {currentSortLabel}
                            {sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                        </>
                    ) : 'Sort'}
                </button>

                {showSortMenu && (
                    <div className={styles.filterMenu}>
                        {sortOptions.map(opt => (
                            <div
                                key={opt.value}
                                className={`${styles.sortOption} ${sortBy === opt.value ? styles.sortActive : ''}`}
                                onClick={() => handleSortSelect(opt.value as SortField)}
                            >
                                {opt.label}
                                {sortBy === opt.value && (
                                    sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                                )}
                            </div>
                        ))}
                        {sortBy && (
                            <div className={styles.sortClear} onClick={clearSort}>
                                <X size={12} />
                                Clear sort
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Swimlane Dropdown */}
            <div className={styles.filterContainer}>
                <button
                    className={`${styles.filterBtn} ${swimlaneField ? styles.active : ''}`}
                    onClick={() => setShowSwimlaneMenu(!showSwimlaneMenu)}
                >
                    <Rows size={14} />
                    {swimlaneField
                        ? swimlaneOptions.find(o => o.value === swimlaneField)?.label
                        : 'Swimlanes'}
                </button>

                {showSwimlaneMenu && (
                    <div className={styles.filterMenu}>
                        {swimlaneOptions.map(opt => (
                            <div
                                key={opt.value}
                                className={`${styles.sortOption} ${swimlaneField === opt.value ? styles.sortActive : ''}`}
                                onClick={() => {
                                    onSwimlaneChange(opt.value as SwimlaneField);
                                    setShowSwimlaneMenu(false);
                                }}
                            >
                                {opt.label}
                            </div>
                        ))}
                        {swimlaneField && (
                            <div
                                className={styles.sortClear}
                                onClick={() => {
                                    onSwimlaneChange(null);
                                    setShowSwimlaneMenu(false);
                                }}
                            >
                                <X size={12} />
                                Disable Swimlanes
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Priority Filter */}
            <div className={styles.filterContainer}>
                <button
                    className={`${styles.filterBtn} ${priorityFilter.length > 0 ? styles.active : ''}`}
                    onClick={() => setShowPriorityMenu(!showPriorityMenu)}
                >
                    <Filter size={14} />
                    Priority
                    {priorityFilter.length > 0 && (
                        <span className={styles.filterBadge}>{priorityFilter.length}</span>
                    )}
                </button>

                {showPriorityMenu && (
                    <div className={styles.filterMenu}>
                        {priorityOptions.map(opt => (
                            <label key={opt.value} className={styles.filterOption}>
                                <input
                                    type="checkbox"
                                    checked={priorityFilter.includes(opt.value)}
                                    onChange={() => togglePriority(opt.value)}
                                />
                                <span
                                    className={styles.priorityDot}
                                    style={{ backgroundColor: opt.color }}
                                />
                                {opt.label}
                            </label>
                        ))}
                    </div>
                )}
            </div>

            {/* Assignee Filter */}
            <div className={styles.assigneeContainer}>
                <input
                    type="text"
                    className={styles.assigneeInput}
                    placeholder="Filter by assignee..."
                    value={assigneeFilter}
                    onChange={(e) => onAssigneeFilterChange(e.target.value)}
                />
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
                <button className={styles.clearFiltersBtn} onClick={onClearFilters}>
                    <X size={12} />
                    Clear filters
                </button>
            )}
        </div>
    );
});
