import { Calendar, Link2, User, LayoutList, Text, Flag, BarChart3 } from '../../../components/icons';

// Helper to get icon for property type
export const getPropertyIcon = (key: string) => {
    switch (key) {
        case 'status': return LayoutList;
        case 'priority': return Flag;
        case 'startDate': return Calendar;
        case 'dueDate': return Calendar;
        case 'url': return Link2;
        case 'assignee': return User;
        case 'progress': return BarChart3;
        case 'tasks': return LayoutList;
        default: return Text;
    }
};
