import { PlanterReview } from "@/components/planter-review";

export default async function PlanterReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlanterReview key={id} id={id} />;
}
