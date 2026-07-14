// Raw importer: pulls /players/teams, /transfers, /trophies for every player that
// has an API-Football id (players.external_ref) into football.player_team_seasons /
// player_transfers / player_trophies. Idempotent + resumable via
// football._apifootball_import_progress. LOCAL ONLY. No derivation ("treatment later").
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('C:/Users/Admin/OneDrive/Desktop/Football-B/link-up/node_modules/.pnpm/pg@8.22.0/node_modules/pg/lib/index.js');

import { API_FOOTBALL_KEY as KEY } from './_env.mjs';
import { archiveRawUrl } from './_raw-archive.mjs';
const BASE = 'https://v3.football.api-sports.io';
const MIN_GAP_MS = 180;          // ~5.5 req/s
const DAILY_SAFETY = 74000;      // stop before the 75k/day cap
const ENDPOINTS = ['teams', 'transfers', 'trophies'];

const c = new Client({ connectionString: 'postgresql://football:football@localhost:5432/football_poker' });
await c.connect();

let lastCall = 0;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let dayUsed = 0;

async function api(path) {
  for (let attempt = 0; ; attempt++) {
    const wait = MIN_GAP_MS - (Date.now() - lastCall);
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    try {
      const res = await fetch(`${BASE}${path}`, { headers: { 'x-apisports-key': KEY } });
      const used = Number(res.headers.get('x-ratelimit-requests-remaining'));
      const limitDay = Number(res.headers.get('x-ratelimit-requests-limit'));
      if (limitDay && Number.isFinite(used)) dayUsed = limitDay - used;
      if (res.status === 429) { await sleep(61000); continue; }
      if (res.status >= 500) { if (attempt < 5) { await sleep(2000 * (attempt + 1)); continue; } throw new Error('5xx'); }
      // Persist the raw response BEFORE parsing (full payload, nothing discarded).
      const rawText = await res.text();
      archiveRawUrl(path, rawText, res.status);
      const j = JSON.parse(rawText);
      if (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors || {}).length) {
        const msg = JSON.stringify(j.errors);
        if (/rate|limit/i.test(msg)) { await sleep(61000); continue; }
        throw new Error('api-errors ' + msg);
      }
      return j.response || [];
    } catch (e) {
      if (attempt < 5) { await sleep(2000 * (attempt + 1)); continue; }
      throw e;
    }
  }
}

const players = (await c.query(
  `select id, external_ref from football.players where external_ref is not null order by external_ref`)).rows;

const doneRows = (await c.query(
  `select api_player_id, endpoint from football._apifootball_import_progress where status='ok'`)).rows;
const done = new Set(doneRows.map(r => `${r.api_player_id}:${r.endpoint}`));

console.log(`[start] ${players.length} players, ${done.size} (player,endpoint) already done. ${new Date().toISOString()}`);

let processed = 0, inserted = { teams: 0, transfers: 0, trophies: 0 }, errors = 0;

async function markProgress(pid, ep, rows) {
  await c.query(
    `insert into football._apifootball_import_progress(api_player_id, endpoint, rows, status)
     values ($1,$2,$3,'ok')
     on conflict (api_player_id, endpoint) do update set rows=excluded.rows, status='ok', done_at=now()`,
    [pid, ep, rows]);
}

for (const p of players) {
  const pid = p.external_ref, uid = p.id;
  for (const ep of ENDPOINTS) {
    if (done.has(`${pid}:${ep}`)) continue;
    if (dayUsed >= DAILY_SAFETY) { console.log(`[stop] near daily cap (${dayUsed}). Re-run to resume.`); await c.end(); process.exit(0); }
    try {
      let rows = 0;
      if (ep === 'teams') {
        const resp = await api(`/players/teams?player=${pid}`);
        for (const t of resp) {
          if (t.team?.id == null || t.team.id === '') continue;
          for (const s of (t.seasons || [])) {
            if (s === '' || s == null || !Number.isFinite(Number(s))) continue;
            await c.query(
              `insert into football.player_team_seasons(player_id, api_player_id, team_id, team_name, season)
               values ($1,$2,$3,$4,$5) on conflict (player_id, team_id, season) do nothing`,
              [uid, pid, t.team.id, t.team?.name, Number(s)]);
            rows++;
          }
        }
        inserted.teams += rows;
      } else if (ep === 'transfers') {
        const resp = await api(`/transfers?player=${pid}`);
        for (const blk of resp) for (const tr of (blk.transfers || [])) {
          await c.query(
            `insert into football.player_transfers(player_id, api_player_id, transfer_date, type, team_in_id, team_in_name, team_out_id, team_out_name)
             values ($1,$2,$3,$4,$5,$6,$7,$8)
             on conflict (player_id, transfer_date, team_in_id, team_out_id) do nothing`,
            [uid, pid, tr.date || null, tr.type || null, tr.teams?.in?.id || null, tr.teams?.in?.name || null, tr.teams?.out?.id || null, tr.teams?.out?.name || null]);
          rows++;
        }
        inserted.transfers += rows;
      } else if (ep === 'trophies') {
        const resp = await api(`/trophies?player=${pid}`);
        for (const tr of resp) {
          await c.query(
            `insert into football.player_trophies(player_id, api_player_id, league, country, season, place)
             values ($1,$2,$3,$4,$5,$6)
             on conflict (player_id, league, country, season, place) do nothing`,
            [uid, pid, tr.league || null, tr.country || null, String(tr.season ?? ''), tr.place || null]);
          rows++;
        }
        inserted.trophies += rows;
      }
      await markProgress(pid, ep, rows);
    } catch (e) {
      errors++;
      console.log(`[err] player ${pid} ${ep}: ${e.message}`);
    }
  }
  processed++;
  if (processed % 100 === 0) {
    console.log(`[progress] ${processed}/${players.length} players | inserted teams=${inserted.teams} transfers=${inserted.transfers} trophies=${inserted.trophies} | errors=${errors} | dayUsed~${dayUsed} | ${new Date().toISOString()}`);
  }
}

console.log(`[done] processed=${processed} | inserted=${JSON.stringify(inserted)} | errors=${errors} | ${new Date().toISOString()}`);
await c.end();
