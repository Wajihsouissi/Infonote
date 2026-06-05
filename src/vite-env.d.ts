/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    readonly VITE_AI_GATEWAY_API_KEY: string;
    readonly VITE_AI_GATEWAY_TEXT_MODEL?: string;
    readonly VITE_AI_GATEWAY_IMAGE_MODEL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
