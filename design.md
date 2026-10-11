# Storefront visualisation — design

## 1. Overview

I built the prototype to find suitable London businesses, capture their real entrances and show how the client's planters could look outside them.

The workflow is:

Find venues -> check the frontage -> prepare the product -> place and render -> review

Venue discovery and frontage selection are automatic. After the user selects a planter, the system proposes its initial position and scale. The user can adjust the layout before requesting the final image, then inspect the result and approve any flagged output. Next.js provides the application; Supabase stores the shared library, images and results.

## 2. Finding suitable venues

Google Places supplies cafes, restaurants, salons and similar businesses within a London search area. The system removes duplicates, checks business type and operational status, and excludes known chains. This identifies likely independents rather than proving ownership.

A vision model checks each frontage. Approval requires a recognisable business, a visible entrance, usable pavement and bare or lightly planted surroundings. A few existing pots are acceptable if there is room for a useful improvement. Heavily planted entrances and locations without visible placement space are rejected.

### Selected examples

The automatic Soho area search selected these three venues:

| Venue | Address and postcode | Why it qualified |
| --- | --- | --- |
| Salon64 | 14 Bateman St, London W1D 3AG | Clearly identified doorway with unplanted pavement alongside it. |
| KOZZEE Cafe Soho | 193 Wardour St, London W1F 8ZF | Recognisable frontage, unobstructed entrance and room for planting. |
| Thirst Bar Soho | 53 Greek St, London W1D 3DR | Matching signage, visible entrance and pavement space suitable for planting. |

Each example shows the original frontage, actual product references and reviewed composition. Final framing and layout can be adjusted in Studio; automatic acceptance applies to the photograph that was assessed. You can find this on the example page on the deployed website.

## 3. Capturing the real entrance

Street View is the first source. Nearby panoramas are ranked by distance, viewing angle and recency. The camera points towards the business location, with a field of view wide enough to include the doorway and pavement. Camera direction, field of view and pitch are retained so an accepted view can be reproduced.

A location pin alone is insufficient: the vision model must confirm the business from visible evidence, normally its signage. It also checks whether the entrance and adjacent ground are clear enough for composition. Moderate perspective or pedestrians elsewhere in the photograph need not make it unusable.

### When the first image is unsuitable

If the correct doorway is visible but poorly framed, its position in the image guides adjustments to camera direction, zoom and vertical angle. The new image is checked again. A wrong-facing or obstructed view instead triggers another camera. After two Street View attempts, the system tries up to two Google Places photos using the same checks. If none passes, it skips the venue. It does not invent an entrance or accept an uncertain identity.

For example, Salon64's Street View images showed other businesses. A branding-only fallback photo was also rejected before a clear exterior photograph passed. Sacred Grounds was skipped because its available images showed the wrong building or interiors. Toi & Moi was rejected for substantial existing planting.

## 4. Preparing and placing the planters

### Reusable product assets

After an extraction is requested, AI automatically isolates the containers and their plants together into a transparent asset. The result is manually reviewed and approved, with brush corrections available where needed. The original photograph remains available for comparison. Optional reconstruction can fill obscured areas, but those inferred details require inspection. An approved extraction can be reused across venues.

### Realistic scale

I use a visible reference to estimate proportions rather than asking the user to enter dimensions.

The vision model identifies a complete reference object, preferably a doorway, and estimates its top and base. Using an assumed physical height, its image height provides an approximate pixels-per-metre ratio. The system uses this to estimate planter size, accounting for foliage above the container and adjusting apparent size according to the proposed ground position.

The current method uses one reference and an assumed camera tilt, so it cannot recover true scene depth. Unreliable references trigger a low-confidence estimate, which the user can adjust. Known product dimensions and calibrated scene measurements would improve accuracy.

### Composition

Studio uses the saved frontage directly. Selecting a planter applies the proposed position and scale; dragging, size and facing controls allow adjustments. This produces a basic preview with contact shadows.

AI Enhance receives that placement guide, the untouched storefront and the actual extracted product references. It integrates perspective, lighting, reflections and ground contact in one image edit. Instructions preserve container count, shape, material, colour and planting rather than asking for generic planters.

Extraction uses `gpt-image-1.5`; enhancement uses `gpt-image-2`, both at Medium. Vision models handle frontage checks, scale estimation and final review. This approach avoids building a 3D asset from one photograph, while allowing plausible changes in viewing angle.

## 5. Quality checks and limitations

A separate automated review compares the finished image with the storefront and product references. A failed, uncertain or unavailable review blocks enhanced-image download until explicit manual approval. The result remains saved for inspection. A new generation requires a deliberate request and another image charge; the system does not automatically regenerate failed reviews. The original and enhanced views can be compared in Studio. For production outreach, only automatically approved results should proceed without intervention; flagged results should remain held for review.

A result should not reach a venue owner if it has:

- Substituted products or missing/extra containers.
- Implausible scale, floating bases, poor shadows or visible background patches.
- Planters blocking access or conflicting with foreground objects.
- Altered signage, people or significant building details.

Full-image enhancement gives coherent lighting and perspective without patch boundaries, but it can change surrounding details. It therefore does not guarantee the brief's requirement that everything else remain unaltered. Product detail and unseen surfaces can also drift. Final inspection remains necessary; automated review and manual overrides are not guarantees of correctness.

## 6. Imagery rights and responsible use

For this take-home, I used Google Street View and Places imagery to test whether the system could find real businesses, capture their actual entrances and create realistic planter concepts. The goal was to demonstrate the idea before contacting venues, not to imply that any business had approved or endorsed a design. The deployed demo shows example results, so this is still a prototype, not a commercially cleared service.

Google's terms restrict certain uses of its imagery, including storing images and creating edited versions from them. Since this prototype saves storefront images and uses them in AI-edited composites, the current approach raises a real issue with those terms. Attribution alone does not resolve it, so I would need to change the image source or obtain the appropriate permissions before using this workflow commercially.

There is also a wider question: just because a property is visible from the street does not mean every photograph of it is free to reuse. I think there is value in showing a venue a relevant, clearly labelled concept before making contact, rather than sending a generic sales message. But the image must not suggest the venue requested or approved the design, and its use must respect the rights attached to the photograph.

For commercial use, I would use venue-provided images, commissioned photography or a provider whose licence allows storage, AI editing and commercial distribution. I would record the source and permitted uses, remove images when their retention period ends, and prevent export when permissions are unclear. Each visualisation would be labelled as a concept, with a simple way for a venue to request changes or removal.

## 7. Cost and operating at scale

### Cost considerations

For an existing approved product and saved storefront image, generating and reviewing a new proposal costs approximately **$0.08–$0.10** in API usage. Venue discovery, image retrieval and preparing new product assets add to this cost. Hosting and storage are separate.

Pricing references: [OpenAI API pricing](https://developers.openai.com/api/docs/pricing) and [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing).

### Scaling the approach

For larger volumes, I would move discovery and rendering into background jobs so tasks can continue if the browser closes. The system would reuse approved product assets and saved results, limit retries, and apply rate limits and spending budgets.

Quality control would remain central. I would measure how often the system selects an unsuitable storefront or produces a poor visualisation, using reviewed examples across different streets and lighting conditions. Uncertain results would go to a review queue, while clear failures would be rejected automatically.

Before supporting thousands of venues each week, I would improve scale estimation using known product dimensions and strengthen checks that the original storefront remains intact. I would also add image-permission checks before results can be exported or used commercially.