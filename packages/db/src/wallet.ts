import { SIGNUP_BONUS, type WalletTxType } from "@fb/shared";
import { Prisma } from "./generated/client";
import { prisma } from "./client";
import {
  EmailTakenError,
  InsufficientFundsError,
  UsernameTakenError,
  WalletNotFoundError,
} from "./errors";

/**
 * Wallet integrity (Section 6, critical piece #2).
 *
 * The append-only `wallet_transactions` ledger is the financial source of truth.
 * `wallets.balance` is mutated ONLY here, in lockstep with inserting a ledger
 * row, inside one DB transaction. Every mutation:
 *   open tx → SELECT ... FOR UPDATE the wallet row → check sufficiency
 *   → insert ledger row with a unique `reference` (idempotency key)
 *   → update balance / highest_balance → commit (any failure → rollback).
 */

/** A Prisma client scoped to an interactive transaction. */
export type TxClient = Prisma.TransactionClient;

export interface ApplyTxParams {
  userId: string;
  type: WalletTxType;
  /** Signed: positive = credit, negative = debit. */
  amount: bigint;
  /** Server-generated idempotency key. Repeats are no-ops. */
  reference: string;
  gameId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

export interface ApplyTxResult {
  /** The ledger row id (existing one if this was an idempotent replay). */
  transactionId: string;
  /** Wallet balance after the operation. */
  balance: bigint;
  /** True if `reference` had already been applied and nothing changed. */
  idempotentReplay: boolean;
}

interface WalletRow {
  id: string;
  balance: bigint;
  highest_balance: bigint;
}

/**
 * Apply a single wallet movement within an existing transaction. Locks the
 * wallet row (`FOR UPDATE`) so concurrent movements for the same user serialize.
 * Composable: callers can chain several movements + other writes (Bets, etc.)
 * in one transaction.
 */
export async function applyWalletTransaction(
  tx: TxClient,
  params: ApplyTxParams,
): Promise<ApplyTxResult> {
  const { userId, type, amount, reference, gameId = null, metadata = null } = params;

  // 1) Lock the wallet row for this user.
  const rows = await tx.$queryRaw<WalletRow[]>(
    Prisma.sql`SELECT id, balance, highest_balance
               FROM link_up.wallets
               WHERE user_id = ${userId}::uuid
               FOR UPDATE`,
  );
  const wallet = rows[0];
  if (!wallet) throw new WalletNotFoundError(userId);

  // 2) Idempotency: if this reference was already applied, return it unchanged.
  const existing = await tx.walletTransaction.findUnique({
    where: { reference },
    select: { id: true },
  });
  if (existing) {
    return {
      transactionId: existing.id,
      balance: wallet.balance,
      idempotentReplay: true,
    };
  }

  // 3) Sufficiency — balance may never go negative.
  const newBalance = wallet.balance + amount;
  if (newBalance < 0n) {
    throw new InsufficientFundsError(wallet.balance, amount);
  }
  const newHighest =
    newBalance > wallet.highest_balance ? newBalance : wallet.highest_balance;

  // 4) Insert the ledger row (unique reference) ...
  const created = await tx.walletTransaction.create({
    data: {
      userId,
      gameId,
      type,
      amount,
      balanceAfter: newBalance,
      reference,
      metadata: metadata ?? Prisma.JsonNull,
    },
    select: { id: true },
  });

  // 5) ... and move the balance in the same transaction.
  await tx.wallet.update({
    where: { userId },
    data: { balance: newBalance, highestBalance: newHighest },
  });

  return { transactionId: created.id, balance: newBalance, idempotentReplay: false };
}

/**
 * Convenience wrapper that runs a single movement in its own transaction.
 * Use the `tx`-scoped `applyWalletTransaction` when composing multiple writes.
 */
export function applyWalletTransactionAtomic(
  params: ApplyTxParams,
  client = prisma,
): Promise<ApplyTxResult> {
  return client.$transaction((tx) => applyWalletTransaction(tx, params));
}

export interface RegisterUserParams {
  username: string;
  /** Normalized (lowercased) email; the account is created UNVERIFIED
   *  (email_verified_at stays null) and gated at login until an OTP is entered. */
  email: string;
  /** Pre-hashed (argon2id). This layer never sees plaintext passwords. */
  passwordHash: string;
  avatarSeed?: string | null;
}

export interface RegisteredUser {
  id: string;
  username: string;
  playerNumber: number;
  balance: bigint;
}

/**
 * Create a user with an initialized Wallet + UserStats and the 1000-coin signup
 * bonus, all in one transaction (Section 13: register → SIGNUP_BONUS 1000 +
 * init Wallet/UserStats). The wallet starts at 0 and is credited through the
 * ledger so balance == Σ(ledger) holds from the very first row.
 */
export async function registerUserWithWallet(
  params: RegisterUserParams,
): Promise<RegisteredUser> {
  const { username, email, passwordHash, avatarSeed = null } = params;

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          email,
          passwordHash,
          avatarSeed,
          wallet: { create: { balance: 0n, highestBalance: 0n } },
          stats: { create: {} },
        },
        select: { id: true, username: true, playerNumber: true },
      });

      const { balance } = await applyWalletTransaction(tx, {
        userId: user.id,
        type: "SIGNUP_BONUS",
        amount: SIGNUP_BONUS,
        reference: `signup:${user.id}`,
      });

      return {
        id: user.id,
        username: user.username,
        playerNumber: user.playerNumber,
        balance,
      };
    });
  } catch (err) {
    // Detect the unique-constraint violation by code (structural), not instanceof:
    // when bundled (e.g. Next.js), the runtime error can fail an instanceof check
    // against the imported Prisma namespace, letting a raw P2002 escape as a 500.
    if ((err as { code?: string } | null)?.code === "P2002") {
      // Distinguish which unique column collided (username vs email). Prisma 7's
      // pg driver adapter dropped `meta.target`; the colliding fields now live
      // under `meta.driverAdapterError.cause.constraint.fields`. We check both
      // shapes plus the (engine-stable) error message so detection survives an
      // engine/adapter swap. These are field/constraint NAMES, never user data.
      const meta = (err as {
        meta?: {
          target?: unknown;
          driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } };
        };
      }).meta;
      const adapterFields = meta?.driverAdapterError?.cause?.constraint?.fields;
      const haystack = [meta?.target, adapterFields, (err as { message?: string }).message]
        .map((v) => (Array.isArray(v) ? v.join(",") : String(v ?? "")))
        .join(" ")
        .toLowerCase();
      if (haystack.includes("email")) throw new EmailTakenError();
      throw new UsernameTakenError();
    }
    throw err;
  }
}

/** Current balance from the wallet row (source of truth is the ledger sum). */
export async function getWalletBalance(userId: string): Promise<bigint> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: { balance: true },
  });
  if (!wallet) throw new WalletNotFoundError(userId);
  return wallet.balance;
}
