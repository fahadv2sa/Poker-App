import type { NextRequest } from "next/server";
import {
  listPlayersForExport,
  type PlayerFilter,
  type PlayerMissing,
  type PlayerSort,
  type PositionCode,
  type TournamentType,
} from "@fb/admin-core";
import { PERMISSIONS } from "@fb/shared";
import { requireAdminCan } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

const POSITIONS = ["GK", "DEF", "MID", "FWD"];
const SORTS = ["fame_desc", "fame_asc", "name_asc", "tier_asc", "birth_desc", "birth_asc", "height_desc", "weight_desc", "avg_desc", "avg_asc"];
const MISSING = ["photo", "name_ar", "fame", "clubs", "season_stats"];
const TOURNAMENTS = ["WORLD_CUP", "EURO_COPA", "CHAMPIONS_LEAGUE"];

function parse(sp: URLSearchParams): PlayerFilter {
  const get = (k: string) => sp.get(k)?.trim() || undefined;
  const num = (k: string) => {
    const v = get(k);
    return v && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : undefined;
  };
  const bool = (k: string) => {
    const v = get(k);
    return v === "1" ? true : v === "0" ? false : undefined;
  };
  const inSet = (k: string, set: string[]) => {
    const v = get(k);
    return set.includes(v ?? "") ? v : undefined;
  };
  const tier = num("tier");
  return {
    q: get("q"),
    nationality: get("nationality"),
    position: inSet("position", POSITIONS) as PositionCode | undefined,
    tier: tier && tier >= 1 && tier <= 4 ? tier : undefined,
    legend: bool("legend"),
    active: bool("active"),
    fameMin: num("fameMin"),
    fameMax: num("fameMax"),
    avgMin: num("avgMin"),
    avgMax: num("avgMax"),
    ratedMin: num("ratedMin"),
    club: get("club"),
    nationalTeam: get("nationalTeam"),
    tournament: inSet("tournament", TOURNAMENTS) as TournamentType | undefined,
    tourMin: num("tourMin"),
    birthYearMin: num("birthYearMin"),
    birthYearMax: num("birthYearMax"),
    heightMin: num("heightMin"),
    heightMax: num("heightMax"),
    weightMin: num("weightMin"),
    weightMax: num("weightMax"),
    missing: inSet("missing", MISSING) as PlayerMissing | undefined,
    sort: inSet("sort", SORTS) as PlayerSort | undefined,
  };
}

const HEADERS = [
  "id",
  "name",
  "name_ar",
  "nationality",
  "position",
  "birth_year",
  "height_cm",
  "avg_rating",
  "avg_rating_n",
  "fame_score",
  "tier",
  "is_legend",
  "legend_score",
  "active",
  "has_photo",
];

/** RFC-4180-ish quoting for one CSV field. */
function cell(v: string | number | boolean | null): string {
  const s = v === null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  await requireAdminCan(PERMISSIONS.FOOTBALL_READ);
  const filter = parse(req.nextUrl.searchParams);
  const rows = await listPlayersForExport(filter);

  const lines = [
    HEADERS.join(","),
    ...rows.map((p) =>
      [
        cell(p.id),
        cell(p.name),
        cell(p.nameAr),
        cell(p.nationality),
        cell(p.position),
        cell(p.birthYear),
        cell(p.heightCm),
        cell(p.avgRating),
        cell(p.avgRatingN),
        cell(p.fameScore),
        cell(p.tier),
        cell(p.isLegend),
        cell(p.legendScore),
        cell(p.active),
        cell(p.hasPhoto),
      ].join(","),
    ),
  ];
  // BOM so Excel reads UTF-8 (Arabic names) correctly.
  const body = "﻿" + lines.join("\r\n");

  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="players-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
