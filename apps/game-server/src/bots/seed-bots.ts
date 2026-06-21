import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { hash } from "@node-rs/argon2";
import { prisma } from "@fp/db";
import { AVATAR_MAX_BYTES, BOT_PLAYER_NUMBER_BASE } from "@fp/shared";
import { personalityForSeed } from "./strategy.js";
import { generateBotProfile, seededRng } from "./profile.js";

/**
 * Phase 5 — one-time, idempotent importer for the Quick Play bot identities.
 * Consumes ./identities.json (nickname + avatar filename per entry) and ./avatars/
 * and creates a lightweight `users` row per bot in the RESERVED player_number block
 * (>= BOT_PLAYER_NUMBER_BASE), plus a `player_metrics` row of fabricated, believable
 * career stats and a `user_avatars` row. NO wallet and NO user_stats: a bot never
 * touches the ledger and its own /stats page is never viewed; the public profile +
 * table avatar resolve from player_metrics + user_avatars by player_number.
 *
 * Avatars are auto-downscaled with sharp to a square <=256x256 webp under the app's
 * AVATAR_MAX_BYTES limit, so real source photos attach instead of being skipped. If
 * an image is missing/corrupt/unreadable (or can't be made compliant), the bot gets
 * a single consistent DEFAULT FALLBACK (the game logo) — never a random generated
 * avatar — so every bot has a clean, intentional picture.
 *
 * Re-runnable: upserts by the stable username `bot_<playerNumber>`; player_number is
 * assigned by the identity's position in identities.json. Personalities and stats are
 * derived deterministically from player_number.
 *
 * Run (local DB): pnpm db:seed-bots. The target DB host is printed below.
 * Removal: delete src/bots/ and `DELETE FROM users WHERE player_number >= 900000`.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const IDENTITIES_FILE = path.join(here, "identities.json");
const AVATARS_DIR = path.join(here, "avatars");
/** Consistent default avatar for any bot whose image can't be used (the game logo). */
const FALLBACK_LOGO = path.join(here, "../../../web/public/icon-512.png");

const AVATAR_DIM = 256;
const AVATAR_MIME = "image/webp";

/** Prisma's Bytes field wants a Uint8Array backed by a concrete ArrayBuffer. */
type AvatarBytes = Uint8Array<ArrayBuffer>;

interface RawIdentity {
  nickname: string;
  avatar: string;
}

/**
 * Downscale/compress an image (file path or buffer) to a square <=256x256 webp that
 * fits AVATAR_MAX_BYTES, stepping quality down until it does. Returns null if the
 * image is unreadable/corrupt or still non-compliant at the lowest quality.
 */
async function toWebpAvatar(input: string | Buffer): Promise<AvatarBytes | null> {
  try {
    for (const quality of [82, 70, 58, 45, 32]) {
      const out = await sharp(input)
        .rotate() // honor EXIF orientation
        .resize(AVATAR_DIM, AVATAR_DIM, { fit: "cover", position: "attention" })
        .webp({ quality })
        .toBuffer();
      if (out.byteLength <= AVATAR_MAX_BYTES) {
        const data = new Uint8Array(new ArrayBuffer(out.byteLength));
        data.set(out);
        return data;
      }
    }
    return null; // still too large even at the lowest quality (very unlikely at 256²)
  } catch {
    return null; // corrupt / unreadable / unsupported
  }
}

type AvatarResult =
  | { kind: "real"; data: AvatarBytes }
  | { kind: "fallback"; reason: "missing-file" | "unusable" };

async function resolveAvatar(file: string): Promise<AvatarResult> {
  const full = path.join(AVATARS_DIR, file);
  if (!existsSync(full)) return { kind: "fallback", reason: "missing-file" };
  const data = await toWebpAvatar(full);
  return data ? { kind: "real", data } : { kind: "fallback", reason: "unusable" };
}

async function main(): Promise<void> {
  const dbHost = (process.env.DATABASE_URL ?? "(unset)").replace(/:\/\/[^@]*@/, "://***@");
  console.log(`Seeding Quick Play bots → ${dbHost}`);

  if (!existsSync(IDENTITIES_FILE)) {
    throw new Error(`identities.json not found at ${IDENTITIES_FILE}`);
  }
  const raw = JSON.parse(readFileSync(IDENTITIES_FILE, "utf8")) as RawIdentity[];
  console.log(`Loaded ${raw.length} identities.`);

  // Pre-process the fallback logo ONCE so every fallback bot shares an identical
  // default avatar.
  let fallbackData: AvatarBytes | null = null;
  if (existsSync(FALLBACK_LOGO)) {
    fallbackData = await toWebpAvatar(readFileSync(FALLBACK_LOGO));
  }
  if (!fallbackData) {
    console.warn(
      `! could not load/process the fallback logo at ${FALLBACK_LOGO} — fallback bots will have no stored avatar (generated).`,
    );
  }

  // One argon2id hash of a random, discarded secret — shared by all bots so none
  // can ever log in, while verify() stays clean.
  const passwordHash = await hash(randomBytes(32).toString("hex"));

  const fallbacks: Array<{ playerNumber: number; nickname: string; avatar: string; reason: string }> = [];
  let real = 0;
  let fellBack = 0;

  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i]!;
    const nickname = entry.nickname.trim() || `لاعب ${i + 1}`;
    const playerNumber = BOT_PLAYER_NUMBER_BASE + 1 + i;
    const username = `bot_${playerNumber}`;
    const personality = personalityForSeed(playerNumber);
    const profile = generateBotProfile(personality, seededRng(playerNumber));

    const res = await resolveAvatar(entry.avatar);
    let avatarData: AvatarBytes | null;
    if (res.kind === "real") {
      avatarData = res.data;
      real++;
    } else {
      avatarData = fallbackData;
      fellBack++;
      fallbacks.push({ playerNumber, nickname, avatar: entry.avatar, reason: res.reason });
    }

    const metrics = {
      matches: profile.matches,
      wins: profile.wins,
      losses: profile.losses,
      folds: profile.folds,
      netProfit: profile.netProfit,
      totalWon: profile.totalWon,
      totalLost: profile.totalLost,
      biggestWin: profile.biggestWin,
      biggestLoss: profile.biggestLoss,
      biggestPot: profile.biggestPot,
      longestWinStreak: profile.longestWinStreak,
      xp: profile.xp,
      level: profile.level,
    };

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { username },
        create: {
          username,
          nickname,
          passwordHash,
          avatarSeed: username,
          likesReceived: profile.likesReceived,
          playerNumber,
        },
        update: { nickname, likesReceived: profile.likesReceived },
        select: { id: true },
      });
      await tx.playerMetrics.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...metrics },
        update: metrics,
      });
      if (avatarData) {
        await tx.userAvatar.upsert({
          where: { userId: user.id },
          create: { userId: user.id, data: avatarData, mimeType: AVATAR_MIME },
          update: { data: avatarData, mimeType: AVATAR_MIME },
        });
      }
    });

    if ((i + 1) % 10 === 0) console.log(`  … ${i + 1}/${raw.length}`);
  }

  console.log(
    `Done. ${real} bots attached their real photo, ${fellBack} used the logo fallback.`,
  );
  if (fallbacks.length > 0) {
    console.log(`Fallback entries (substituted the game logo):`);
    for (const f of fallbacks) {
      console.log(`  #${f.playerNumber} [${f.nickname}] "${f.avatar}" — ${f.reason}`);
    }
  }
  if (raw.length > 0) {
    console.log(
      `Reserved player_number block: ${BOT_PLAYER_NUMBER_BASE + 1}…${BOT_PLAYER_NUMBER_BASE + raw.length}.`,
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
