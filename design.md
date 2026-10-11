# Design: storefront capture and planter visualisation

## Approach

Google Places supplies London prospects; Street View or Places photos supply their real entrances. The client's product photographs become reusable planter assets, then scene-aware visualisations. Next.js serves the interface and APIs; Supabase stores discovery decisions, projects, product revisions and renders.

Venue selection and image acceptance are automatic. An operator chooses the product and adjusts its placement. The output is a visual proposal, not a measured installation plan.

## Automated venue selection

An area search combines cafes, restaurants and salons within a London boundary, deduplicates listings and ranks operational businesses with physical street addresses. A known-chain exclusion list screens for likely independents; ownership is not independently verified.

`gpt-4.1-mini` assesses photographs through a structured response. Application code requires:

- Visible evidence confirming the expected business, normally matching signage.
- A usable exterior view of the actual entrance.
- Visible ground for at least one planter beside the entrance.
- Bare or lightly planted frontage with room for improvement.
- Sufficient image quality to judge the doorway and ground.

Wrong or uncertain identity, interiors, hidden entrances, unusable ground and substantial existing planting cannot pass. Moderate perspective and pedestrians away from the placement area are recorded as caveats.

## Image sourcing and fallback

Street geometry and nearby outdoor panorama probes produce cameras ranked by distance, angle and capture date. Initial heading points toward the venue location. Stored framing includes panorama ID, camera coordinates, heading, horizontal field of view (FOV), pitch, dimensions and capture date. A nearby camera does not prove venue identity.

For an identified but poorly framed entrance, normalized doorway coordinates drive correction:

```text
heading correction = atan((2 * entranceCentreX - 1) * tan(FOV / 2))
```

Pitch aims below the doorway centre to include pavement. Corrections are bounded to 30 degrees of heading, FOV 45–90 degrees and pitch −20–15 degrees. Corrected images are reassessed; wrong-facing or obstructed views try another camera.

Each venue receives at most two Street View attempts, then two Places photos under the same acceptance criteria. If none passes, it is skipped. The system never fabricates a replacement storefront. API errors are recorded separately from unsuitable venues.

## Selected venues and evidence

On 11 October 2026, automatic Soho run `d29298e6-e177-489e-b225-3c615e21b4f7` assessed four venues using ten images and selected three without supplied venue names or manual acceptance overrides:

| Venue | Address and postcode | Acceptance evidence / source | Supplied product |
| --- | --- | --- | --- |
| DUCKSOUP | 41 Dean St, London W1D 4PY | Matching sign, visible entrance and bare ground. Street View, October 2022. | `planter_image1.jpg`: rust-coloured rectangular pair. |
| Salon64 | 14 Bateman St, London W1D 3AG | Matching sign, clear doorway and bare pavement. Places photo credited to Salon64; date unknown. | Originally `planter_image2.jpg`: white pair; the current saved example uses the supplied long cream planter (`planter_image5.jpg`). |
| KOZZEE Cafe Soho | 193 Wardour St, London W1F 8ZF | Matching sign, visible entrance and unplanted ground. Street View, October 2025. | `planter_image3.jpg`: black cylinder. |

**Rejections and fallback:** Sacred Grounds was skipped after a church view, an unconfirmed frontage and two interior photos. Salon64 passed only after two wrong-business Street Views and a branding-only photo were rejected. An earlier Toi & Moi attempt failed for substantial existing planting. Successful geometric reframing has automated test coverage but was not demonstrated by this run.

Decisions remain at `/api/frontage-discovery/d29298e6-e177-489e-b225-3c615e21b4f7`. The three venues were rendered; Salon64 received a second layout moving the pair away from the doorway after manual inspection. `/examples` displays saved, approved compositions with originals and product references; deleting a project removes its example.

## Product extraction and compositing

1. **Extract and approve.** `gpt-image-1.5` at Medium isolates containers and their plants together into a transparent PNG. Extraction preserves visible detail; optional reconstruction infers obscured portions. The operator approves a revision. Original photographs, cutouts and base-contact coordinates are retained.
2. **Estimate scale.** `gpt-4.1` identifies a complete doorway, person or chair with an assumed typical height, such as a 2.1 m doorway. Container height is estimated separately from foliage:

   ```text
   arrangement image height = reference image height
     × assumed container metres ÷ reference metres
     ÷ container fraction of the product image
   ```

   Approximate horizon geometry adjusts size with ground depth. Missing references yield a labelled low-confidence fallback. Neither product dimensions nor scene dimensions are measured from a single uncalibrated photograph.
3. **Place.** The saved frontage opens in Studio. Dragging, size, facing, flip and duplication control an affine preview with contact shadows. Basic export uses the same geometry. There is no reconstructed 3D model.
4. **Integrate.** One `gpt-image-2` Medium edit receives the placement guide, untouched storefront and exact extracted products. Constraints specify container count, shape, material, colour, foliage, position and angle. The model resolves perspective, lighting, reflections and grounding. Its complete output is used to avoid seams from blending incompatible backgrounds.
5. **Review.** A separate vision call compares the result with the original scene and product references. Before/after comparison and version history support inspection.

Product references constrain generation but cannot guarantee unseen geometry or fine detail. Full-image generation can alter surrounding details despite preservation instructions; the assignment's requirement that everything else remain unaltered is therefore not guaranteed.

## Rejection criteria

Do not send proposals containing substituted products, missing/extra containers, major scale errors, floating bases, visible background patches, blocked access, changed signage, moved people or material building alterations.

Automated review scores identity, grounding and scene preservation from 1–5. Serious failures or scores ≤2 reject; all scores ≥4 pass; other results require review. Unavailable review also requires inspection. Export requires a pass or explicit manual approval, with overrides recorded. The Salon64 correction demonstrates that model approval cannot replace final inspection before outreach.

## Imagery rights

Image acceptance and reuse permission are separate. API access, public visibility and venue consent are not treated as blanket permission to edit a provider's photograph.

The project owner asserted permission for prototype imagery; the app records that assertion, sources and attribution without independently verifying it. Commercial deployment requires documented rights covering storage, editing and distribution, provider-term compliance, and retention/privacy controls. Otherwise, use licensed, commissioned or venue-supplied photographs. Attribution alone is insufficient evidence of permission.

## Cost controls and scale

Discovery targets three approvals with limits of ten candidates and twenty image/review attempts. Decisions are cached for up to 30 days against source geometry/fingerprints, model and rules version. Changed imagery cannot inherit approval.

Product assets and scale analyses are reused. Placement adjustments incur no image-generation calls. Completed unchanged layouts reuse results; enhancement makes one image request with no automatic paid retry. Saved raw output supports recovery without regeneration.

Local and deployed AI now share a UTC-day allowance of 20 extractions, 40 compositions and 200 vision assessments. Before dispatch, a create-only receipt in the private Supabase bucket reserves a slot; unique object keys enforce the cap across server instances. Failed requests retain their slot, storage errors fail closed, and cached results do not reserve a slot. No database migration is needed. `ENABLE_PAID_AI=false` is an emergency stop; the previous hosted-only flags are no longer used. Google usage is separate: selecting a search result now automatically loads up to five views, while discovery retains its bounded retry budget.

The four submission image calls, including Salon64's correction, recorded estimates of $0.063–$0.072 each, approximately $0.268 total. Google, discovery, calibration and review costs are additional; these are app estimates, not invoices.

At 5,000+ venues per week, browser-driven batches would move to queued workers with durable jobs, account budgets, retention controls and measured acceptance accuracy. Selection and framing would remain automatic; product fidelity and output review remain quality limits.
