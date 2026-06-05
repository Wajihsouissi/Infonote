# Infonote Canvas Stress Test Report

Date: 2026-06-06  
Workspace: `C:\Users\niyaz\Desktop\Infonote-main`  
Command:

```bash
npm run stress:canvas -- --nodes 10000 --blocks 12 --edges 9999
```

## Scenario

This test generates a large real canvas payload shaped like Infonote production data:

- 10,000 canvas nodes
- 9,999 canvas edges
- 12 nested content blocks per node
- 120,000 total nested blocks
- Real serialized `canvas_nodes` and `canvas_edges` row structures
- Real note metadata such as labels, tags, status, priority, dimensions, coordinates, timestamps, and edge styling

The test does not use fake dashboard metrics or placeholder counters. It builds the actual row payload that can be upserted to Supabase with the same table shape used by cloud sync.

## Local Serialization Results

| Metric | Result |
| --- | ---: |
| Nodes | 10,000 |
| Edges | 9,999 |
| Blocks per node | 12 |
| Total blocks | 120,000 |
| JSON payload size | 23.20 MB |
| Payload generation time | 77.4 ms |
| JSON serialization time | 105.3 ms |
| JSON parse time | 82.9 ms |
| Heap delta | 100.88 MB |
| Node batches at 500 rows | 20 |
| Edge batches at 500 rows | 20 |

## Interpretation

The local data-generation and serialization layer can construct and parse a 10,000-node / 120,000-block canvas payload quickly on this machine. The payload size is large enough to be meaningful for production testing: 23.20 MB of structured JSON before network transport or database writes.

The result validates the local stress harness and serialization shape. It does not by itself prove Supabase write throughput or frontend rendering FPS under load, because this run skipped database writes and browser interaction.

## Real Supabase Write Test

To run the same test against the real Supabase backend, set a real test account and use `--write`:

```powershell
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_ANON_KEY="your-anon-or-publishable-key"
$env:STRESS_EMAIL="stress-test-user@example.com"
$env:STRESS_PASSWORD="your-test-password"
npm run stress:canvas -- --nodes 10000 --blocks 12 --edges 9999 --write --cleanup
```

`--cleanup` removes previous `stress-*` rows before and after verification. Remove `--cleanup` if you want to keep the rows in Supabase and load them in the app.

## AI Provider Check

The codebase no longer references Puter in `src` or `scripts`. Text generation and image generation now use the Vercel AI Gateway path from `src/services/aiService.ts`, so the app should not show a Puter login popup for AI text generation.

Required environment variable:

```bash
VITE_AI_GATEWAY_API_KEY=your-vercel-ai-gateway-key
```

Optional model overrides:

```bash
VITE_AI_GATEWAY_TEXT_MODEL=openai/gpt-4o-mini
VITE_AI_GATEWAY_IMAGE_MODEL=bfl/flux-2-pro
```

## Build Verification

`npm run build` passes locally after the TypeScript fixes for:

- `src/features/card/ConvertCardModal.tsx`
- `src/features/card/IconPicker.tsx`

The Vercel build failure `Command "npm run build" exited with 2` was reproduced locally and fixed.
