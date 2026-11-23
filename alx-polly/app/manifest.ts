import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ALX Polly",
    short_name: "Polly",
    description: "Create polls, share them by link or QR code, and see the results.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0e0a18",
    theme_color: "#7733df",
    icons: [
      {
        src: "/icons/polly-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/polly-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/polly-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
