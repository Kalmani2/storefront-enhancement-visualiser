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

## Discovery pilot

Enter a London neighbourhood or postcode on the home page. The server looks up the area and retrieves relevant OpenStreetMap venues. Selecting a business fetches up to five nearby **non-panoramic** Mapillary photo candidates ranked by camera position and direction. Equirectangular 360° images are excluded because displaying them as ordinary flat photos distorts the storefront. Soho uses a bounded pilot area. A nearby photograph is **not** proof that it depicts that venue's entrance; candidates are explicitly labelled unverified.

Copy `.env.example` to `.env.local` and set `MAPILLARY_ACCESS_TOKEN` and `OPENAI_API_KEY`. Both are server-side credentials. The OpenAI API account needs available API credit for photo assessment.

Searching and browsing photos **never calls OpenAI**. The user must select one photo, click **Run 1 paid AI check**, and confirm the browser prompt. That action assesses only that photo. The server permits at most three assessment attempts per running server process and caches successful results for the same venue/photo pair. This is a demo guardrail, **not a global billing ceiling**: restarting or scaling the server resets the process counter. Set a project-level spend limit in your OpenAI account for a real hard cost boundary. Do not expose the verification endpoint publicly without authentication and a persistent quota.

The current discovery run is experimental: public Overpass may time out, Mapillary coverage varies, and no completed three-venue run has been verified yet. Photo links and attribution come from Mapillary; no photo is bundled in the repository.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The planter asset and compositing phases have not been implemented yet. Deployment instructions will be added once a live deployment is verified.
