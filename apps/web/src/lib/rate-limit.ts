import { headers } from "next/headers";
import {
  OTP_MAX_REQUESTS_PER_ACCOUNT,
  OTP_REQUEST_WINDOW_SECONDS,
  rateLimit,
  sweepRateStore,
  type RateStore,
} from "@fb/shared";

/**
 * Server-side rate limiting for sensitive endpoints (Section 6 / 16): auth and
 * bank. In-memory per-process stores (v1 single server). Pure logic lives in
 * @fb/shared; this wires it to the request IP / user.
 */

const authStore: RateStore = new Map();
const bankStore: RateStore = new Map();
const otpStore: RateStore = new Map();
const availabilityStore: RateStore = new Map();

/** Best-effort client IP from proxy headers. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

/** Auth attempts: 10 per minute per IP. */
export function authRateLimit(ip: string): boolean {
  if (authStore.size > 5000) sweepRateStore(authStore);
  return rateLimit(authStore, `auth:${ip}`, 10, 60_000).allowed;
}

/** Bank requests: 5 per minute per user (burst guard; 2×/24h is the real cap). */
export function bankRateLimit(userId: string): boolean {
  if (bankStore.size > 5000) sweepRateStore(bankStore);
  return rateLimit(bankStore, `bank:${userId}`, 5, 60_000).allowed;
}

/**
 * OTP (re)send ceiling per account, on top of the per-code 60s cooldown and the
 * one-active-code rule — defence against email-bombing a single inbox.
 */
export function otpRequestRateLimit(userId: string): boolean {
  if (otpStore.size > 5000) sweepRateStore(otpStore);
  return rateLimit(
    otpStore,
    `otp:${userId}`,
    OTP_MAX_REQUESTS_PER_ACCOUNT,
    OTP_REQUEST_WINDOW_SECONDS * 1000,
  ).allowed;
}

/**
 * Live register email/username availability checks: 30 per minute per IP. Looser
 * than auth (it fires on field blur) but capped so the endpoint can't be used for
 * bulk account enumeration.
 */
export function availabilityRateLimit(ip: string): boolean {
  if (availabilityStore.size > 5000) sweepRateStore(availabilityStore);
  return rateLimit(availabilityStore, `avail:${ip}`, 30, 60_000).allowed;
}
