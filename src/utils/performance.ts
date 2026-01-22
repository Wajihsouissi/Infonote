// Performance telemetry and monitoring

const DEBUG = import.meta.env.DEV;

interface PerformanceMetric {
    name: string;
    duration: number;
    timestamp: number;
    metadata?: Record<string, any>;
}

class PerformanceMonitor {
    private metrics: PerformanceMetric[] = [];
    private maxMetrics = 1000;
    private activeTimers: Map<string, number> = new Map();

    // Start timing an operation
    startTimer(name: string, metadata?: Record<string, any>): void {
        const startTime = performance.now();
        this.activeTimers.set(name, startTime);
        
        if (DEBUG) {
            console.log(`[Perf] Started: ${name}`, metadata);
        }
    }

    // End timing and record metric
    endTimer(name: string, metadata?: Record<string, any>): number {
        const startTime = this.activeTimers.get(name);
        if (!startTime) {
            console.warn(`[Perf] No start time for: ${name}`);
            return 0;
        }

        const duration = performance.now() - startTime;
        this.activeTimers.delete(name);

        this.recordMetric({
            name,
            duration,
            timestamp: Date.now(),
            metadata
        });

        if (DEBUG) {
            console.log(`[Perf] Completed: ${name} in ${duration.toFixed(2)}ms`, metadata);
        }

        return duration;
    }

    // Record a metric directly
    recordMetric(metric: PerformanceMetric): void {
        this.metrics.push(metric);
        
        // Keep only recent metrics
        if (this.metrics.length > this.maxMetrics) {
            this.metrics.shift();
        }

        // Warn on slow operations
        if (metric.duration > 1000 && DEBUG) {
            console.warn(`[Perf] SLOW: ${metric.name} took ${metric.duration.toFixed(2)}ms`, metric.metadata);
        }
    }

    // Get metrics for a specific operation
    getMetrics(name: string): PerformanceMetric[] {
        return this.metrics.filter(m => m.name === name);
    }

    // Get average duration for an operation
    getAverage(name: string): number {
        const filtered = this.getMetrics(name);
        if (filtered.length === 0) return 0;
        
        const sum = filtered.reduce((acc, m) => acc + m.duration, 0);
        return sum / filtered.length;
    }

    // Get recent metrics (last N)
    getRecent(count: number = 10): PerformanceMetric[] {
        return this.metrics.slice(-count);
    }

    // Get all metrics
    getAllMetrics(): PerformanceMetric[] {
        return [...this.metrics];
    }

    // Generate performance report
    generateReport(): Record<string, { count: number; avg: number; min: number; max: number }> {
        const report: Record<string, { count: number; avg: number; min: number; max: number }> = {};
        
        this.metrics.forEach(metric => {
            if (!report[metric.name]) {
                report[metric.name] = {
                    count: 0,
                    avg: 0,
                    min: Infinity,
                    max: -Infinity
                };
            }
            
            const stats = report[metric.name];
            stats.count++;
            stats.avg = (stats.avg * (stats.count - 1) + metric.duration) / stats.count;
            stats.min = Math.min(stats.min, metric.duration);
            stats.max = Math.max(stats.max, metric.duration);
        });
        
        return report;
    }

    // Clear all metrics
    clear(): void {
        this.metrics = [];
        this.activeTimers.clear();
    }

    // Log report to console
    logReport(): void {
        const report = this.generateReport();
        console.table(report);
    }
}

// Singleton instance
export const perfMonitor = new PerformanceMonitor();

// Utility function for timing async operations
export async function measureAsync<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
): Promise<T> {
    perfMonitor.startTimer(name, metadata);
    try {
        const result = await fn();
        perfMonitor.endTimer(name, metadata);
        return result;
    } catch (error) {
        perfMonitor.endTimer(name, { ...metadata, error: true });
        throw error;
    }
}

// Utility function for timing sync operations
export function measureSync<T>(
    name: string,
    fn: () => T,
    metadata?: Record<string, any>
): T {
    perfMonitor.startTimer(name, metadata);
    try {
        const result = fn();
        perfMonitor.endTimer(name, metadata);
        return result;
    } catch (error) {
        perfMonitor.endTimer(name, { ...metadata, error: true });
        throw error;
    }
}

// Monitor React component render time
export function useRenderTime(componentName: string) {
    if (!DEBUG) return;
    
    const renderStart = performance.now();
    
    // This runs after render
    queueMicrotask(() => {
        const renderTime = performance.now() - renderStart;
        if (renderTime > 16) { // > 1 frame at 60fps
            console.warn(`[Perf] Slow render: ${componentName} took ${renderTime.toFixed(2)}ms`);
        }
    });
}

// Expose to window for debugging
if (DEBUG && typeof window !== 'undefined') {
    (window as any).__perfMonitor = perfMonitor;
    console.log('[Perf] Monitor available at window.__perfMonitor');
}
