# Real-product storefront composition

## Current rendering decision (11 October)

The customer explicitly selected ROBATA Version 3 as the desired visual standard after comparing it with the transparent-layer experiment. **AI Enhance now defaults to GPT Image 2 Medium scene editing.** The model receives the rough placement, untouched scene and product references, and renders a finished installation within the photograph. An RGBA edit mask identifies the placement neighbourhood. Software aligns the generated scene on surrounding features and blends it only into that region, restoring original pixels elsewhere and throughout the attribution footer.

This produces stronger integration of camera perspective, reflected light, exposure and ground contact than the isolated-layer experiment described below. It allows reconstruction of the product in context. It also means local background details inside the edit neighbourhood may change. The assignment's strict requirement for an entirely unaltered building is therefore not guaranteed by this mode; inspect the before/after view. The customer's preference for Version 3 is recorded explicitly, rather than claiming its previous review concerns disappeared.

Version 3 was originally passed by automated review, then manually marked rejected over window/person changes. Following the customer's explicit acceptance, it is approved and downloadable, retaining its review notes. Flagged results can also be approved through the interface, and approved results are labelled **Approved**, not **Checks passed**. The most recently produced or approved render is restored on opening the project.

The restored scene method uses the same default model and Medium quality as Version 3, with one paid request and no automatic image retries. A new ROBATA test cost approximately **$0.0674** for image generation plus its review call. It is stored as Version 7 and under `output/robata-scene-example/`. Existing transparent renders remain in history. The transparent processing path is retained only to recover unfinished older jobs; it is no longer the default.

The sections below record the earlier experiment and its constraints; this decision supersedes their transparent-layer default and automatic rejection policy.

## Objective and source images

The Innate AI assignment asks for a convincing installation of actual client products while leaving the existing building and scene unaltered. This implementation uses the Street View photograph already selected and saved by Venue Search, plus an approved transparent planter asset. It does not require another storefront upload. Plants and their containers remain one arrangement; a pair retains both containers.

The existing Google workflow compares outdoor camera candidates and allows framing adjustments. The saved panorama ID, heading, field of view, capture date and original pixels remain attached to the project. Keep a view with visible pavement, a legible storefront and a reasonably complete scale reference. A newer, clearer photograph remains preferable to synthesising missing storefront detail. Attribution is retained. This project uses the owner's stated permission for Google imagery.

## Pipeline

1. **Extract and approve the product.** Existing Medium extraction removes the background and reconstructs obstructed product areas when needed. Approval remains a human product-identity check. PNG alpha, a cropped mask and placement anchor are retained. New revisions also record separate ground contacts from their lower alpha silhouette. Existing approved assets are analysed on demand without regenerating them.
2. **Analyse the scene and reference once.** A structured vision response describes a complete doorway/person/chair reference, assumed height, pavement slope, entrance, lighting, product shape and container count. Alpha and colour analysis estimate container image height independently of foliage and find each base. Results are cached by saved storefront and approved revision; changing the source invalidates the composition state.
3. **Calculate a starting scale.** At the reference depth, full arrangement height in image fractions is `reference_pixel_height / assumed_reference_metres * assumed_container_metres / container_image_fraction`. Street View FOV, image aspect ratio and its configured downward pitch give an approximate horizon. Moving toward the camera scales the arrangement by its ground distance below that horizon relative to the reference base, with conservative bounds. Unknown physical dimensions, raised door thresholds and inaccurate vision coordinates limit accuracy. A fallback is explicitly labelled low confidence. The user can adjust visual size without entering metres.
4. **Place freely on a fast canvas.** Ground anchors are normalised coordinates. Browser preview and server basic export share the same affine geometry: depth scaling, turn guide, flip and base-slope adjustment. Sampling uses premultiplied alpha to avoid coloured leaf fringes. Each detected container gets its own soft ground contact. Dragging, nudging, duplicating and exporting a basic image make no image-generation calls. This preview cannot reconstruct hidden 3D surfaces.
5. **Render the product's new view.** One Medium image edit receives the rough placement guide, the untouched storefront as context, and deduplicated product references. The prompt identifies each arrangement, count, material, planting, scale, ground position and requested angle. The model can reconstruct visible faces, openings, leaf overlap and perspective, while preserving recognisable product design. Default: `gpt-image-2.5-flare`, native transparent PNG, longest output dimension 1280, model-compatible dimensions. A single photograph supports plausible novel views, not a metrically correct 3D model.
6. **Install only the transparent product layer.** No generated storefront pixels are used. Some image outputs centre and enlarge the subject; the processor restores the intended footprint height, centre and ground level. It rejects opaque scenes, empty layers, excessive solid coverage, extreme scale changes and products outside the allowed region. Local contact occlusion is added beneath each newly rendered base. The layer is sampled to the original camera's resolution before compositing, preventing an excessively sharp studio cutout. The attribution strip and all pixels outside the installation layer stay unchanged relative to the resized original.
7. **Review, compare and export.** A vision check scores identity, grounding and scene preservation, with specific checks for missing containers, substituted products, floating bases and blocked doors. Serious failures are withheld from the export action; uncertain results need manual approval. The UI includes original, placement, enhanced and before/after comparison views, saved versions and separate basic/enhanced downloads. Always inspect the result before sending it to a venue.

## Why the previous enhancement was ineffective

The old path allowed only small smooth colour changes on the original cutout. It could not change its silhouette, visible faces or perspective. An initial full-scene edit during this work did reconstruct the planters, but it also repainted window contents and a nearby person. The automated reviewer missed that defect. That trial is marked rejected in ROBATA's history.

The replacement generates a transparent installation layer and composites it over the original. This gives the model freedom to reconstruct the product without asking it to recreate the building faithfully. Source preservation is enforced by pixel composition, independently of the model's opinion.

## Cost and recovery

- Medium is enforced in image requests. Extraction has its own model setting and approved products are reused.
- Cached geometry and layout fingerprints avoid paying again for an unchanged successful output. A new paid variant requires the explicit regenerate action.
- One image request per enhancement, no automatic paid retries. Basic, raw, final and attempt metadata are retained.
- A saved raw result can be recovered after a processing failure without another image request. Recovery can incur a small vision-review charge.
- The two successful ROBATA image calls were approximately $0.0363 and $0.0364 each. A rejected full-scene trial was approximately $0.0672. Total image testing spend was about $0.14, plus geometry/review calls. These are estimates from response usage and published rates, not a billing statement.
- The app stores image-call usage and its estimated cost on each version. Google imagery is fetched during venue selection/source saving, not for every placement adjustment.

Model references: [Flare model and pricing](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare), [image generation guide](https://developers.openai.com/api/docs/guides/image-generation), [GPT-4.1](https://developers.openai.com/api/docs/models/gpt-4.1).

## ROBATA validation and limits

The saved demonstration uses the actual ROBATA Street View and the approved white planter pair. It includes an automatic-facing variant and a smaller version requesting a 20-degree turn. The latter is the latest output in the project. Position, size and angle were chosen in the placement workflow; this is not evidence of completely automatic scene layout. Local evidence is in `output/robata-example/`, including the transparent layer and a comparison against the previous composition.

Pixel verification of the final example found **zero changed pixels outside the installation layer and zero changed attribution pixels**. Tests also cover anchor stability across turns/flips, separate bases, protected pixels, native transparent output alignment, opaque-output rejection, cache reuse, single image-call recovery, API failure handling and browser placement/export interactions.

Remaining limits are material:

- Absolute scale is estimated. A known product dimension and a calibrated scene reference would be needed for measured accuracy.
- New viewpoints reconstruct unseen material and foliage; fine geometry and small product details can drift. Review against the source product remains necessary.
- There is no full scene depth map or person segmentation. Placing behind a foreground person or railing can give wrong occlusion. Choose clear pavement; the review gate can reject conflicts but cannot guarantee detection.
- Multi-arrangement renders depend on the image model preserving the layout. Global footprint alignment and region checks reject substantial drift, but do not prove each arrangement's exact position.
- Source blur, clutter and Street View stitching limit the final quality. Upscaling does not recover real building detail.
- The current job claim prevents duplicate workers within a server process. Storage state is not a distributed job queue; multi-instance durable jobs and authentication remain deployment work.
- The assignment's fully unattended batch of at least three venues, comprehensive capture fallback/rejection loop and deployed submission are broader than this composition change. This work does not claim those requirements are newly completed.
