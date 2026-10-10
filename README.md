# Storefront Enhancement Visualiser

A prototype for the Innate AI take-home task: discover London venues, inspect storefronts, and prepare planter installations.

Built with Next.js, TypeScript, Tailwind CSS, shadcn/ui and Lucide icons.

## Features

- Find London prospects by area and business type, or search a specific business name or street address using Google Places.
- Compare up to five outdoor Street View candidates and adjust camera direction and framing.
- Save venue references to a project library and configure planter quantity and placement in Studio.
- Upload planter photos, extract transparent assets at Medium quality, refine edges, review versions and export approved cutouts. High quality is disabled in both the interface and API.
- Alternative venue discovery using OpenStreetMap and Mapillary.

Storefront compositing and before/after review are not connected yet.

## Run locally

Requires Node.js **24.x** and npm.

Install dependencies:

```bash
npm ci
```

Copy `.env.example` to `.env.local` and add keys for the features you want:

- `GOOGLE_MAPS_API_KEY`: venue search and Street View. Enable **Places API (New)** and **Street View Static API** in Google Cloud.
- `OPENAI_API_KEY`: planter extraction and optional frontage assessment.
- `MAPILLARY_ACCESS_TOKEN`: photos in the alternative OSM flow.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Supabase client and session setup. Add these to Vercel's environment variables when deploying.

Keep secret API keys server-side; Supabase's publishable key is intended for browser use. Never commit `.env.local`. External API calls may incur charges.

Start the app:

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000). Start with **Venue Search**, or upload a planter from the **Library**.

## Current limits

Projects are saved in your browser. Google images are live previews; only their panorama and framing references are saved. Street View candidates need visual inspection to confirm the entrance.

Direct place search returns up to five London matches in one Text Search request, without prospect category or chain filters. Choose a match, load its available image group, adjust framing if needed, then name and save the project. Search modes run separately; switching modes clears the previous results. Framing changes use the same group-load button and reuse views already loaded in the current session.

Venue search background: [London photograph from Unsplash](https://images.unsplash.com/photo-1513635269975-59663e0ac1ad), bundled locally in `public/london-skyline.jpg`.

Planter uploads and extracted versions are stored in `output/planters/` (gitignored). Planter upload and extraction currently work locally, not in the Vercel demo.

Run `npm run check` for lint, tests and a production build.
