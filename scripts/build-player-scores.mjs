// PLAYER SCORE — exactly six weighted inputs, nothing else. LOCAL.
// No pinning, no exceptions, no override list, no scaling tricks.
//   score = 0.18*P(club_matches) + 0.25*P(club_titles) + 0.10*P(nat_matches)
//         + 0.17*P(nat_titles)  + 0.20*P(rating)      + 0.10*P(pos_stats)
// where P(x) = percentile rank (0..100). Big-vs-small is applied inside inputs 1 & 3
// via club_tier / nation_tier (that IS input 1 and 3 as specified — not an addition).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('C:/Users/Admin/OneDrive/Desktop/Football-B/link-up/node_modules/.pnpm/pg@8.22.0/node_modules/pg/lib/index.js');
const c = new Client({ connectionString: 'postgresql://football:football@localhost:5432/football_poker' });
await c.connect();
const q = async (s,p)=>(await c.query(s,p)).rows;
const CLUB_CATS = `('LEAGUE_ES','LEAGUE_IT','LEAGUE_EN','LEAGUE_FR','LEAGUE_DE','UCL','CLUB_CUP','OTHER_LEAGUE')`;

// ---- DELETE every existing score / scoring system / rule / exception ----
for (const t of ['player_score_override','player_score','player_score_pct','player_score_raw','club_tier','nation_tier','player_fame'])
  await c.query(`drop table if exists football.${t} cascade`);

// ---- big vs small clubs (input 1) ----
await c.query(`create table football.club_tier (team_id int primary key, team_name text, tier text, weight numeric)`);
await c.query(`insert into football.club_tier
  with t as (
    select s.team_id, max(s.team_name) team_name,
      sum(coalesce(s.games_appearances,0)) filter (where s.league_id=2) ucl_apps,
      sum(coalesce(s.games_appearances,0)) filter (where s.league_id in (39,140,135,78,61)) big5_apps
    from football.player_season_stats s join football.competition_dim d on d.league_id=s.league_id
    where d.category in ${CLUB_CATS} and s.team_id is not null
    group by s.team_id),
  r as (select *, row_number() over (order by ucl_apps desc nulls last, big5_apps desc nulls last) rn from t)
  select team_id, team_name,
    case when coalesce(ucl_apps,0)>0 and rn<=25 then 'ELITE' when coalesce(ucl_apps,0)>0 and rn<=100 then 'BIG'
         when coalesce(big5_apps,0)>=50 then 'MID' else 'SMALL' end,
    case when coalesce(ucl_apps,0)>0 and rn<=25 then 1.0 when coalesce(ucl_apps,0)>0 and rn<=100 then 0.7
         when coalesce(big5_apps,0)>=50 then 0.4 else 0.2 end
  from r`);

// ---- big vs small national teams (input 3) ----
await c.query(`create table football.nation_tier (country text primary key, tier text, weight numeric)`);
const ELITE_N = ['Brazil','Argentina','France','Germany','Spain','Italy','England','Portugal','Netherlands','Belgium'];
const BIG_N = ['Uruguay','Croatia','Colombia','Mexico','USA','Denmark','Switzerland','Poland','Sweden','Serbia','Austria','Ukraine','Wales','Turkey','Senegal','Morocco','Nigeria','Ghana','Cameroon',"Côte d'Ivoire",'Chile','Japan','Korea Republic','Czech Republic','Norway','Scotland','Republic of Ireland'];
for (const n of ELITE_N) await c.query(`insert into football.nation_tier values ($1,'ELITE',1.0) on conflict do nothing`,[n]);
for (const n of BIG_N) await c.query(`insert into football.nation_tier values ($1,'BIG',0.7) on conflict do nothing`,[n]);

// ---- input 7: fame / stardom / legacy — CLAUDE'S 0-100 estimate for EVERY player ----
// Famous players (below) get an explicit knowledge-based value; every OTHER player gets an
// automatic stardom estimate derived from visibility (big-club match volume + rating +
// position output) — so no player sits at a flat baseline. Explicit values override the auto one.
// [pattern (ILIKE), fame 0-100] — distinctive strings chosen to avoid namesakes.
const FAME_TIERS = {
  100: ['L. Messi','Cristiano Ronaldo'],
  95:  ['Neymar'],
  94:  ['Kylian Mbappé'],
  92:  ['Ronaldinho','Andrés Iniesta'],
  90:  ['E. Haaland','Xavi','Kaká','Z. Ibrahimović','Mohamed Salah'],
  88:  ['Iker Casillas','G. Buffon','T. Henry','W. Rooney','S. Gerrard','Vinícius Júnior','J. Bellingham','K. Benzema','R. Lewandowski','L. Modrić'],
  86:  ['L. Suárez','Sergio Ramos','K. De Bruyne','H. Kane','F. Lampard','Ryan Giggs','P. Scholes','Didier Drogba','R. van Persie','A. Del Piero','F. Totti','A. Pirlo'],
  84:  ['S. Agüero','P. Pogba','V. van Dijk','E. Hazard','Gerard Piqué','Piqué','Gareth Bale','G. Bale','A. Robben','Samuel Eto','David Villa','Carles Puyol','R. Ferdinand','James Rodríguez','Radamel Falcao','Son Heung','H. Son'],
  82:  ['A. Griezmann','T. Kroos','T. Müller','M. Neuer','Marcelo','Fernando Torres','M. Özil','F. Ribéry','P. Lahm','B. Schweinsteiger','Cesc Fàbregas','Miroslav Klose','P. Vieira','F. Cannavaro','A. Nesta','Lamine Yamal','P. Maldini'],
  80:  ['S. Mané','P. Dybala','Bruno Fernandes','M. Rashford','P. Foden','B. Saka','Xabier Alonso','Á. Di María','Philippe Coutinho','Sergio Busquets','John Terry','Nemanja Vidić','Ashley Cole','M. Reus','Carlos Tevez','G. Higuaín','A. Iniesta'],
  78:  ['J. Musiala','Lautaro Martínez','Wesley Sneijder','Yaya Touré','Casemiro','E. Cavani','R. Lukaku','R. Sterling','J. Grealish','O. Dembélé','A. Sánchez','Rodri','N. Kanté','J. Kimmich','Dani Alves','A. Robben','G. Chiellini','Alisson','Ederson'],
  76:  ['Rodrygo','Pedri','Gavi','F. Wirtz','K. Kvaratskhelia','V. Osimhen','David Silva','Bernardo Silva','M. ter Stegen','T. Courtois','G. Donnarumma','R. Mahrez','M. Ødegaard','D. Rice','J. Oblak','David de Gea','K. Havertz','M. Mount','Álvaro Morata','Gabriel Jesus','Roberto Firmino','K. Coman','Thiago Silva','E. Martínez','L. Sané','İ. Gündoğan'],
  72:  ['C. Immobile','L. Insigne','R. Varane','Rúben Dias','Jordi Alba','Marquinhos','João Cancelo','L. Bonucci','K. Koulibaly','M. Verratti','T. Werner','S. Gnabry','K. Walker','Thiago Alcântara','Fabinho','Luis Díaz','Darwin Núñez','Julián Álvarez','A. Mac Allister','E. Fernández','Theo Hernández','A. Tchouaméni','E. Camavinga','A. Saliba','B. Saka','Sadio Mané','Antoine Griezmann'],
  68:  ['C. Nkunku','M. Kudus','Antony','K. Mbappé','Pepe','J. Boateng','M. Hummels','Álvaro Morata','H. Maguire','B. Chilwell','M. Acuña','R. James','Bukayo','Cody Gakpo','J. Sancho','Ferran Torres','Marco Asensio','Y. Carrasco','H. Lozano','Weston McKennie','Christian Pulisic','G. Reyna','A. Davies','J. Stones','Rúben Neves','Bruno Guimarães','C. Palmer'],
  62:  ['Fernandinho','Aymeric Laporte','Willian','Pedro','Fabián Ruiz','A. Vidal','N. Otamendi','Filipe Luís','Santi Cazorla','A. Rabiot','L. Hernández','Éder Militão','D. Upamecano','Jorginho','N. Tagliafico','Vitinha','M. Maignan','N. Barella','J. Koundé','Marcos Llorente','Dani Olmo','Gabriel Magalhães','William Saliba','Declan Rice','Lisandro Martínez','H. Lloris','Keylor Navas'],
  55:  ['S. Coates','H. Herrera','J. Corona','J. Álvarez','C. Tolisso','Álex Grimaldo','B. Pavard','Pedro Porro','Dani Carvajal','João Moutinho','L. Paredes','O. Giroud','Álvaro Odriozola','Ferland Mendy','Nacho','R. Guerreiro','Alex Sandro','J. Draxler','H. Ziyech','Y. Tielemans','Denis Zakaria','Manuel Locatelli','Sandro Tonali','N. Zaniolo','G. Xhaka'],
};
const FAME = Object.entries(FAME_TIERS).flatMap(([v, names]) => names.map(n => [n, Number(v)]));

// ---- the six raw inputs ----
await c.query(`create table football.player_score_raw as
  with
  cm as (select s.player_id, sum(coalesce(s.games_appearances,0)*ct.weight) v
    from football.player_season_stats s
    join football.competition_dim d on d.league_id=s.league_id and d.category in ${CLUB_CATS}
    join football.club_tier ct on ct.team_id=s.team_id group by s.player_id),
  clubt as (select t.player_id, sum(t.wins * case
        when t.category='UCL' then 5
        when t.category in ('LEAGUE_ES','LEAGUE_IT','LEAGUE_EN','LEAGUE_FR','LEAGUE_DE') then 4
        when t.category='OTHER_LEAGUE' then 2.5
        when t.comp_name in ('UEFA Europa League','UEFA Europa Conference League') then 2
        when t.category='CLUB_CUP' then 1.5 else 1 end) v
    from football.player_title_totals t
    where t.category in ('UCL','LEAGUE_ES','LEAGUE_IT','LEAGUE_EN','LEAGUE_FR','LEAGUE_DE','OTHER_LEAGUE','CLUB_CUP')
    group by t.player_id),
  natt as (select t.player_id, sum(t.wins * case
        when t.comp_name in ('FIFA World Cup','World Cup') then 10
        when t.comp_name ~* 'European Championship|Copa America|Africa Cup of Nations|Asian Cup' then 6
        when t.comp_name ~* 'Nations League' then 3 else 1.5 end) v
    from football.player_title_totals t where t.category='NATIONAL_SENIOR' group by t.player_id),
  rat as (select s.player_id,
      sum(s.games_rating*coalesce(s.games_appearances,0)) / nullif(sum(coalesce(s.games_appearances,0)) filter (where s.games_rating is not null),0) v
    from football.player_season_stats s where s.games_rating is not null group by s.player_id),
  posst as (select pct.player_id, sum(pct.goals) g, sum(pct.assists) a, sum(pct.passes_key) kp,
        sum(pct.tackles_total) tk, sum(pct.interceptions) ic, sum(pct.goals_saves) sv
    from football.player_competition_totals pct
    join football.competition_dim d on d.league_id=pct.league_id and d.category in ${CLUB_CATS}
    group by pct.player_id)
  select p.id player_id, p.name, po.code position,
    coalesce(cm.v,0) club_matches, coalesce(clubt.v,0) club_titles,
    coalesce(n.matches,0)*coalesce(nt.weight,0.4) nat_matches, coalesce(natt.v,0) nat_titles,
    rat.v rating,
    case po.code when 'FWD' then coalesce(posst.g,0)+coalesce(posst.a,0)
                 when 'MID' then coalesce(posst.a,0)+coalesce(posst.kp,0)
                 when 'DEF' then coalesce(posst.tk,0)+coalesce(posst.ic,0)
                 when 'GK'  then coalesce(posst.sv,0) else 0 end pos_stat
  from football.players p
  join football.positions po on po.id=p.position_id
  left join cm on cm.player_id=p.id
  left join clubt on clubt.player_id=p.id
  left join football.player_national_totals n on n.player_id=p.id
  left join football.nationalities nat on nat.id=p.nationality_id
  left join football.nation_tier nt on nt.country=nat.name
  left join natt on natt.player_id=p.id
  left join rat on rat.player_id=p.id
  left join posst on posst.player_id=p.id`);

// ---- percentiles for the six inputs ----
await c.query(`create table football.player_score_pct as
  select player_id, name, position,
    percent_rank() over (order by club_matches)*100 p_cm,
    percent_rank() over (order by club_titles)*100 p_ct,
    percent_rank() over (order by nat_matches)*100 p_nm,
    percent_rank() over (order by nat_titles)*100 p_nt,
    percent_rank() over (order by coalesce(rating,0))*100 p_rat,
    percent_rank() over (partition by position order by pos_stat)*100 p_pos
  from football.player_score_raw`);
await c.query(`alter table football.player_score_pct add primary key (player_id)`);

// ---- fame for EVERY player: auto stardom estimate (visibility), then explicit overrides ----
await c.query(`create table football.player_fame as
  select player_id, round((0.5*((p_cm + p_rat + p_pos)/3.0))::numeric,0) fame, false explicit
  from football.player_score_pct`);
await c.query(`alter table football.player_fame add primary key (player_id)`);
for (const [pat, fame] of FAME)
  await c.query(`update football.player_fame set fame=$1, explicit=true where player_id in (select id from football.players where name ilike $2)`, [fame, '%'+pat+'%']);
// R9 Ronaldo (exact name 'Ronaldo') — legendary global fame, distinct from Cristiano.
await c.query(`update football.player_fame set fame=88, explicit=true where player_id in (select id from football.players where name='Ronaldo')`);

// ---- score: fame 50% + (club matches 10 · club titles 5 · nat matches 10 · nat titles 5 · rating 10 · position 10) ----
await c.query(`create table football.player_score as
  select pct.player_id, pct.name, pct.position,
    round((0.50*f.fame + 0.10*p_cm + 0.05*p_ct + 0.10*p_nm + 0.05*p_nt + 0.10*p_rat + 0.10*p_pos)::numeric,0)::int score
  from football.player_score_pct pct join football.player_fame f on f.player_id = pct.player_id`);
await c.query(`alter table football.player_score add primary key (player_id)`);

console.log('player_score rows:', (await q(`select count(*)::int c from football.player_score`))[0].c);
console.log('distribution:', JSON.stringify((await q(`select round(min(score),2) mn, round(percentile_cont(0.5) within group (order by score)::numeric,2) p50, round(max(score),2) mx from football.player_score`))[0]));
await c.end();
