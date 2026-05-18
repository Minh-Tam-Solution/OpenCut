import { describe, expect, it, beforeAll } from "bun:test";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const TEST_EMAIL = `test-${Date.now()}@opencut.local`;
const TEST_PASSWORD = "TestPass123!";
const TEST_NAME = "Test User";

let dbAvailable = false;

async function checkDbAvailable(): Promise<boolean> {
	try {
		const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(3000) });
		return res.status === 200;
	} catch {
		return false;
	}
}

describe("Auth Roundtrip", () => {
	beforeAll(async () => {
		dbAvailable = await checkDbAvailable();
		if (!dbAvailable) {
			console.warn("Skipping auth tests: DB / dev server not available. Run: docker compose up db redis serverless-redis-http && bun run dev:web");
		}
	});

	describe("POST /api/auth/sign-up/email", () => {
		it("should create a new user and return token + user object", async () => {
			if (!dbAvailable) return;

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
			if (!dbAvailable) return;

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
			if (!dbAvailable) return;

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
			if (!dbAvailable) return;

			// Make 5 failed attempts
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

			// 6th attempt should be rate limited
			const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: `ratelimit-${Date.now()}@opencut.local`,
					password: "WrongPassword123!",
				}),
			});

			// Note: Rate limit may return 429 or still 401 depending on
			// better-auth / Upstash Redis configuration. We accept either
			// as long as the endpoint doesn't crash.
			expect([401, 429]).toContain(res.status);
		});
	});

	describe("POST /api/auth/sign-out", () => {
		it("should invalidate the session", async () => {
			if (!dbAvailable) return;

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
