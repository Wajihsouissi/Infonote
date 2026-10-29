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
