# Storefront Enhancement Visualiser

Prototype for the Innate AI storefront capture and visualisation take-home task.

Stack: Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, Lucide icons, Vitest, and React Testing Library.

## Getting started

Requires Node.js 20.9 or newer and npm.

```bash
npm ci
npm run dev
```

Open http://localhost:3000.

Add shadcn/ui components as needed with `npx shadcn@latest add <component>`.

## App workflow

- `/` is the project library. It starts with three real Soho venue **records**, not three verified storefront images. New projects and planter choices persist in this browser's local storage; they are not shared across devices.
- `/google` is the primary venue search. Search a London area and business type, inspect a Street View candidate, enter your own project name, then add it to the library and open `/studio`. Only your label, Google Place ID, and optional panorama/framing reference are saved; the Google image itself is not saved.
- `/osm` preserves the OpenStreetMap/Mapillary search. A selected nearby image candidate can be added to a project, but it is not automatically a verified entrance.
- `/studio` displays the selected project and source candidate, and saves planter type, quantity, and placement. Storefront composition remains a **placeholder**. Its Generate button does not call an image API. Reusable planter extraction and asset review are implemented separately in the Library.

The drawn storefronts in the library are explicitly labelled illustrations, not sourced venue imagery. Google Street View remains behind a per-image confirmation both in search and Studio; reopening a Google project requires a fresh live image request.

## Discovery pilot

Enter a London neighbourhood or postcode on the `/osm` page. The server looks up the area and retrieves relevant OpenStreetMap venues. Selecting a business fetches up to five nearby **non-panoramic** Mapillary photo candidates ranked by camera position and direction. Equirectangular 360° images are excluded because displaying them as ordinary flat photos distorts the storefront. Soho uses a bounded pilot area. A nearby photograph is **not** proof that it depicts that venue's entrance; candidates are explicitly labelled unverified.

Copy `.env.example` to `.env.local` and set `MAPILLARY_ACCESS_TOKEN` and `OPENAI_API_KEY`. Both are server-side credentials. The OpenAI API account needs available API credit for photo assessment.

Searching and browsing photos **never calls OpenAI**. The user must select one photo, click **Run 1 paid AI check**, and confirm the browser prompt. That action assesses only that photo. The server permits at most three assessment attempts per running server process and caches successful results for the same venue/photo pair. This is a demo guardrail, **not a global billing ceiling**: restarting or scaling the server resets the process counter. Set a project-level spend limit in your OpenAI account for a real hard cost boundary. Do not expose the verification endpoint publicly without authentication and a persistent quota.

The current discovery run is experimental: public Overpass may time out, Mapillary coverage varies, and no completed three-venue run has been verified yet. Photo links and attribution come from Mapillary; no photo is bundled in the repository.

## Google venue search

The `/google` page uses Google Places (New) and Google Street View Static without replacing the OpenStreetMap/Mapillary pilot. Search a London area and a relevant business category: cafes, restaurants, bars/pubs, hair salons or clothing boutiques. Soho uses a deliberately small central-Soho search rectangle. Other neighbourhoods/postcodes first resolve to a small London rectangle.

### Prospect selection

Each search retrieves up to 20 listings with strict category and area restrictions, then excludes missing/unknown operating status, temporary/permanent closure, future opening dates, service-area-only businesses, known chains, premises contained inside another venue/complex, and addresses indicating internal or non-ground-floor units. The UI shows exclusion counts and the evidence for each shortlisted prospect. `OPERATIONAL` means Google's listing status, not that the business is open at this hour. The known-chain list is a transparent heuristic, not proof of independent ownership; street addresses do not prove usable pavement or bare frontages.

The selection field mask stays in Places **Pro**: no ratings, review counts, opening hours, website or Places Photos requests. A Soho search uses one Text Search Pro request; other areas use one additional area-resolution Text Search Pro request. No AI is called.

### Camera sourcing and framing

Selecting a prospect does not load photos. The server first matches the business address street against a tiny live OpenStreetMap road-geometry extract (not OSM imagery). It projects the business pin onto that street and probes seven nearby positions with no-charge Street View metadata, `source=outdoor` and an 8m search radius. Cameras must have conservative Google-only attribution, lie within 7m of the matched street and be 4–45m from the business pin. Contributor/unknown attribution, rear-street cameras and duplicate panoramas are excluded. There is no arbitrary nearest-camera fallback when the address street cannot be matched.

Up to **five distinct cameras** are ranked by estimated across-street alignment, distance and capture date. Headings target the venue pin; field of view adapts to distance. The picker lets the user compare cameras, adjust direction/framing and load either the selected view or the pending batch (maximum five), always after confirmation. Image requests pin the exact metadata-screened panorama through a signed, venue-bound, expiring reference; they do not repeat a nearest-panorama lookup. Previously loaded frames are reused in the current picker session only. Projects remember the selected panorama/framing, not image bytes. Studio revalidates the source before loading and refuses to silently replace a missing saved camera.

**Limits:** Static Street View has no documented Google-car-only filter. `source=outdoor` excludes indoor/unknown collections; attribution and street geometry are conservative source checks, not a guaranteed capture-device classifier. A correct outdoor camera can still show a parked car, market stall, outdated business or mislocated entrance. Neither independence nor visible frontage is automatically verified here; image evaluation/rejection remains a later phase. Live checks found and excluded a rear-street wall camera, but also found market-stall occlusion on Berwick Street and a business pin aimed at a church entrance. These are not labelled successful storefront captures.

References: [Street View request parameters](https://developers.google.com/maps/documentation/streetview/request-streetview), [metadata](https://developers.google.com/maps/documentation/streetview/metadata), [Places Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search), [OpenStreetMap attribution](https://www.openstreetmap.org/copyright).

To try it:

1. Create a Google Cloud project with billing enabled.
2. Enable **Places API (New)** and **Street View Static API** in that project.
3. Create an API key, restrict it to those two APIs, and add `GOOGLE_MAPS_API_KEY=...` to `.env.local`. Do not use `NEXT_PUBLIC_` or commit the key. Restart `npm run dev`.
4. Open `http://localhost:3000/google`. Start with Soho and Cafes.
5. Set low daily quotas for both APIs in Google Cloud before experimenting.

There is no application-level global Google request cap. Each confirmed image is one Static Street View request against the account's monthly allowance; each adjusted framing is another request if not already loaded in this session. Reopening a Google project in Studio also requests Place Details Pro and a new Street View image after confirmation. No OpenAI requests are made anywhere in this Google pipeline. Google imagery is for live source inspection only; review Google's content-use terms before any compositing, storage, or export. If you deploy with a key, protect these endpoints from public abuse and configure quotas in Google Cloud. The public OSM geometry endpoint is suitable for this small prototype, not a production-scale dependency; failures are explicit and require a retry or another venue.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Storefront compositing is not implemented. Deployment instructions will be added once a live deployment is verified.

## Local planter library and asset review

Open the Library at `/` and use **Add a planter image**. JPEG, PNG and WebP files up to 20 MB are supported. Uploading saves the original and opens `/planters/[id]`; it makes no paid API call.

On the review page, optionally draw a target rectangle and describe the intended arrangement. Containers and their own plants are processed together. **Extract visible** requests a faithful cutout of visible regions. **Complete hidden parts** additionally asks AI to reconstruct occlusions and cropped bases. Both use generative image editing, so product details need visual review; reconstruction cannot recover unknowable hidden geometry exactly. Neither mode produces a 3D mesh.

**Extract planter asset** makes one paid `POST https://api.openai.com/v1/images/edits` request, using `OPENAI_API_KEY` and `gpt-image-1.5` by default. `OPENAI_IMAGE_MODEL` can override the model, but it must support editing, transparent PNG, and the selected quality. Medium and high quality are available; medium is the initial setting. No other external image provider, Python installation or GPU is required. API credit and access to the configured image model are required.

The request runs after the local HTTP response, and the page polls the saved job. Leaving the page does not cancel extraction. There are no automatic paid retries. Duplicate extraction requests for the same planter are rejected. Interrupted jobs can be retried explicitly; an API timeout may still have been billed. This implementation uses the local Node process and filesystem, not a durable hosted job queue. Planter write endpoints accept local same-origin requests only.

Results must contain actual alpha transparency; opaque backgrounds are rejected. Review a result over checkerboard, light or dark backgrounds, inspect its alpha mask, and compare earlier versions. **Refine edges** opens an erase/restore brush with undo and saves a new version without an API call. Restore uses pixels from that generated result; it cannot reveal source details the model omitted. **Set ground contact** adjusts the placement anchor. **Create another asset from photo** reuses the source for extracting another individual planter or arrangement.

All files persist under `output/planters/<asset-id>/`, which is gitignored:

- `original.jpg|png|webp`: original upload bytes.
- `source.png`: orientation-corrected source, limited to 4096 pixels on its longest side.
- `asset.json`: name, settings, job status, version history, prompts and provider usage.
- `attempt-<job-id>.json` and, if returned, `attempt-<job-id>-raw.png`: each new API attempt, including errors and rejected images.
- `v-<revision-id>.png`, `v-<revision-id>-mask.png`, `v-<revision-id>-raw.png`: versioned cutout, alpha mask and untrimmed result.
- After approval: `planter.png`, `mask.png`, `placement.json`. An older approved export survives failed retries. Physical height is unspecified; the anchor is normalized to the approved PNG.

To import the three supplied photos without a paid request, run `node scripts/planter-smoke.mjs` while a server is running on port 3100. Set `PLANTER_TEST_URL` for another port. Existing matching imports are reused. Add `--generate` to explicitly run paid extraction for samples without a saved version; add `--retry` to regenerate existing results. The runner stops on credit or credential errors.

Browser verification: run `npx playwright test` against the local server on port 3100. The test uses installed Google Chrome and mocks the image API, so it makes no paid requests. It covers upload, target selection, extraction progress, brush edits, version selection, approval, reload, download links and mobile layout. Unit tests also cover real alpha processing, file persistence, duplicate jobs, interrupted jobs, rejected opaque results and billing failures.

`NEXT_DIST_DIR` can select an isolated Next build directory when running alongside another dev server. For example, set it to `.cache/next-planters` and run `npm run dev -- --port 3100`.
