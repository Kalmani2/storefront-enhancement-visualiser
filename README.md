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
- `/studio` displays the selected project and source candidate, and saves planter type, quantity, and placement. Planter assets, image generation, before/after, and review are **placeholders** in this phase. Its Generate button does not call an image API.

The drawn storefronts in the library are explicitly labelled illustrations, not sourced venue imagery. Google Street View remains behind a per-image confirmation both in search and Studio; reopening a Google project requires a fresh live image request.

## Discovery pilot

Enter a London neighbourhood or postcode on the `/osm` page. The server looks up the area and retrieves relevant OpenStreetMap venues. Selecting a business fetches up to five nearby **non-panoramic** Mapillary photo candidates ranked by camera position and direction. Equirectangular 360° images are excluded because displaying them as ordinary flat photos distorts the storefront. Soho uses a bounded pilot area. A nearby photograph is **not** proof that it depicts that venue's entrance; candidates are explicitly labelled unverified.

Copy `.env.example` to `.env.local` and set `MAPILLARY_ACCESS_TOKEN` and `OPENAI_API_KEY`. Both are server-side credentials. The OpenAI API account needs available API credit for photo assessment.

Searching and browsing photos **never calls OpenAI**. The user must select one photo, click **Run 1 paid AI check**, and confirm the browser prompt. That action assesses only that photo. The server permits at most three assessment attempts per running server process and caches successful results for the same venue/photo pair. This is a demo guardrail, **not a global billing ceiling**: restarting or scaling the server resets the process counter. Set a project-level spend limit in your OpenAI account for a real hard cost boundary. Do not expose the verification endpoint publicly without authentication and a persistent quota.

The current discovery run is experimental: public Overpass may time out, Mapillary coverage varies, and no completed three-venue run has been verified yet. Photo links and attribution come from Mapillary; no photo is bundled in the repository.

## Google venue search

The `/google` page uses Google Places (New) and Google Street View Static without replacing the OpenStreetMap/Mapillary pilot. Enter a London area and one business type. Each search makes one billed Places Text Search request, returns up to 12 businesses, and does not request Places photos. Selecting a business requests only Street View metadata (Google documents this endpoint as no-charge). Its camera coordinates are used to aim a 70° field-of-view image at the place. The image itself is requested only after clicking **Load 1 paid Street View image** and confirming. You can adjust the heading by 15° or 30° before that request. The resulting image is displayed temporarily, not saved or edited.

To try it:

1. Create a Google Cloud project with billing enabled.
2. Enable **Places API (New)** and **Street View Static API** in that project.
3. Create an API key, restrict it to those two APIs, and add `GOOGLE_MAPS_API_KEY=...` to `.env.local`. Do not use `NEXT_PUBLIC_` or commit the key. Restart `npm run dev`.
4. Open `http://localhost:3000/google`. Start with Soho and Cafes.
5. Set low daily quotas for both APIs in Google Cloud before experimenting.

There is no application-level Google request cap. Each Places search makes one Google Text Search Pro request (up to 12 results); selecting a venue calls no-charge Street View metadata; the image button makes one Static Street View request after confirmation. Reopening a Google project in Studio also requests Place Details and a new Street View image after confirmation. Google imagery is for live source inspection only; review Google's content-use terms before any compositing, storage, or export. If you deploy with a key, protect these endpoints from public abuse and configure quotas in Google Cloud.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The planter asset and compositing phases have not been implemented yet. Deployment instructions will be added once a live deployment is verified.
