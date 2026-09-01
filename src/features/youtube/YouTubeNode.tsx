import { memo, useCallback, useEffect, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Play, Video } from '../../components/icons';
import { useStore } from '../../store/useStore';
import type { YouTubeNode as YouTubeNodeModel } from '../../types';
import { fetchMetadata } from '../../services/metadataService';
import { samePropsIgnoringPosition } from '../canvas/nodeMemo';
import { createYouTubeStudyData, parseYouTubeUrl, youtubeThumbnail } from './youtubeStudy';
import styles from './YouTubeNode.module.css';

export const YouTubeNode = memo(function YouTubeNode({ id, data, selected }: NodeProps<YouTubeNodeModel>) {
    const updateNodeData = useStore((state) => state.updateNodeData);
    const setRightSidePanelId = useStore((state) => state.setRightSidePanelId);
    const [url, setUrl] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!data.video || data.video.title !== 'YouTube video') return;
        let cancelled = false;
        void fetchMetadata(data.video.url).then((metadata) => {
            if (cancelled) return;
            const channel = metadata.description?.match(/^Video by (.+?) on YouTube/i)?.[1] || 'YouTube';
            updateNodeData(id, {
                label: metadata.title || 'YouTube video',
                video: {
                    ...data.video!,
                    title: metadata.title || 'YouTube video',
                    channel,
                    thumbnailUrl: metadata.image || data.video!.thumbnailUrl,
                },
            });
        }).catch(() => undefined);
        return () => { cancelled = true; };
    }, [data.video, id, updateNodeData]);

    const attachVideo = useCallback(async () => {
        const parsed = parseYouTubeUrl(url);
        if (!parsed) {
            setError('Paste a valid YouTube watch, Short, embed, live, or youtu.be link.');
            return;
        }
        setError('');
        setLoading(true);
        const base = createYouTubeStudyData(parsed.canonicalUrl);
        updateNodeData(id, base);
        try {
            const metadata = await fetchMetadata(parsed.canonicalUrl);
            const channel = metadata.description?.match(/^Video by (.+?) on YouTube/i)?.[1] || 'YouTube';
            updateNodeData(id, {
                label: metadata.title || 'YouTube video',
                video: {
                    videoId: parsed.videoId,
                    url: parsed.canonicalUrl,
                    title: metadata.title || 'YouTube video',
                    channel,
                    thumbnailUrl: metadata.image || youtubeThumbnail(parsed.videoId),
                },
            });
        } catch {
            // The official thumbnail and canonical URL are already sufficient to study.
        } finally {
            setLoading(false);
        }
    }, [id, updateNodeData, url]);

    if (!data.video) {
        return (
            <article className={`${styles.node} ${selected ? styles.selected : ''}`}>
                <Handle id="in" type="target" position={Position.Left} className={styles.handle} />
                <div className={styles.emptyMark}><Video size={22} /></div>
                <p className={styles.eyebrow}>YouTube study</p>
                <h3>Add a video</h3>
                <p className={styles.help}>Paste a YouTube link to build notes around its transcript.</p>
                <div className="nodrag nowheel">
                    <input
                        className={styles.urlInput}
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') void attachVideo(); }}
                        placeholder="youtube.com/watch?v=…"
                        aria-label="YouTube URL"
                    />
                    {error && <p className={styles.error}>{error}</p>}
                    <button className={styles.attachButton} type="button" onClick={() => void attachVideo()} disabled={loading}>
                        {loading ? 'Checking…' : 'Attach video'}
                    </button>
                </div>
                <Handle id="out" type="source" position={Position.Right} className={styles.handle} />
            </article>
        );
    }

    const statusLabel = data.transcript.status === 'ready'
        ? `${data.transcript.segments.length} transcript lines`
        : data.transcript.status === 'queued'
            ? 'Transcript queued'
            : data.transcript.status === 'error'
                ? 'Transcript needs attention'
                : 'Transcript available in Study';

    return (
        <article className={`${styles.node} ${styles.ready} ${selected ? styles.selected : ''}`}>
            <Handle id="in" type="target" position={Position.Left} className={styles.handle} />
            <div className={styles.thumbnail}>
                <img src={data.video.thumbnailUrl} alt="" draggable={false} />
                <button
                    className={`${styles.studyButton} nodrag`}
                    type="button"
                    onClick={() => setRightSidePanelId(id)}
                    aria-label={`Study ${data.video.title}`}
                >
                    <Play size={20} fill="currentColor" />
                    <span>Study</span>
                </button>
            </div>
            <div className={styles.details}>
                <p className={styles.eyebrow}>{data.video.channel}</p>
                <h3 title={data.video.title}>{data.video.title}</h3>
                <p className={styles.status}>{statusLabel}</p>
            </div>
            <Handle id="out" type="source" position={Position.Right} className={styles.handle} />
        </article>
    );
}, samePropsIgnoringPosition);
