import { memo, type ComponentProps, type CSSProperties, type ReactNode } from 'react';
import { BlockItem } from './BlockItem';
import type { RenderNode } from '../../document/blockTree';
import styles from './BlockEditor.module.css';

type ItemOptions = Omit<ComponentProps<typeof BlockItem>, 'block' | 'index' | 'hasChildren' | 'isSelected' | 'parentToggleIndent' | 'isFirstChildOfToggle'>;
interface Props {
    node: RenderNode;
    options: ItemOptions;
    selected: Set<string>;
    parentIndent?: number;
    firstChild?: boolean;
    count: number;
    renderBetween?: (index: number) => ReactNode;
}

/** An unchanged branch stops here, before building its leaf JSX or controls. */
export const EditorRenderNode = memo(function RenderBranch({ node, options, selected, parentIndent, firstChild, count, renderBetween }: Props) {
    const item = <BlockItem {...options} block={node.block} index={node.listIndex}
        hasChildren={node.hasChildren} isSelected={selected.has(node.block.id)}
        isFirstChildOfToggle={firstChild}
        parentToggleIndent={node.kind === 'toggle-group' ? node.block.indent || 0 : parentIndent} />;
    const between = renderBetween && node.index < count - 1 && renderBetween(node.index);
    if (node.kind === 'block') return <>{item}{between}</>;
    const indent = node.block.indent || 0;
    return <>
        <div className={styles.toggleGroupContainer} data-reorder-group-id={node.block.id}
            style={{ '--toggle-indent': `${Math.max(0, indent - (parentIndent || 0)) * 24}px` } as CSSProperties}>
            {item}
            {node.children.length > 0 && !node.block.metadata?.isCollapsed && <div className={styles.toggleChildrenContainer}>
                {node.children.map((child, i) => <EditorRenderNode key={child.block.id} node={child}
                    options={options} selected={selected} parentIndent={indent} firstChild={i === 0}
                    count={count} renderBetween={renderBetween} />)}
            </div>}
        </div>
        {between}
    </>;
});
