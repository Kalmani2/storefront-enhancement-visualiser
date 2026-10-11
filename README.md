# Storefront Enhancement Visualiser

A prototype for the Innate AI take-home task: discover London venues, inspect storefronts, and prepare planter installations.

Built with Next.js, TypeScript, Tailwind CSS, shadcn/ui and Lucide icons.

## Features

- Automatic frontage discovery: mixed business searches, entrance/identity/placement checks, one Street View retry and Google Places photo fallback. Approved venues are saved separately from projects and reused without repeated vision calls.
- **Search** a named business or address; **Discover** automatically finds three suitable new venues in a London area.
- **Submission examples** shows automatically selected venues with before/after images, supplied planter references, addresses and selection reasons. Open it from Library or at `/examples`.
- Compare up to five outdoor Street View candidates and adjust camera direction and framing.
- Save the selected Street View with a project, choose approved planters, automatically estimate scale, and drag arrangements onto the storefront.
- Export basic compositions or run a separate Medium AI Enhance edit. Both outputs are retained.
- Edit project names, venue details and notes; edit planter names and notes. Delete items with confirmation, including their stored images. Planters referenced by saved compositions cannot be deleted.
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

For automatic discovery, also run `supabase/migrations/202610110001_frontage_discovery.sql`. Open **Venue search**, enter an area under **Discover**, and select **Discover 3 venues**. Defaults: 3 new approvals, at most 10 businesses and 20 image/vision requests. Approved views and failed checks are reused. Refreshing pauses a run; Resume explicitly continues its existing budget. `OPENAI_FRONTAGE_MODEL` defaults to `gpt-4.1-mini`. Set `ENABLE_HOSTED_DISCOVERY=true` in Vercel only when you want to enable confirmed paid discovery there; saved previews do not invoke vision. Image reuse requires appropriate rights, independent of visual approval.

Keep secret API keys server-side; Supabase's publishable key is intended for browser use. Never commit `.env.local`. External API calls may incur charges.

Start the app:

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000). Start with **Venue Search**, or upload a planter from the **Library**.

## Current limits

Projects, planter metadata and planter image versions are saved in Supabase. Current browser projects are imported on the next Library visit, keeping a browser backup. The selected Google Street View is saved with the project and loaded automatically in Studio; no storefront upload is needed. Existing Google projects fetch their selected frame once on first opening. This workflow assumes the project owner's stated permission to use, edit and export these images. Mapillary remains a reference in the alternative discovery flow. Street View candidates still need visual inspection.

The top Search bar returns up to five London matches in one Text Search request, without prospect category or chain filters. Choose a match and either check its frontage automatically or load and choose a view manually. Discover below performs the automated prospect selection and image checks; manual project saves are not automatic approvals. Framing changes reuse views already loaded in the current session.

Venue search background: [London photograph from Unsplash](https://images.unsplash.com/photo-1513635269975-59663e0ac1ad), bundled locally in `public/london-skyline.jpg`.

Both local and Vercel apps use the same Supabase library. Uploads go directly to private storage; downloads use short-lived signed links. With no Supabase configuration, the local planter tool can still use `output/planters/`. Configured cloud failures never fall back to local files.

This is one shared demo workspace, not a private multi-user application. App library endpoints are public; database access is server-side and browser keys cannot query the tables directly. Keep sensitive data out. Paid planter extraction and AI Enhance are disabled on Vercel by default; `ENABLE_HOSTED_EXTRACTION=true` explicitly enables them. This flag is not authentication. Composition metadata and output versions use the private bucket under `compositions/<project-id>/`; no additional database migration is required.

## Storefront composition

Open a saved Google project from Library and choose an approved planter. The saved Street View is used automatically. Cached visual analysis identifies a plausible scale reference, camera direction, pavement slope and lighting. Alpha analysis finds separate container bases and estimates the visible container fraction. Geometry translates the assumed dimensions into image proportions and adjusts size with distance. These are approximate dimensions, not a survey; adjust the size when the reference is unclear.

Drag, arrow keys, size, facing, flip, duplication and basic PNG exports are free of image API calls. The placement canvas is an affine guide, not a 3D model. **AI Enhance / Medium** sends that guide, the untouched storefront and the exact product references to **gpt-image-2**. It reconstructs the visible container faces and planting directly within the street photograph, harmonising perspective, lighting, reflections and ground contact together. The complete generated photograph is used directly, without a spot mask, alignment or regional blending. The prompt explicitly preserves building geometry, brickwork, lettering, windows, people, pavement, camera framing and photographic texture. Generated details can still drift, so compare with the original before sharing. The previous spot-edit method remains in the code for legacy jobs, and its saved results stay in history. New results are labelled Full image; previous regional results are labelled Spot render.

Use **Facing** to match the storefront automatically or request an angle between -60 and +60 degrees. **Compare** provides a before/after slider. Completed outputs remain in the project, including their original layout. An unchanged layout reuses its finished render; **Generate another version** explicitly requests a new paid image. Failed jobs keep the basic output and never retry image generation automatically. If a paid raw image exists but processing failed, **Recover saved render** retries processing and review without another image generation charge.

A separate visual review checks product identity, grounding, entrances and scene preservation. Flagged images need approval before export; the reviewer can approve a result with concerns. Approved results retain their review notes. This is a practical review gate, not a guarantee of product fidelity. Inspect every sales proposal: a single product photo cannot reveal hidden surfaces, exact dimensions or reliable foreground occlusion. Choose clear pavement away from people, steps and entrances.

Models use the same server-side OpenAI key:

- Extraction: `OPENAI_IMAGE_MODEL`, default `gpt-image-1.5`, Medium.
- Scene integration: `OPENAI_COMPOSITION_MODEL`, default `gpt-image-2`, Medium.
- Geometry and final review: `OPENAI_COMPOSITION_VISION_MODEL`, default `gpt-4.1`.

The tested 1280 x 960 ROBATA scene renders cost approximately **$0.067 each for image generation**, using reported tokens and published model rates. Analysis and review are separate small charges (roughly $0.006-$0.01 per vision call in this example). Costs vary with model, dimensions and references. The saved output displays the image generation estimate; it is not an account invoice. No High option is exposed or accepted for image generation.

The ROBATA example is saved in the shared project and locally under `output/robata-example/` (previous transparent-render experiment); the restored scene-edit example is in `output/robata-scene-example/`. See [design.md](design.md) for the pipeline, assignment requirements and remaining limits.

Run `npm run check` for lint, unit tests and a production build. Browser tests: start the app, then `npx playwright test` (set `PLANTER_TEST_URL` if using a port other than 3100). Browser tests mock paid providers.
