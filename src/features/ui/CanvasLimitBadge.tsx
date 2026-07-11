/**
 * CanvasLimitBadge — small usage indicator for the beta limits
 * (see BETA_SCOPE.md). Anonymous users always see their card quota;
 * everyone sees the per-canvas node count once it nears the 50 cap.
 */
import React from 'react';
import styles from './CanvasLimitBadge.module.css';
import { useStore } from '../../store/useStore';
import {
    ANON_MAX_CARDS,
    MAX_NODES_PER_CANVAS,
    countCards,
    countNodesOnCanvas,
} from '../../store/nodeLimits';

const NODE_COUNT_VISIBLE_FROM = MAX_NODES_PER_CANVAS - 10;

export const CanvasLimitBadge: React.FC = () => {
    const currentView = useStore((s) => s.currentView);
    const isAuthenticated = useStore((s) => s.auth.isAuthenticated);
    const nodes = useStore((s) => s.nodes);
    const currentParentId = useStore((s) => s.currentParentId);

    if (currentView !== 'canvas') return null;

    const nodesHere = countNodesOnCanvas(nodes, currentParentId ?? null);
    const showNodeCount = nodesHere >= NODE_COUNT_VISIBLE_FROM;
    const cards = isAuthenticated ? 0 : countCards(nodes);

    if (isAuthenticated && !showNodeCount) return null;

    return (
        <div className={styles.badge} aria-live="polite">
            {!isAuthenticated && (
                <span className={cards >= ANON_MAX_CARDS ? styles.atLimit : undefined}>
                    {cards}/{ANON_MAX_CARDS} cards
                </span>
            )}
            {showNodeCount && (
                <span className={nodesHere >= MAX_NODES_PER_CANVAS ? styles.atLimit : undefined}>
                    {nodesHere}/{MAX_NODES_PER_CANVAS} nodes here
                </span>
            )}
        </div>
    );
};
