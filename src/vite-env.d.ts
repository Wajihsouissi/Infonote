/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    readonly VITE_AI_GATEWAY_API_KEY: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

declare const puter: {
    ai: {
        chat(
            prompt: string,
            options?: { model?: string; stream?: boolean }
        ): Promise<
            | AsyncIterable<{
                  text?: string;
                  delta?: { content?: string };
                  choices?: Array<{ delta?: { content?: string } }>;
              }>
            | { message?: { content?: string }; toString?(): string }
            | string
        >;
        txt2img(prompt: string): Promise<HTMLImageElement>;
    };
};
