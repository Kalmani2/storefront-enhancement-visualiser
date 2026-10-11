# Storefront visualisation — design

## 1. Overview

The prototype finds suitable London businesses, captures their real entrances and shows how the client's planters could look outside them.

The workflow is:

**Find venues → check the frontage → prepare the product → place and render → review**

Venue selection and photograph acceptance are automated. Product choice and final placement are adjusted in Studio. Next.js provides the application; Supabase stores the shared library, images and results.

## 2. Finding suitable venues

Google Places supplies cafes, restaurants, salons and similar businesses within a London search area. The system removes duplicates, checks business type and operational status, and excludes known chains. This identifies likely independents rather than proving ownership.

A vision model checks each frontage. Approval requires a recognisable business, a visible entrance, usable pavement and bare or lightly planted surroundings. A few existing pots are acceptable if there is room for a useful improvement. Heavily planted entrances and locations without visible placement space are rejected.

### Automatically selected examples

The Soho search selected these venues without being given their names or requiring manual acceptance:

| Venue | Address and postcode | Why it qualified |
| --- | --- | --- |
| DUCKSOUP | 41 Dean St, London W1D 4PY | Matching signage, visible entrance and bare ground beside it. |
| Salon64 | 14 Bateman St, London W1D 3AG | Clearly identified doorway with unplanted pavement alongside it. |
| KOZZEE Cafe Soho | 193 Wardour St, London W1F 8ZF | Recognisable frontage, unobstructed entrance and room for planting. |

The featured gallery includes Salon64, KOZZEE and Thirst Bar Soho (53 Greek St, London W1D 3DR). Thirst was requested by name and initially assessed automatically; the owner then selected a different Street View for the final composition. That frame is labelled manually selected and does not inherit the earlier approval. All three examples show the original frontage, product references and reviewed output; the unseeded discovery evidence above remains separate.

## 3. Capturing the real entrance

Street View is the first source. Nearby panoramas are ranked by distance, viewing angle and recency. The camera points towards the business location, with a field of view wide enough to include the doorway and pavement. Camera direction, field of view and pitch are retained so an accepted view can be reproduced.

A location pin alone is insufficient: the vision model must confirm the business from visible evidence, normally its signage. It also checks whether the entrance and adjacent ground are clear enough for composition. Moderate perspective or pedestrians elsewhere in the photograph need not make it unusable.

### When the first image is unsuitable

If the correct doorway is visible but poorly framed, its position in the image guides adjustments to camera direction, zoom and vertical angle. The new image is checked again. A wrong-facing or obstructed view instead triggers another camera.

After two Street View attempts, the system tries up to two Google Places photos using the same checks. If none passes, it skips the venue. It does not invent an entrance or accept an uncertain identity.

For example, Salon64's Street View images showed other businesses. A branding-only fallback photo was also rejected before a clear exterior photograph passed. Sacred Grounds was skipped because its available images showed the wrong building or interiors. Toi & Moi was rejected for substantial existing planting.

## 4. Preparing and placing the planters

### Reusable product assets

The supplied photographs are processed into transparent assets, keeping each container and its plants together. The original photograph remains available for comparison. Optional reconstruction can fill obscured areas, but those inferred details require review. An approved extraction can be reused across venues.

### Realistic scale

Scene analysis looks for a complete reference object, such as a doorway, person or chair. Its image height and assumed physical height establish an approximate scale. For example, a doorway assumed to be 2.1 metres tall provides a comparison for the estimated container height, excluding foliage.

The calculation accounts for the foliage extending above the container and adjusts apparent size as placement moves closer to or farther from the camera. If there is no reliable reference, the app labels the estimate as low confidence and allows visual adjustment. Exact dimensions cannot be recovered from these uncalibrated photographs.

### Composition

Studio uses the saved frontage directly. The operator chooses a planter, drags it into position and adjusts size and facing. This produces a basic preview with contact shadows.

AI Enhance receives that placement guide, the untouched storefront and the actual extracted product references. It integrates perspective, lighting, reflections and ground contact in one image edit. Instructions preserve container count, shape, material, colour and planting rather than asking for generic planters.

Extraction uses `gpt-image-1.5`; enhancement uses `gpt-image-2`, both at Medium. Vision models handle frontage checks, scale estimation and final review. This approach avoids building a 3D asset from one photograph, while allowing plausible changes in viewing angle.

## 5. Quality checks and limitations

A separate automated review compares the finished image with the storefront and product references. Failed or uncertain results require explicit approval before export. The original and enhanced views can be compared in Studio.

A result should not reach a venue owner if it has:

- Substituted products or missing/extra containers.
- Implausible scale, floating bases, poor shadows or visible background patches.
- Planters blocking access or conflicting with foreground objects.
- Altered signage, people or significant building details.

Full-image enhancement gives coherent lighting and perspective without patch boundaries, but it can change surrounding details. It therefore does not guarantee the brief's requirement that everything else remain unaltered. Product detail and unseen surfaces can also drift. Final inspection remains necessary; automated review and manual overrides are not guarantees of correctness.

## 6. Imagery rights

A usable image is not automatically a reusable image. Public visibility, API access and permission from a venue owner are not treated as blanket permission to edit a provider's photograph.

The project owner has asserted permission for the prototype imagery. Sources and attribution are retained, but the application does not independently verify that permission. Commercial use requires documented rights covering storage, editing and distribution, alongside provider terms and privacy requirements. Where those rights are unavailable, licensed, commissioned or venue-supplied photography is the alternative.

## 7. Cost and operating at scale

Discovery uses bounded attempts rather than unlimited retries. Product assets, image assessments and scale estimates are reused. Placement adjustments do not generate images, and an unchanged completed layout can reuse its render. Each enhancement makes one image-generation request; paid generation is not retried automatically. Shared daily limits cap AI requests.

Recorded example renders cost approximately $0.06–$0.07 each for image generation, with Google requests and vision analysis charged separately.

At 5,000+ venues per week, discovery would move from browser-driven batches to queued background workers, with durable jobs, account budgets and image-retention controls. Selection and framing would remain automatic. Measuring false approvals and product fidelity would be essential before expanding outreach.
