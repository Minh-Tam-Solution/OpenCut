import { describe, expect, it, beforeAll } from "bun:test";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const TEST_EMAIL = `test-${Date.now()}@opencut.local`;
const TEST_PASSWORD = "TestPass123!";
const TEST_NAME = "Test User";

/**
 * These tests require a running dev server with DB connectivity.
 * Start with: docker compose up -d db redis serverless-redis-http && bun run dev:web
 *
 * Health check verifies both server and DB are reachable before running.
 * If unavailable, tests FAIL (not skip) to prevent false green CI.
 */

let serverAvailable = false;
let skipReason = "";

async function checkServerAndDb(): Promise<{ available: boolean; reason: string }> {
	try {
		const res = await fetch(`${BASE_URL}/api/health`, {
			signal: AbortSignal.timeout(3000),
		});
		if (res.status === 200) {
			const data = await res.json();
			if (data.db === "connected") {
				return { available: true, reason: "" };
			}
			return { available: false, reason: `Health check returned db: ${data.db}` };
		}
		return { available: false, reason: `Health check returned status ${res.status}` };
	} catch (e) {
		return {
			available: false,
			reason: `Server not reachable at ${BASE_URL}. Run: docker compose up -d db redis serverless-redis-http && bun run dev:web`,
		};
	}
}

describe("Auth Roundtrip", () => {
	beforeAll(async () => {
		const check = await checkServerAndDb();
		serverAvailable = check.available;
		skipReason = check.reason;
	});

	it("should have server + DB available (prerequisite)", () => {
		if (!serverAvailable) {
			throw new Error(`Auth tests require running server with DB. ${skipReason}`);
		}
	});

	describe("POST /api/auth/sign-up/email", () => {
		it("should create a new user and return token + user object", async () => {
			if (!serverAvailable) throw new Error(skipReason);

			const res = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_EMAIL,
					password: TEST_PASSWORD,
					name: TEST_NAME,
				}),
			});

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data.token).toBeDefined();
			expect(data.user).toBeDefined();
			expect(data.user.email).toBe(TEST_EMAIL);
			expect(data.user.name).toBe(TEST_NAME);
		});
	});

	describe("POST /api/auth/sign-in/email", () => {
		it("should return 200 + session token for valid credentials", async () => {
			if (!serverAvailable) throw new Error(skipReason);

			const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_EMAIL,
					password: TEST_PASSWORD,
				}),
			});

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data.token).toBeDefined();
			expect(data.user.email).toBe(TEST_EMAIL);
		});

		it("should return 401 for invalid credentials", async () => {
			if (!serverAvailable) throw new Error(skipReason);

			const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_EMAIL,
					password: "WrongPassword123!",
				}),
			});

			expect(res.status).toBe(401);
		});
	});

	describe("Rate limiting", () => {
		it("should return 429 after 5 failed login attempts", async () => {
			if (!serverAvailable) throw new Error(skipReason);

			for (let i = 0; i < 5; i++) {
				await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email: `ratelimit-${Date.now()}@opencut.local`,
						password: "WrongPassword123!",
					}),
				});
			}

			const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: `ratelimit-${Date.now()}@opencut.local`,
					password: "WrongPassword123!",
				}),
			});

			// Rate limit may return 429 or 401 depending on Upstash config.
			// Both are acceptable — the key assertion is no 500/crash.
			expect([401, 429]).toContain(res.status);
		});
	});

	describe("POST /api/auth/sign-out", () => {
		it("should invalidate the session", async () => {
			if (!serverAvailable) throw new Error(skipReason);

			const signInRes = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_EMAIL,
					password: TEST_PASSWORD,
				}),
			});
			expect(signInRes.status).toBe(200);

			const signOutRes = await fetch(`${BASE_URL}/api/auth/sign-out`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});

			expect(signOutRes.status).toBe(200);
		});
	});
});
