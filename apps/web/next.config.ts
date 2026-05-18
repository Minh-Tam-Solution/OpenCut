import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";
import { withContentCollections } from "@content-collections/next";

const nextConfig: NextConfig = {
	compiler: {
		removeConsole: process.env.NODE_ENV === "production",
	},
	reactStrictMode: true,
	productionBrowserSourceMaps: true,
	output: "standalone",
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "plus.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.marblecms.com",
			},
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
			{
				protocol: "https",
				hostname: "api.iconify.design",
			},
			{
				protocol: "https",
				hostname: "api.simplesvg.com",
			},
			{
				protocol: "https",
				hostname: "api.unisvg.com",
			},
			{
				protocol: "https",
				hostname: "cdn.brandfetch.io",
			},
		],
	},
	async headers() {
		return [
			{
				// Security headers for all routes
				source: "/:path*",
				headers: [
					{
						key: "X-Content-Type-Options",
						value: "nosniff",
					},
					{
						key: "X-Frame-Options",
						value: "DENY",
					},
					{
						key: "Strict-Transport-Security",
						value: "max-age=31536000; includeSubDomains",
					},
					{
						key: "Referrer-Policy",
						value: "strict-origin-when-cross-origin",
					},
					{
						key: "Permissions-Policy",
						value: "camera=(), microphone=(self), geolocation=()",
					},
				],
			},
			{
				// CSP + COOP/COEP for editor routes (allows WASM, workers, blobs)
				source: "/editor/:path*",
				headers: [
					{
						key: "Cross-Origin-Opener-Policy",
						value: "same-origin",
					},
					{
						key: "Cross-Origin-Embedder-Policy",
						value: "require-corp",
					},
					{
						key: "Content-Security-Policy",
						value:
							"default-src 'self'; " +
							"script-src 'self' 'wasm-unsafe-eval'; " +
							"style-src 'self' 'unsafe-inline'; " +
							"worker-src 'self' blob:; " +
							"connect-src 'self' https://api.marblecms.com; " +
							"media-src 'self' blob:; " +
							"img-src 'self' blob: data: https://images.unsplash.com https://plus.unsplash.com https://images.marblecms.com https://lh3.googleusercontent.com https://avatars.githubusercontent.com https://api.iconify.design https://api.simplesvg.com https://api.unisvg.com https://cdn.brandfetch.io",
					},
				],
			},
			{
				// Strict CSP for non-editor routes
				source: "/((?!editor).*)",
				headers: [
					{
						key: "Content-Security-Policy",
						value:
							"default-src 'self'; " +
							"script-src 'self'; " +
							"style-src 'self' 'unsafe-inline'; " +
							"img-src 'self' data: https://images.unsplash.com https://plus.unsplash.com https://images.marblecms.com https://lh3.googleusercontent.com https://avatars.githubusercontent.com https://api.iconify.design https://api.simplesvg.com https://api.unisvg.com https://cdn.brandfetch.io",
					},
				],
			},
		];
	},
};

export default withContentCollections(withBotId(nextConfig));
