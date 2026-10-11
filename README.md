# Storefront Enhancement Visualiser

[Open the live app](https://storefront-enhancement-visualiser.vercel.app) · [View examples](https://storefront-enhancement-visualiser.vercel.app/examples)

Find London businesses with under-dressed frontages and preview the client's planters outside their real entrances. The app combines venue search, automatic frontage checks, reusable planter assets and AI-assisted composition.

Built with Next.js, TypeScript and Supabase. See [design.md](design.md) for the approach and tradeoffs.

## Features

- Automatically discover suitable venues in a London area, or search a specific business or address.
- Capture and assess real entrances using Street View, with Places photos as a fallback.
- Save venues and storefront images in a shared project library.
- Extract transparent planter assets from product photos, review them and reuse them across projects.
- Estimate scale and adjust planter position, size and facing in Studio.
- Generate enhanced proposals, compare before/after views and download saved results.

## Run locally

You need **Node.js 24.x**, npm, a Supabase project, and Google Maps and OpenAI API credentials for the full workflow.

### 1. Install and configure

```bash
npm ci
```

Copy `.env.example` to `.env.local` and fill in:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_MAPS_API_KEY` | Venue search and imagery. Enable **Places API (New)** and **Street View Static API** in Google Cloud. |
| `OPENAI_API_KEY` | Automatic frontage checks, planter extraction, scale analysis and AI Enhance. |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase browser key. |
| `SUPABASE_SECRET_KEY` | Server-only database and storage credential. |
| `SUPABASE_STORAGE_BUCKET` | Keep the default `storefront-assets`. |

`MAPILLARY_ACCESS_TOKEN` is optional, for the alternative OpenStreetMap/Mapillary search. Model settings already have defaults in `.env.example`.

Keep `.env.local` out of Git. API calls can incur charges; viewing saved examples does not generate new images or call Google.

### 2. Set up storage

Run these files in the Supabase SQL Editor, in order:

1. [Shared library migration](supabase/migrations/202610100001_shared_library.sql) — creates the library tables and private storage bucket.
2. [Frontage discovery migration](supabase/migrations/202610110001_frontage_discovery.sql) — stores automatic selection and image assessments.

A new Supabase project starts with an empty library. Upload your own product photos and save venues to populate it.

### 3. Start the app

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000).

## Using the app

In **Venue search**, search for a business/address or use **Discover** to find suitable prospects automatically. Review the returned frontage and save it as a project.

In **Library**, upload a product photograph, extract the planter and review the cutout. Containers and their plants stay together as one arrangement.

Open a saved project to enter **Studio**. Its frontage loads automatically; no separate storefront upload is needed. Choose a planter, adjust its position and scale, then export a basic composition or use **AI Enhance** to integrate perspective, lighting and shadows. Compare the result with the original before approving and sharing it.

## Current limits and costs

- Scale is approximate, based on assumed reference dimensions. Novel angles and obscured product details are inferred; there is no full 3D reconstruction.
- Full-image enhancement can alter storefront details. Automated checks can miss defects, and manual approval is available. Inspect products, signage and access before sharing.
- This is a shared demo workspace with public application endpoints, without separate private user accounts. Local and deployed apps share data when configured with the same Supabase project. Use only imagery you have permission to store, edit and distribute.
- Discovery targets three approvals but can return fewer when imagery is unsuitable or its attempt budget is exhausted. Refreshing pauses a discovery batch; use Resume to continue.

All image generation uses **Medium**. Recorded composition examples cost approximately **$0.06–$0.075 per image**, excluding Google requests and vision analysis. Extraction uses `gpt-image-1.5`; enhancement uses `gpt-image-2`. Actual charges vary with inputs and output size.

Shared daily AI limits are **20 extractions, 40 compositions and 200 vision assessments**, resetting at midnight UTC. Failed attempts count; cached results and basic editing do not. Google charges are separate. Set `ENABLE_PAID_AI=false` to disable paid AI requests while keeping saved results available.

## Deploy and check

For Vercel, use Node.js 24 and configure the same environment variables as locally. Apply both Supabase migrations before using a new database, then deploy.

```bash
npm run check
```

This runs lint, unit tests and a production build. For browser tests, start the app and run `npx playwright test`; set `PLANTER_TEST_URL` to your local URL, since tests default to port 3100. Browser tests mock paid providers and use Google Chrome.

London background photograph: [Unsplash](https://images.unsplash.com/photo-1513635269975-59663e0ac1ad).
