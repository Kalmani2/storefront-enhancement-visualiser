# Storefront Enhancement Visualiser

A prototype for the Innate AI take-home task: discover London venues, inspect storefronts, and prepare planter installations.

Built with Next.js, TypeScript, Tailwind CSS, shadcn/ui and Lucide icons.

## Features

- Find London prospects by area and business type, or search a specific business name or street address using Google Places.
- Compare up to five outdoor Street View candidates and adjust camera direction and framing.
- Save the selected Street View with a project, choose approved planters, automatically estimate scale, and drag arrangements onto the storefront.
- Export basic compositions or run a separate Medium AI Enhance edit. Both outputs are retained.
- Upload planter photos, extract transparent assets at Medium quality, refine edges, review versions and export approved cutouts. High quality is disabled in both the interface and API.
- Alternative venue discovery using OpenStreetMap and Mapillary.


## Run locally

Requires Node.js **24.x** and npm.

Install dependencies:

```bash
npm ci
```

Copy `.env.example` to `.env.local` and add keys for the features you want:

- `GOOGLE_MAPS_API_KEY`: venue search and Street View. Enable **Places API (New)** and **Street View Static API** in Google Cloud.
- `OPENAI_API_KEY`: planter extraction, optional frontage assessment, cached scale estimation and optional AI Enhance.
- `MAPILLARY_ACCESS_TOKEN`: photos in the alternative OSM flow.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and `SUPABASE_STORAGE_BUCKET=storefront-assets`: shared database and private image storage. Use the same values locally and on Vercel; the secret key stays server-side.

For a new Supabase project, run `supabase/migrations/202610100001_shared_library.sql` in its SQL Editor once. To copy an existing local planter library, run `npm run import:planters`. It uploads and verifies existing files without generating images or deleting local originals.

Keep secret API keys server-side; Supabase's publishable key is intended for browser use. Never commit `.env.local`. External API calls may incur charges.

Start the app:

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000). Start with **Venue Search**, or upload a planter from the **Library**.

## Current limits

Projects, planter metadata and planter image versions are saved in Supabase. Current browser projects are imported on the next Library visit, keeping a browser backup. The selected Google Street View is saved with the project and loaded automatically in Studio; no storefront upload is needed. Existing Google projects fetch their selected frame once on first opening. This workflow assumes the project owner's stated permission to use, edit and export these images. Mapillary remains a reference in the alternative discovery flow. Street View candidates still need visual inspection.

Direct place search returns up to five London matches in one Text Search request, without prospect category or chain filters. Choose a match, load its available image group, adjust framing if needed, then name and save the project. Search modes run separately; switching modes clears the previous results. Framing changes use the same group-load button and reuse views already loaded in the current session.

Venue search background: [London photograph from Unsplash](https://images.unsplash.com/photo-1513635269975-59663e0ac1ad), bundled locally in `public/london-skyline.jpg`.

Both local and Vercel apps use the same Supabase library. Uploads go directly to private storage; downloads use short-lived signed links. With no Supabase configuration, the local planter tool can still use `output/planters/`. Configured cloud failures never fall back to local files.

This is one shared demo workspace, not a private multi-user application. App library endpoints are public; database access is server-side and browser keys cannot query the tables directly. Keep sensitive data out. Paid planter extraction and AI Enhance are disabled on Vercel by default; `ENABLE_HOSTED_EXTRACTION=true` explicitly enables them. This flag is not authentication. Composition metadata and output versions use the private bucket under `compositions/<project-id>/`; no additional database migration is required.

## Storefront composition

Open a saved Google project from Library and select an approved planter. One `gpt-4.1-mini` visual analysis estimates a familiar storefront reference (usually a doorway), container height and ground position. Geometry converts these estimates to image proportions and adjusts scale with distance while dragging. Estimates are cached per project image and planter revision. If analysis fails, typical proportions provide an explicitly labelled fallback. Absolute dimensions cannot be recovered from these uncalibrated photos. Large camera-angle differences may require another planter asset.

Drag, arrow keys, size/shadow controls, duplication and basic PNG exports do not call an image model. Layouts save automatically. **Save basic output** preserves a downloadable version. **AI Enhance · Medium** saves a basic version and submits one masked image edit, using `OPENAI_IMAGE_MODEL` and the existing key. The result is merged only into the placement regions; the rest of the storefront and the bottom attribution strip retain the original pixels. Review planter identity and realism before sharing. Generated versions never replace the originals. Failed jobs keep the basic output and do not automatically retry paid calls.

Enhancement uses a 1536×1024 Medium output with the composition and up to four unique product reference images; model input charges are additional to output pricing. Its output provides bounded, smooth lighting adjustments and local ground shadows. The original cutout geometry and texture are retained, so a model-generated replacement cannot substitute a different product. Scale analysis is a separate small vision request, cached once per pair. Google image requests occur during venue selection or the first opening of an older unsaved image, not on each drag or export.

Run `npm run check` for lint, tests and a production build.
