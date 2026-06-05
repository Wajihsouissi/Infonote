#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { performance } from 'node:perf_hooks';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  const key = arg.slice(2);
  const next = process.argv[i + 1];
  if (!next || next.startsWith('--')) {
    args.set(key, true);
  } else {
    args.set(key, next);
    i += 1;
  }
}

const nodeCount = readIntArg('nodes', 10000);
const blocksPerNode = readIntArg('blocks', 12);
const edgeCount = readIntArg('edges', Math.max(0, nodeCount - 1));
const batchSize = readIntArg('batch', 500);
const shouldWrite = Boolean(args.get('write'));
const shouldCleanup = Boolean(args.get('cleanup'));

function readIntArg(name, fallback) {
  const raw = args.get(name);
  if (raw === undefined || raw === true) return fallback;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }
  return parsed;
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function buildBlock(nodeIndex, blockIndex) {
  const id = `stress-block-${nodeIndex}-${blockIndex}`;
  const variants = [
    {
      id,
      type: 'heading2',
      content: `Stress note ${nodeIndex} section ${blockIndex}`,
    },
    {
      id,
      type: 'text',
      content: `This is a production stress-test paragraph for note ${nodeIndex}. It preserves real block ordering, ids, and text content for serialization checks.`,
    },
    {
      id,
      type: 'bullet',
      content: `Load-bearing bullet ${blockIndex} for note ${nodeIndex}`,
      indent: blockIndex % 3,
    },
    {
      id,
      type: 'todo',
      content: `Validate canvas behavior for note ${nodeIndex}`,
      metadata: { checked: blockIndex % 5 === 0 },
    },
    {
      id,
      type: 'callout',
      content: `Important nested state for note ${nodeIndex}`,
      metadata: { tone: blockIndex % 2 === 0 ? 'info' : 'warning' },
    },
  ];
  return variants[blockIndex % variants.length];
}

function createRows(userId, workspaceId) {
  const nodes = [];
  const cols = Math.ceil(Math.sqrt(nodeCount));
  const now = new Date().toISOString();

  for (let i = 0; i < nodeCount; i += 1) {
    const x = (i % cols) * 460;
    const y = Math.floor(i / cols) * 460;
    const width = i % 7 === 0 ? 800 : 432;
    const height = i % 7 === 0 ? 600 : 432;
    const content = Array.from({ length: blocksPerNode }, (_, blockIndex) =>
      buildBlock(i, blockIndex)
    );

    nodes.push({
      id: `stress-node-${i}`,
      user_id: userId,
      workspace_id: workspaceId,
      parent_id: null,
      type: i % 23 === 0 ? 'fused-note' : 'note',
      x_pos: x,
      y_pos: y,
      width,
      height,
      data_json: {
        data: {
          label: `Stress Note ${i}`,
          content,
          viewMode: i % 5 === 0 ? 'medium' : 'expanded',
          icon: i % 2 === 0 ? 'FileText' : 'Sparkles',
          description: `Synthetic but structurally real stress note ${i}`,
          tags: [`load-${i % 10}`, `batch-${Math.floor(i / 1000)}`],
          status: ['todo', 'in-progress', 'review', 'done'][i % 4],
          priority: ['low', 'medium', 'high', 'urgent'][i % 4],
          createdAt: now,
          updatedAt: now,
        },
        style: {},
        zIndex: i,
      },
    });
  }

  const edges = [];
  const maxEdges = Math.min(edgeCount, Math.max(0, nodeCount - 1));
  for (let i = 0; i < maxEdges; i += 1) {
    edges.push({
      id: `stress-edge-${i}`,
      user_id: userId,
      workspace_id: workspaceId,
      source_id: `stress-node-${i}`,
      target_id: `stress-node-${(i + 1) % nodeCount}`,
      data_json: {
        data: { parentId: null, weight: i % 10 },
        type: 'centered',
        animated: i % 20 === 0,
        sourceHandle: null,
        targetHandle: null,
        style: { strokeWidth: 1 + (i % 4) },
      },
    });
  }

  return { nodes, edges };
}

async function getSupabaseSession() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.STRESS_EMAIL;
  const password = process.env.STRESS_PASSWORD;

  if (!url || !key || !email || !password) {
    throw new Error(
      'Supabase write mode requires SUPABASE_URL/VITE_SUPABASE_URL, SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY, STRESS_EMAIL, and STRESS_PASSWORD.'
    );
  }

  const supabase = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error || new Error('Failed to sign in stress-test user.');

  const workspaceId = await ensureWorkspace(supabase, data.user.id);
  return { supabase, userId: data.user.id, workspaceId };
}

async function ensureWorkspace(supabase, userId) {
  const { data: existing, error: readError } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (readError) throw readError;
  if (existing?.[0]?.id) return existing[0].id;

  const { data: created, error: createError } = await supabase
    .from('workspaces')
    .insert({ owner_id: userId, name: 'Stress Test Workspace' })
    .select('id')
    .single();
  if (createError) throw createError;
  return created.id;
}

async function upsertRows(supabase, table, rows) {
  const chunks = chunkArray(rows, batchSize);
  const start = performance.now();
  for (let i = 0; i < chunks.length; i += 1) {
    const { error } = await supabase
      .from(table)
      .upsert(chunks[i], { onConflict: 'user_id,workspace_id,id', ignoreDuplicates: false });
    if (error) throw error;
    process.stdout.write(`\r${table}: ${i + 1}/${chunks.length} batches`);
  }
  process.stdout.write('\n');
  return performance.now() - start;
}

async function cleanupRows(supabase, userId, workspaceId) {
  for (const table of ['canvas_edges', 'canvas_nodes']) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .like('id', 'stress-%');
    if (error) throw error;
  }
}

async function main() {
  const memoryBefore = process.memoryUsage().heapUsed;
  const generatedAt = performance.now();
  const userId = shouldWrite ? 'pending-auth-user' : '00000000-0000-0000-0000-000000000000';
  const workspaceId = shouldWrite ? 'pending-workspace' : '00000000-0000-0000-0000-000000000001';
  let rows = createRows(userId, workspaceId);
  const generationMs = performance.now() - generatedAt;

  const serializeStart = performance.now();
  const serialized = JSON.stringify(rows);
  const serializeMs = performance.now() - serializeStart;

  const parseStart = performance.now();
  JSON.parse(serialized);
  const parseMs = performance.now() - parseStart;
  const memoryAfter = process.memoryUsage().heapUsed;

  console.log('Canvas stress payload');
  console.log(`nodes: ${rows.nodes.length}`);
  console.log(`edges: ${rows.edges.length}`);
  console.log(`blocks per node: ${blocksPerNode}`);
  console.log(`total blocks: ${rows.nodes.length * blocksPerNode}`);
  console.log(`json size: ${formatBytes(Buffer.byteLength(serialized))}`);
  console.log(`generation: ${generationMs.toFixed(1)} ms`);
  console.log(`serialize: ${serializeMs.toFixed(1)} ms`);
  console.log(`parse: ${parseMs.toFixed(1)} ms`);
  console.log(`heap delta: ${formatBytes(memoryAfter - memoryBefore)}`);
  console.log(`node batches at ${batchSize}: ${Math.ceil(rows.nodes.length / batchSize)}`);
  console.log(`edge batches at ${batchSize}: ${Math.ceil(rows.edges.length / batchSize)}`);

  if (!shouldWrite) {
    console.log('Supabase write skipped. Add --write with STRESS_EMAIL/STRESS_PASSWORD to test real DB upserts.');
    return;
  }

  const { supabase, userId: realUserId, workspaceId: realWorkspaceId } = await getSupabaseSession();
  rows = createRows(realUserId, realWorkspaceId);

  if (shouldCleanup) {
    await cleanupRows(supabase, realUserId, realWorkspaceId);
    console.log('Previous stress rows cleaned.');
  }

  const nodeWriteMs = await upsertRows(supabase, 'canvas_nodes', rows.nodes);
  const edgeWriteMs = await upsertRows(supabase, 'canvas_edges', rows.edges);
  console.log(`node upsert: ${nodeWriteMs.toFixed(1)} ms`);
  console.log(`edge upsert: ${edgeWriteMs.toFixed(1)} ms`);

  const [{ count: nodeDbCount, error: nodeCountError }, { count: edgeDbCount, error: edgeCountError }] =
    await Promise.all([
      supabase
        .from('canvas_nodes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', realUserId)
        .eq('workspace_id', realWorkspaceId)
        .like('id', 'stress-node-%'),
      supabase
        .from('canvas_edges')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', realUserId)
        .eq('workspace_id', realWorkspaceId)
        .like('id', 'stress-edge-%'),
    ]);
  if (nodeCountError) throw nodeCountError;
  if (edgeCountError) throw edgeCountError;

  console.log(`db stress nodes: ${nodeDbCount}`);
  console.log(`db stress edges: ${edgeDbCount}`);

  if (shouldCleanup) {
    await cleanupRows(supabase, realUserId, realWorkspaceId);
    console.log('Stress rows cleaned after verification.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
