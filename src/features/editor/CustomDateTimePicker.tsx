import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Clock, Calendar as CalendarIcon } from 'lucide-react';
import styles from './CustomDateTimePicker.module.css';

interface CustomDateTimePickerProps {
    value?: string;
    onChange: (date: string) => void;
    onClose: () => void;
}

export const CustomDateTimePicker: React.FC<CustomDateTimePickerProps> = ({ value, onChange, onClose }) => {
    const hasInitialTime = value ? value.includes('T') : false;
    const [includeTime, setIncludeTime] = useState(hasInitialTime);
    
    const [currentDate, setCurrentDate] = useState(() => {
        if (!value) return new Date();
        if (!value.includes('T')) {
            const [y, m, d] = value.split('-').map(Number);
            return new Date(y, m - 1, d);
        }
        return new Date(value);
    });
    
    const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
        if (!value) return null;
        if (!value.includes('T')) {
            const [y, m, d] = value.split('-').map(Number);
            return new Date(y, m - 1, d);
        }
        return new Date(value);
    });

    const [time, setTime] = useState(() => {
        if (value && value.includes('T')) {
            const d = new Date(value);
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }
        return '12:00';
    });

    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside, true);
        document.addEventListener('keydown', handleKeyDown, true);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside, true);
            document.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [onClose]);

    const getDaysInMonth = (year: number, month: number) => {
        return new Date(year, month + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (year: number, month: number) => {
        return new Date(year, month, 1).getDay();
    };

    const handlePrevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const handleDateSelect = (day: number) => {
        const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        setSelectedDate(newDate);
    };

    const handleSave = () => {
        if (selectedDate) {
            if (includeTime) {
                const [hours, minutes] = time.split(':').map(Number);
                const finalDate = new Date(selectedDate);
                finalDate.setHours(hours, minutes);
                onChange(finalDate.toISOString());
            } else {
                const year = selectedDate.getFullYear();
                const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                const day = String(selectedDate.getDate()).padStart(2, '0');
                onChange(`${year}-${month}-${day}`);
            }
            onClose();
        }
    };

    const renderCalendar = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = getFirstDayOfMonth(year, month);
        
        const days = [];
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

        // Add empty slots for days before the 1st
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className={styles.dayEmpty} />);
        }

        // Add days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const isSelected = selectedDate?.getDate() === day && selectedDate?.getMonth() === month && selectedDate?.getFullYear() === year;
            const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;

            days.push(
                <div 
                    key={day} 
                    className={`${styles.day} ${isSelected ? styles.selected : ''} ${isToday && !isSelected ? styles.today : ''}`}
                    onClick={() => handleDateSelect(day)}
                >
                    {day}
                </div>
            );
        }

        return (
            <div className={styles.calendarContainer}>
                <div className={styles.header}>
                    <button className={styles.navButton} onClick={handlePrevMonth}><ChevronLeft size={16} /></button>
                    <div className={styles.monthYear}>{monthNames[month]} {year}</div>
                    <button className={styles.navButton} onClick={handleNextMonth}><ChevronRight size={16} /></button>
                </div>
                <div className={styles.weekDays}>
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d} className={styles.weekDay}>{d}</div>)}
                </div>
                <div className={styles.daysGrid}>
                    {days}
                </div>
            </div>
        );
    };

    return (
        <div className={styles.modalOverlay} onMouseDown={(e) => e.stopPropagation()}>
            <div className={styles.modalContent} ref={modalRef}>
                <div className={styles.modalHeader}>
                    <CalendarIcon size={16} className={styles.headerIcon} />
                    <span>Select Date & Time</span>
                </div>
                
                {renderCalendar()}
                
                <div className={styles.timeSectionWrapper}>
                    <div className={styles.timeSectionHeader}>
                        <div className={styles.timeLabel}>
                            <Clock size={14} /> Include Time
                        </div>
                        <label className={styles.switch}>
                            <input type="checkbox" checked={includeTime} onChange={(e) => setIncludeTime(e.target.checked)} />
                            <span className={styles.slider}></span>
                        </label>
                    </div>
                    {includeTime && (
                        <div className={styles.timeSection}>
                            <div className={styles.timeLabel}>Select Time</div>
                            <input 
                                type="time" 
                                className={styles.timeInput} 
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                            />
                        </div>
                    )}
                </div>

                <div className={styles.actions}>
                    <button className={styles.cancelButton} onClick={onClose}>Cancel</button>
                    <button 
                        className={styles.saveButton} 
                        onClick={handleSave}
                        disabled={!selectedDate}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};
