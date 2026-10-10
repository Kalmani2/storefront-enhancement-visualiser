# Storefront Enhancement Visualiser

A prototype for the Innate AI take-home task: discover London venues, inspect storefronts, and prepare planter installations.

Built with Next.js, TypeScript, Tailwind CSS, shadcn/ui and Lucide icons.

## Features

- Search active London businesses using Google Places.
- Compare up to five outdoor Street View candidates and adjust camera direction and framing.
- Save venue references to a project library and configure planter quantity and placement in Studio.
- Upload planter photos, extract transparent assets, refine edges, review versions and export approved cutouts.
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

Keys stay server-side. Never commit `.env.local`. External API calls may incur charges.

Start the app:

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000). Start with **Venue Search**, or upload a planter from the **Library**.

## Current limits

Projects are saved in your browser. Google images are live previews; only their panorama and framing references are saved. Street View candidates need visual inspection to confirm the entrance.

Planter uploads and extracted versions are stored in `output/planters/` (gitignored). Planter upload and extraction currently work locally, not in the Vercel demo.

Run `npm run check` for lint, tests and a production build.
