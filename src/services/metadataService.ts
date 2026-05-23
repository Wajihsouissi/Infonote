export interface LinkMetadata {
    url: string;
    title: string;
    description: string;
    favicon: string;
    image: string;
    provider: string;
    embedUrl?: string;
    isEmbeddable: boolean;
    error?: boolean;
}

// In-memory cache for speed
const memoryCache = new Map<string, LinkMetadata>();

// Retrieve from localStorage cache on load
const loadCacheFromStorage = (): Record<string, LinkMetadata> => {
    try {
        const stored = localStorage.getItem('chnk_metadata_cache');
        return stored ? JSON.parse(stored) : {};
    } catch (e) {
        console.error('Failed to load metadata cache from storage', e);
        return {};
    }
};

const saveCacheToStorage = (cache: Record<string, LinkMetadata>) => {
    try {
        localStorage.setItem('chnk_metadata_cache', JSON.stringify(cache));
    } catch (e) {
        console.error('Failed to save metadata cache to storage', e);
    }
};

// Initialize memory cache from localStorage
const initialCache = loadCacheFromStorage();
Object.entries(initialCache).forEach(([url, data]) => {
    memoryCache.set(url, data);
});

/**
 * Clean and normalize URLs to ensure consistent caching and fetching
 */
export function normalizeUrl(url: string): string {
    let clean = url.trim();
    if (!/^https?:\/\//i.test(clean)) {
        clean = 'https://' + clean;
    }
    try {
        const parsed = new URL(clean);
        return parsed.toString();
    } catch (e) {
        return clean;
    }
}

/**
 * Extract clean domain name for display (e.g. figma.com)
 */
export function getDomain(url: string): string {
    try {
        const parsed = new URL(normalizeUrl(url));
        return parsed.hostname.replace('www.', '');
    } catch (e) {
        return 'website';
    }
}

/**
 * Truncate/shorten URL for elegant visual display (e.g. youtube.com/watch?v=dQw...)
 */
export function getShortUrl(url: string, maxLength = 35): string {
    try {
        const parsed = new URL(normalizeUrl(url));
        let short = parsed.hostname.replace('www.', '') + parsed.pathname + parsed.search;
        if (short.endsWith('/')) {
            short = short.slice(0, -1);
        }
        // Remove https:// or http:// if they are somehow present in the short string
        short = short.replace(/^https?:\/\//i, '');
        if (short.length > maxLength) {
            return short.slice(0, maxLength) + '...';
        }
        return short;
    } catch (e) {
        let clean = url.replace(/^https?:\/\/(?:www\.)?/i, '');
        if (clean.length > maxLength) {
            return clean.slice(0, maxLength) + '...';
        }
        return clean;
    }
}

/**
 * Detect provider and resolve embed options
 */
export function detectProvider(urlStr: string): { 
    provider: string; 
    isEmbeddable: boolean; 
    embedUrl?: string 
} {
    const url = normalizeUrl(urlStr);
    
    // 1. YouTube
    const ytRegex = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
    const ytMatch = url.match(ytRegex);
    if (ytMatch) {
        const videoId = ytMatch[1];
        return {
            provider: 'youtube',
            isEmbeddable: true,
            embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=0`
        };
    }

    // 2. Figma
    const figmaRegex = /^(?:https?:\/\/)?(?:www\.)?figma\.com\/(?:file|design|proto)\/([a-zA-Z0-9]+)/i;
    if (figmaRegex.test(url)) {
        return {
            provider: 'figma',
            isEmbeddable: true,
            embedUrl: `https://www.figma.com/embed?embed_host=chnk it&url=${encodeURIComponent(url)}`
        };
    }

    // 3. Spotify
    const spotifyRegex = /^(?:https?:\/\/)?(?:open\.)?spotify\.com\/(track|album|playlist|artist)\/([a-zA-Z0-9]+)/i;
    const spotifyMatch = url.match(spotifyRegex);
    if (spotifyMatch) {
        const type = spotifyMatch[1];
        const id = spotifyMatch[2];
        return {
            provider: 'spotify',
            isEmbeddable: true,
            embedUrl: `https://open.spotify.com/embed/${type}/${id}`
        };
    }

    // 4. Loom
    const loomRegex = /^(?:https?:\/\/)?(?:www\.)?loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/i;
    const loomMatch = url.match(loomRegex);
    if (loomMatch) {
        const videoId = loomMatch[1];
        return {
            provider: 'loom',
            isEmbeddable: true,
            embedUrl: `https://www.loom.com/embed/${videoId}`
        };
    }

    // 5. GitHub Gist
    const gistRegex = /^(?:https?:\/\/)?gist\.github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9]+)/i;
    if (gistRegex.test(url)) {
        return {
            provider: 'github-gist',
            isEmbeddable: true,
            // To embed gists inside an iframe without complex script execution, 
            // we can render a gist viewer or use an embeddable raw iframe or custom library.
            // Using a simple HTML document data URI with the Gist script embedded is a highly reliable way!
            embedUrl: `data:text/html;charset=utf-8,${encodeURIComponent(`
                <!DOCTYPE html>
                <html>
                <head>
                    <base target="_blank">
                    <style>
                        body { margin: 0; background: transparent; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
                        .gist .gist-file { margin-bottom: 0 !important; border: 1px solid #30363d !important; border-radius: 6px !important; }
                        .gist .gist-data { background-color: #0d1117 !important; border-bottom: 1px solid #30363d !important; }
                        .gist .gist-meta { background-color: #161b22 !important; color: #8b949e !important; }
                        .gist .pl-s .pl-pds, .gist .pl-s { color: #a5d6ff !important; }
                    </style>
                </head>
                <body>
                    <script src="${url}.js"></script>
                </body>
                </html>
            `)}`
        };
    }

    // 6. PDF URLs
    const pdfRegex = /\.pdf(?:\?|$)/i;
    if (pdfRegex.test(url)) {
        return {
            provider: 'pdf',
            isEmbeddable: true,
            embedUrl: url
        };
    }

    // 7. Google Maps
    const mapsRegex = /google\.com\/maps|maps\.app\.goo\.gl/i;
    if (mapsRegex.test(url)) {
        // Resolve embed URL for Google Maps
        // Usually, maps share URLs are not directly embeddable, but we can detect coordinates or fallback to a standard embed template
        // Or if it contains 'embed', we use it as-is.
        let embed = `https://maps.google.com/maps?q=${encodeURIComponent(url)}&output=embed`;
        if (url.includes('embed')) {
            embed = url;
        }
        return {
            provider: 'map',
            isEmbeddable: true,
            embedUrl: embed
        };
    }

    // 8. Twitter / X
    const twitterRegex = /^(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\/([0-9]+)/i;
    const twitterMatch = url.match(twitterRegex);
    if (twitterMatch) {
        const tweetId = twitterMatch[2];
        return {
            provider: 'twitter',
            isEmbeddable: true,
            // Twitter requires standard widget. We can embed via a sandbox iframe using the official publish widget html
            embedUrl: `data:text/html;charset=utf-8,${encodeURIComponent(`
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { 
                            margin: 0; 
                            display: flex; 
                            justify-content: center; 
                            background: transparent;
                            color-scheme: dark light;
                        }
                    </style>
                </head>
                <body>
                    <div id="tweet"></div>
                    <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
                    <script>
                        window.onload = function() {
                            twttr.widgets.createTweet('${tweetId}', document.getElementById('tweet'), {
                                theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
                                align: 'center',
                                dnt: true
                            });
                        }
                    </script>
                </body>
                </html>
            `)}`
        };
    }

    return {
        provider: 'generic',
        isEmbeddable: false
    };
}

/**
 * Generate a robust client-side fallback metadata object if fetch fails
 */
function createFallbackMetadata(urlStr: string): LinkMetadata {
    const url = normalizeUrl(urlStr);
    const domain = getDomain(url);
    const { provider, isEmbeddable, embedUrl } = detectProvider(url);
    
    // Capitalize domain name for a clean title
    let title = domain.split('.')[0];
    title = title.charAt(0).toUpperCase() + title.slice(1);
    if (provider !== 'generic') {
        title = `${title} (${provider.charAt(0).toUpperCase() + provider.slice(1)})`;
    }

    // Elegant illustrations / colors based on domain name
    const colors = [
        'from-blue-600 to-indigo-900',
        'from-purple-600 to-pink-900',
        'from-emerald-600 to-teal-900',
        'from-orange-600 to-amber-900',
        'from-rose-600 to-red-900',
        'from-cyan-600 to-blue-900'
    ];
    // Hash function to choose background color deterministically
    let hash = 0;
    for (let i = 0; i < domain.length; i++) {
        hash = domain.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colorIndex = Math.abs(hash) % colors.length;
    
    // Generate beautiful abstract placeholder image via CSS gradient inside data URI
    const svgPlaceholder = `
        <svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
            <defs>
                <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="${colors[colorIndex].split(' ')[0].replace('from-', '#').replace('-600', '')}"/>
                    <stop offset="100%" stop-color="${colors[colorIndex].split(' ')[1].replace('to-', '#').replace('-900', '')}"/>
                </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#g)"/>
            <text x="50%" y="50%" font-family="system-ui, sans-serif" font-size="48" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle" opacity="0.8">
                ${title}
            </text>
        </svg>
    `;
    const imageUri = `data:image/svg+xml;utf8,${encodeURIComponent(svgPlaceholder)}`;

    // High resolution fallback favicon from Google's favicon API
    const faviconUri = `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;

    return {
        url,
        title,
        description: `Explore content from ${domain}. A seamless spatial experience on Chnk it Canvas.`,
        favicon: faviconUri,
        image: imageUri,
        provider,
        embedUrl,
        isEmbeddable
    };
}

/**
 * Fetch Open Graph metadata with caching, retries, and high-fidelity fallback
 */
export async function fetchMetadata(urlStr: string, retries = 2): Promise<LinkMetadata> {
    const url = normalizeUrl(urlStr);
    
    // Check cache first
    if (memoryCache.has(url)) {
        return memoryCache.get(url)!;
    }

    const { provider, isEmbeddable, embedUrl } = detectProvider(url);
    const fallback = createFallbackMetadata(url);

    // Direct YouTube oEmbed Fetch (highly robust, CORS-friendly, zero rate limits)
    if (provider === 'youtube') {
        try {
            const ytResponse = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
            if (ytResponse.ok) {
                const ytJson = await ytResponse.json();
                if (ytJson && ytJson.title) {
                    const result: LinkMetadata = {
                        url,
                        title: ytJson.title,
                        description: ytJson.author_name ? `Video by ${ytJson.author_name} on YouTube` : 'YouTube video player',
                        favicon: `https://www.google.com/s2/favicons?sz=128&domain=youtube.com`,
                        image: ytJson.thumbnail_url || fallback.image,
                        provider: 'youtube',
                        embedUrl,
                        isEmbeddable: true
                    };

                    memoryCache.set(url, result);
                    const currentStorage = loadCacheFromStorage();
                    currentStorage[url] = result;
                    saveCacheToStorage(currentStorage);

                    return result;
                }
            }
        } catch (e) {
            console.warn('Failed direct youtube oembed fetch, falling back to microlink:', e);
        }
    }

    // Fetch asynchronously with retry mechanism
    let attempt = 0;
    while (attempt <= retries) {
        try {
            // Using microlink.io's public API to fetch Open Graph metadata. 
            // It has a reliable free tier and returns clean JSON metadata without CORS issues.
            const response = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch metadata, status: ${response.status}`);
            }

            const json = await response.json();
            
            if (json.status === 'success' && json.data) {
                const data = json.data;
                const result: LinkMetadata = {
                    url,
                    title: data.title || fallback.title,
                    description: data.description || fallback.description,
                    favicon: data.logo?.url || data.favicon || fallback.favicon,
                    image: data.image?.url || fallback.image,
                    provider,
                    embedUrl,
                    isEmbeddable
                };

                // Add to cache
                memoryCache.set(url, result);
                const currentStorage = loadCacheFromStorage();
                currentStorage[url] = result;
                saveCacheToStorage(currentStorage);

                return result;
            } else {
                throw new Error('Microlink api returned unsuccessful response');
            }
        } catch (error) {
            console.warn(`Attempt ${attempt + 1} to fetch metadata for ${url} failed:`, error);
            attempt++;
            if (attempt > retries) break;
            // Linear backoff before retry
            await new Promise(resolve => setTimeout(resolve, attempt * 500));
        }
    }

    // If fetch failed completely, return the fallback metadata but store it in memory only 
    // to allow retries in future sessions, or cache it with an 'error' flag so we don't spam requests in this session.
    const errorResult = { ...fallback, error: true };
    memoryCache.set(url, errorResult);
    
    return errorResult;
}
