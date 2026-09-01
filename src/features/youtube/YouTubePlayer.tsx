import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import styles from './YouTubePlayer.module.css';

type PlayerState = -1 | 0 | 1 | 2 | 3 | 5;

type YTPlayer = {
    destroy: () => void;
    getCurrentTime: () => number;
    getPlayerState: () => PlayerState;
    pauseVideo: () => void;
    playVideo: () => void;
    seekTo: (seconds: number, allowSeekAhead: boolean) => void;
};

type YTConstructor = new (element: HTMLElement, options: Record<string, unknown>) => YTPlayer;

declare global {
    interface Window {
        YT?: { Player: YTConstructor; PlayerState?: { PLAYING: 1 } };
        onYouTubeIframeAPIReady?: () => void;
    }
}

let iframeApiPromise: Promise<void> | null = null;

function loadIframeApi(): Promise<void> {
    if (window.YT?.Player) return Promise.resolve();
    if (iframeApiPromise) return iframeApiPromise;
    iframeApiPromise = new Promise<void>((resolve, reject) => {
        const previous = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            previous?.();
            resolve();
        };
        if (!document.querySelector('script[data-chnkit-youtube-player]')) {
            const script = document.createElement('script');
            script.src = 'https://www.youtube.com/iframe_api';
            script.async = true;
            script.dataset.chnkitYoutubePlayer = 'true';
            script.onerror = () => reject(new Error('The YouTube player could not be loaded.'));
            document.head.appendChild(script);
        }
    });
    return iframeApiPromise;
}

export type YouTubePlayerHandle = {
    seekTo: (milliseconds: number, play?: boolean) => void;
    playRange: (startMs: number, endMs: number) => void;
    getCurrentTime: () => number;
};

type Props = {
    videoId: string;
    onTimeChange?: (milliseconds: number) => void;
    onUnavailable?: (message: string | null) => void;
};

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, Props>(function YouTubePlayer(
    { videoId, onTimeChange, onUnavailable },
    ref,
) {
    const hostRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<YTPlayer | null>(null);
    const pollRef = useRef<number | null>(null);
    const rangeEndRef = useRef<number | null>(null);
    const [loading, setLoading] = useState(true);

    const stopPolling = () => {
        if (pollRef.current != null) window.clearInterval(pollRef.current);
        pollRef.current = null;
    };

    const startPolling = () => {
        stopPolling();
        pollRef.current = window.setInterval(() => {
            const player = playerRef.current;
            if (!player) return;
            const currentMs = player.getCurrentTime() * 1000;
            onTimeChange?.(currentMs);
            if (rangeEndRef.current != null && currentMs >= rangeEndRef.current) {
                player.pauseVideo();
                rangeEndRef.current = null;
            }
        }, 250);
    };

    useImperativeHandle(ref, () => ({
        seekTo(milliseconds, play = false) {
            playerRef.current?.seekTo(Math.max(0, milliseconds) / 1000, true);
            onTimeChange?.(Math.max(0, milliseconds));
            if (play) playerRef.current?.playVideo();
        },
        playRange(startMs, endMs) {
            rangeEndRef.current = Math.max(startMs + 1000, endMs);
            playerRef.current?.seekTo(Math.max(0, startMs) / 1000, true);
            playerRef.current?.playVideo();
        },
        getCurrentTime() {
            return (playerRef.current?.getCurrentTime() || 0) * 1000;
        },
    }), [onTimeChange]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        onUnavailable?.(navigator.onLine ? null : 'YouTube playback is unavailable while offline.');
        if (!navigator.onLine) return;

        loadIframeApi().then(() => {
            if (cancelled || !hostRef.current || !window.YT?.Player) return;
            playerRef.current = new window.YT.Player(hostRef.current, {
                host: 'https://www.youtube-nocookie.com',
                videoId,
                width: '100%',
                height: '100%',
                playerVars: { autoplay: 0, rel: 0, playsinline: 1, origin: window.location.origin },
                events: {
                    onReady: () => {
                        setLoading(false);
                        onUnavailable?.(null);
                    },
                    onStateChange: (event: { data: PlayerState }) => {
                        if (event.data === 1) startPolling();
                        else stopPolling();
                    },
                    onError: () => {
                        setLoading(false);
                        onUnavailable?.('This video is private, unavailable, or has embedding disabled.');
                    },
                },
            });
        }).catch((error) => {
            if (!cancelled) {
                setLoading(false);
                onUnavailable?.(error instanceof Error ? error.message : 'The YouTube player could not be loaded.');
            }
        });

        return () => {
            cancelled = true;
            stopPolling();
            playerRef.current?.destroy();
            playerRef.current = null;
        };
    // callbacks intentionally remain live through refs owned by the enclosing studio
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoId]);

    return (
        <div className={styles.frame}>
            {loading && <div className={styles.loading}>Loading YouTube player…</div>}
            <div ref={hostRef} className={styles.player} aria-label="YouTube video player" />
        </div>
    );
});
