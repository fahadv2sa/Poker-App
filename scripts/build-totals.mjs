// Builds per-player TOTAL tables for cross-game reuse. LOCAL only.
// Zero-error design (faithful aggregation of everything the source has):
//   - The API returns league_id=NULL for pre-2010 seasons. Those rows are LEGITIMATE
//     and complementary (not duplicates). We RESOLVE each null-id row's true
//     competition via (team_id, league_name)->league_id learned from the clean rows,
//     falling back to unique catalog names, team-country, and /teams for the tail.
//   - id-bearing + resolved null-id rows are UNIONed and de-duplicated on
//     (player, season, league_id, team) preferring the id-bearing row (kills the 66 overlaps).
//   - Titles from player_trophies (place='Winner'); blank-season rows are pure API
//     duplicates of dated rows -> excluded (proven: every blank has a dated twin).
// Rerunnable (drops+rebuilds derived tables). No source data mutated.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('C:/Users/Admin/OneDrive/Desktop/Football-B/link-up/node_modules/.pnpm/pg@8.22.0/node_modules/pg/lib/index.js');
import { API_FOOTBALL_KEY as KEY } from './_env.mjs';
import { archiveRawUrl } from './_raw-archive.mjs';
const c = new Client({ connectionString: 'postgresql://football:football@localhost:5432/football_poker' });
await c.connect();
const q = async (s,p)=>(await c.query(s,p)).rows;
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

// ---------- classification rules ----------
const TARGET = { 140:'LEAGUE_ES', 135:'LEAGUE_IT', 39:'LEAGUE_EN', 61:'LEAGUE_FR', 78:'LEAGUE_DE', 2:'UCL' };
const isYouth = (n)=>/\bU-?(1[0-9]|2[0-3])\b|Olympic|Youth|Maurice Revello|Toulon|Premier League 2|Sudamericano U|Pre-Olympic/i.test(n||'');
const isClubWorldCup = (n)=>/Club World Cup/i.test(n||'');
const natRe = /World Cup|Nations League|Euro Championship|European Championship|Copa America|Africa Cup of Nations|African Nations Championship|Asian Cup|Gold Cup|Confederations|Finalissima|Arab Cup|COSAFA|CECAFA|Kirin/i;
function targetByName(name, country){
  const nm=(name||'').trim(), co=(country||'').trim();
  if(/^UEFA Champions League$/i.test(nm)) return 'UCL';
  if(/^La Liga$/i.test(nm)&&co==='Spain') return 'LEAGUE_ES';
  if(/^Serie A$/i.test(nm)&&co==='Italy') return 'LEAGUE_IT';
  if(/^Premier League$/i.test(nm)&&co==='England') return 'LEAGUE_EN';
  if(/^Ligue 1$/i.test(nm)&&co==='France') return 'LEAGUE_FR';
  if(/^Bundesliga$/i.test(nm)&&co==='Germany') return 'LEAGUE_DE';
  return null;
}
function classify(name, country, type, leagueId){
  if(leagueId!=null && TARGET[leagueId]) return {category:TARGET[leagueId], is_national:false, is_youth:false};
  const tn=targetByName(name,country); if(tn) return {category:tn, is_national:false, is_youth:false};
  const nm=name||'';
  const youth=isYouth(nm);
  const national=!isClubWorldCup(nm) && (natRe.test(nm) || (/^Friendlies$/i.test(nm) && (country==='World'||!country)));
  if(national&&youth) return {category:'NATIONAL_YOUTH', is_national:true, is_youth:true};
  if(national)        return {category:'NATIONAL_SENIOR', is_national:true, is_youth:false};
  if(youth)           return {category:'YOUTH', is_national:false, is_youth:true};
  if(type==='Cup')    return {category:'CLUB_CUP', is_national:false, is_youth:false};
  return {category:'OTHER_LEAGUE', is_national:false, is_youth:false};
}

// ---------- league catalog ----------
const res = await fetch('https://v3.football.api-sports.io/leagues', { headers:{'x-apisports-key':KEY} });
const catText = await res.text();
archiveRawUrl('/leagues', catText, res.status);
const cat = JSON.parse(catText).response;
const catById = new Map(cat.map(it=>[it.league.id,{name:it.league.name,country:it.country?.name||'',type:it.league.type}]));
const nameCount = new Map();               // league name -> #ids (uniqueness)
const idByName = new Map();                // unique name -> id
const idByNameCountry = new Map();         // name||country -> id
for(const it of cat){
  nameCount.set(it.league.name,(nameCount.get(it.league.name)||0)+1);
  idByName.set(it.league.name, it.league.id);
  idByNameCountry.set(`${it.league.name}||${it.country?.name||''}`, it.league.id);
}
console.log('league catalog:', cat.length);

// ---------- resolution maps from CLEAN (id-bearing) rows ----------
const m1 = new Map(); // (team||name) -> {id,rows}  modal league_id for a team's named comp
for(const r of await q(`select team_id, league_name, league_id, count(*)::int n
   from football.player_season_stats where league_id is not null and team_id is not null
   group by team_id, league_name, league_id`)){
  const k=`${r.team_id}||${r.league_name}`; const cur=m1.get(k);
  if(!cur||r.n>cur.rows) m1.set(k,{id:r.league_id,rows:r.n});
}
const teamCountry = new Map(); // team_id -> modal id-bearing country
for(const r of await q(`select team_id, league_country, count(*)::int n
   from football.player_season_stats where league_id is not null and team_id is not null and league_country<>''
   group by team_id, league_country`)){
  const cur=teamCountry.get(r.team_id);
  if(!cur||r.n>cur.n) teamCountry.set(r.team_id,{country:r.league_country,n:r.n});
}

// ---------- resolve distinct (team_id, league_name) among null-id rows ----------
const pairs = await q(`select distinct team_id, league_name from football.player_season_stats where league_id is null`);
const needTeam = new Set(); // team_ids lacking a country, to fetch via /teams
const resolveOne = (team_id, name, country)=>{
  if(team_id!=null){ const t=m1.get(`${team_id}||${name}`); if(t) return {id:t.id,method:'team_league'}; }
  if((nameCount.get(name)||0)===1) return {id:idByName.get(name),method:'unique_name'};
  const wc=idByNameCountry.get(`${name}||World`); if(wc && /World Cup|Nations League|Champions League|Europa|Conference|Super Cup|Friendlies|Copa America|Euro|Confederations|Finalissima/i.test(name)) return {id:wc,method:'world_name'};
  const co = country || teamCountry.get(team_id)?.country;
  if(co){ const id=idByNameCountry.get(`${name}||${co}`); if(id) return {id,method:'team_country'}; }
  return null;
};
// first pass
let firstPass = pairs.map(p=>({...p, r:resolveOne(p.team_id,p.league_name,null)}));
for(const p of firstPass){ if(!p.r && p.team_id!=null && !teamCountry.has(p.team_id)) needTeam.add(p.team_id); }
console.log('pairs:', pairs.length, '| unresolved needing /teams country:', needTeam.size);

// ---------- /teams for the tail ----------
let fetched=0;
for(const tid of needTeam){
  try{
    const rr=await fetch(`https://v3.football.api-sports.io/teams?id=${tid}`,{headers:{'x-apisports-key':KEY}});
    const rrText=await rr.text(); archiveRawUrl(`/teams?id=${tid}`, rrText, rr.status);
    const jj=JSON.parse(rrText); const co=jj.response?.[0]?.team?.country;
    if(co) teamCountry.set(tid,{country:co,n:1});
  }catch(e){}
  fetched++; if(fetched%50===0) console.log('  /teams fetched', fetched, '/', needTeam.size);
  await sleep(160);
}
console.log('/teams calls:', fetched);

// ---------- final resolution table ----------
await c.query(`drop table if exists football._nullid_resolution`);
await c.query(`create table football._nullid_resolution (team_id int, league_name text, resolved_league_id int, method text)`);
let resolved=0, unresolved=0;
for(const p of pairs){
  const r = resolveOne(p.team_id, p.league_name, teamCountry.get(p.team_id)?.country);
  if(r && r.id!=null){ await c.query(`insert into football._nullid_resolution values ($1,$2,$3,$4)`,[p.team_id,p.league_name,r.id,r.method]); resolved++; }
  else unresolved++;
}
console.log(`resolution: resolved (team,name) pairs=${resolved} unresolved=${unresolved}`);
// name-only fallback (covers null team_id rows)
await c.query(`drop table if exists football._name_resolution`);
await c.query(`create table football._name_resolution (league_name text primary key, resolved_league_id int)`);
const distinctNames = await q(`select distinct league_name from football.player_season_stats where league_id is null`);
for(const r of distinctNames){
  const rr=resolveOne(null, r.league_name, null);
  if(rr&&rr.id!=null) await c.query(`insert into football._name_resolution values ($1,$2) on conflict do nothing`,[r.league_name, rr.id]);
}

// ---------- UNIFIED, de-duplicated season stats ----------
const RAW = `games_appearances,games_lineups,games_minutes,subs_in,subs_out,subs_bench,shots_total,shots_on,
  goals_total,goals_conceded,goals_assists,goals_saves,passes_total,passes_key,tackles_total,tackles_blocks,
  tackles_interceptions,duels_total,duels_won,dribbles_attempts,dribbles_success,dribbles_past,fouls_drawn,
  fouls_committed,cards_yellow,cards_yellowred,cards_red,penalty_won,penalty_committed,penalty_scored,
  penalty_missed,penalty_saved,games_rating`.replace(/\s+/g,'');
await c.query(`drop table if exists football._unified_stats`);
await c.query(`create table football._unified_stats as
  select player_id, season, team_id, league_id as eff_league_id, true as idb, ${RAW}
  from football.player_season_stats where league_id is not null
  union all
  select s.player_id, s.season, s.team_id,
     coalesce(r.resolved_league_id, nr.resolved_league_id) as eff_league_id, false as idb, ${RAW.split(',').map(x=>'s.'+x).join(',')}
  from football.player_season_stats s
  left join football._nullid_resolution r on r.team_id = s.team_id and r.league_name = s.league_name
  left join football._name_resolution nr on nr.league_name = s.league_name
  where s.league_id is null and coalesce(r.resolved_league_id, nr.resolved_league_id) is not null`);
// dedup 66 overlaps: prefer id-bearing
await c.query(`drop table if exists football._unified_dedup`);
await c.query(`create table football._unified_dedup as
  select distinct on (player_id, season, eff_league_id, team_id) *
  from football._unified_stats order by player_id, season, eff_league_id, team_id, idb desc`);
const uniN=(await q(`select count(*)::int c from football._unified_stats`))[0].c;
const dedN=(await q(`select count(*)::int c from football._unified_dedup`))[0].c;
console.log(`unified rows=${uniN} deduped=${dedN} (dropped ${uniN-dedN} overlaps)`);

// ---------- competition_dim over ALL effective league_ids ----------
await c.query(`drop table if exists football.competition_dim cascade`);
await c.query(`create table football.competition_dim (league_id int primary key, comp_name text, country text, comp_type text, category text not null, is_national bool, is_youth bool)`);
const effLeagues = await q(`select distinct eff_league_id lid from football._unified_dedup where eff_league_id is not null`);
for(const r of effLeagues){
  const meta = catById.get(r.lid) || {};
  const name = meta.name || (await q(`select max(league_name) n from football.player_season_stats where league_id=$1`,[r.lid]))[0]?.n || null;
  const country = meta.country || '';
  const cl = classify(name, country, meta.type||null, r.lid);
  await c.query(`insert into football.competition_dim values ($1,$2,$3,$4,$5,$6,$7)`,[r.lid,name,country,meta.type||null,cl.category,cl.is_national,cl.is_youth]);
}
console.log('competition_dim rows:', effLeagues.length);

// ---------- STAT TOTALS from unified ----------
const S=(col)=>`sum(coalesce(${col},0))::bigint`;
const statCols = `
  ${S('games_appearances')} matches, ${S('games_lineups')} lineups, ${S('games_minutes')} minutes,
  ${S('subs_in')} subs_in, ${S('subs_out')} subs_out, ${S('subs_bench')} subs_bench,
  ${S('shots_total')} shots_total, ${S('shots_on')} shots_on,
  ${S('goals_total')} goals, ${S('goals_conceded')} goals_conceded, ${S('goals_assists')} assists, ${S('goals_saves')} goals_saves,
  ${S('passes_total')} passes_total, ${S('passes_key')} passes_key,
  ${S('tackles_total')} tackles_total, ${S('tackles_blocks')} tackles_blocks, ${S('tackles_interceptions')} interceptions,
  ${S('duels_total')} duels_total, ${S('duels_won')} duels_won,
  ${S('dribbles_attempts')} dribbles_attempts, ${S('dribbles_success')} dribbles_success, ${S('dribbles_past')} dribbles_past,
  ${S('fouls_drawn')} fouls_drawn, ${S('fouls_committed')} fouls_committed,
  ${S('cards_yellow')} cards_yellow, ${S('cards_yellowred')} cards_yellowred, ${S('cards_red')} cards_red,
  ${S('penalty_won')} penalty_won, ${S('penalty_committed')} penalty_committed, ${S('penalty_scored')} penalty_scored,
  ${S('penalty_missed')} penalty_missed, ${S('penalty_saved')} penalty_saved,
  count(*)::int season_lines, count(distinct season)::int seasons_count, min(season)::int first_season, max(season)::int last_season,
  (sum(games_rating*greatest(coalesce(games_appearances,0),0)) filter (where games_rating is not null and coalesce(games_appearances,0)>0)
     / nullif(sum(greatest(coalesce(games_appearances,0),0)) filter (where games_rating is not null and coalesce(games_appearances,0)>0),0))::numeric(5,3) rating_avg,
  count(*) filter (where games_rating is not null)::int rating_n`;
const colDefs=`matches bigint,lineups bigint,minutes bigint,subs_in bigint,subs_out bigint,subs_bench bigint,shots_total bigint,shots_on bigint,goals bigint,goals_conceded bigint,assists bigint,goals_saves bigint,passes_total bigint,passes_key bigint,tackles_total bigint,tackles_blocks bigint,interceptions bigint,duels_total bigint,duels_won bigint,dribbles_attempts bigint,dribbles_success bigint,dribbles_past bigint,fouls_drawn bigint,fouls_committed bigint,cards_yellow bigint,cards_yellowred bigint,cards_red bigint,penalty_won bigint,penalty_committed bigint,penalty_scored bigint,penalty_missed bigint,penalty_saved bigint,season_lines int,seasons_count int,first_season int,last_season int,rating_avg numeric(5,3),rating_n int`;
const colNames=`matches,lineups,minutes,subs_in,subs_out,subs_bench,shots_total,shots_on,goals,goals_conceded,assists,goals_saves,passes_total,passes_key,tackles_total,tackles_blocks,interceptions,duels_total,duels_won,dribbles_attempts,dribbles_success,dribbles_past,fouls_drawn,fouls_committed,cards_yellow,cards_yellowred,cards_red,penalty_won,penalty_committed,penalty_scored,penalty_missed,penalty_saved,season_lines,seasons_count,first_season,last_season,rating_avg,rating_n`;

await c.query(`drop table if exists football.player_competition_totals cascade`);
await c.query(`create table football.player_competition_totals (
  player_id uuid not null references football.players(id) on delete cascade,
  league_id int not null, comp_name text, country text, category text, ${colDefs},
  primary key (player_id, league_id))`);
await c.query(`insert into football.player_competition_totals (player_id, league_id, comp_name, country, category, ${colNames})
  select u.player_id, u.eff_league_id, d.comp_name, d.country, d.category, ${statCols}
  from football._unified_dedup u join football.competition_dim d on d.league_id=u.eff_league_id
  group by u.player_id, u.eff_league_id, d.comp_name, d.country, d.category`);
await c.query(`create index on football.player_competition_totals(league_id)`);
await c.query(`create index on football.player_competition_totals(category)`);
console.log('player_competition_totals rows:', (await q(`select count(*)::int c from football.player_competition_totals`))[0].c);

await c.query(`drop table if exists football.player_national_totals cascade`);
await c.query(`create table football.player_national_totals (player_id uuid primary key references football.players(id) on delete cascade, ${colDefs})`);
await c.query(`insert into football.player_national_totals (player_id, ${colNames})
  select u.player_id, ${statCols}
  from football._unified_dedup u join football.competition_dim d on d.league_id=u.eff_league_id
  where d.category='NATIONAL_SENIOR' group by u.player_id`);
console.log('player_national_totals rows:', (await q(`select count(*)::int c from football.player_national_totals`))[0].c);

// ---------- TITLE TOTALS (blank-season dupes excluded) ----------
await c.query(`drop table if exists football.trophy_dim cascade`);
await c.query(`create table football.trophy_dim (comp_name text, country text, category text not null, is_national bool, is_youth bool, primary key(comp_name,country))`);
for(const r of await q(`select league comp_name, coalesce(country,'') country from football.player_trophies group by league, coalesce(country,'')`)){
  const type = idByNameCountry.has(`${r.comp_name}||${r.country}`) ? catById.get(idByNameCountry.get(`${r.comp_name}||${r.country}`))?.type : null;
  const cl = classify(r.comp_name, r.country, type||null, null);
  await c.query(`insert into football.trophy_dim values ($1,$2,$3,$4,$5)`,[r.comp_name,r.country,cl.category,cl.is_national,cl.is_youth]);
}
await c.query(`drop table if exists football.player_title_totals cascade`);
await c.query(`create table football.player_title_totals (
  player_id uuid not null references football.players(id) on delete cascade,
  category text, comp_name text, country text, wins int not null, seasons text[], primary key(player_id,comp_name,country))`);
await c.query(`insert into football.player_title_totals (player_id, category, comp_name, country, wins, seasons)
  select t.player_id, d.category, t.league, coalesce(t.country,''), count(*)::int, array_agg(distinct t.season order by t.season)
  from football.player_trophies t join football.trophy_dim d on d.comp_name=t.league and d.country=coalesce(t.country,'')
  where t.place='Winner' and t.season is not null and t.season<>''
  group by t.player_id, d.category, t.league, coalesce(t.country,'')`);
await c.query(`create index on football.player_title_totals(category)`);
console.log('player_title_totals rows:', (await q(`select count(*)::int c from football.player_title_totals`))[0].c);

await c.query(`drop table if exists football.player_titles_by_category cascade`);
await c.query(`create table football.player_titles_by_category (
  player_id uuid not null references football.players(id) on delete cascade,
  category text not null, wins int not null, seasons text[], primary key(player_id,category))`);
await c.query(`insert into football.player_titles_by_category (player_id, category, wins, seasons)
  select t.player_id, d.category, count(*)::int, array_agg(distinct t.season order by t.season)
  from football.player_trophies t join football.trophy_dim d on d.comp_name=t.league and d.country=coalesce(t.country,'')
  where t.place='Winner' and t.season is not null and t.season<>''
  group by t.player_id, d.category`);
console.log('player_titles_by_category rows:', (await q(`select count(*)::int c from football.player_titles_by_category`))[0].c);

// cleanup scratch
await c.query(`drop table if exists football._unified_stats`);
console.log('\nBUILD COMPLETE');
await c.end();
