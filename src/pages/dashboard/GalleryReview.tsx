import { useParams } from "react-router-dom";
import { PlaceholderPage } from "@/components/PlaceholderPage";

const GalleryReview = () => {
  const { id } = useParams();
  return (
    <PlaceholderPage route={`/dashboard/events/${id ?? ":id"}/gallery-review`} title="Gallery review" phase="Phase 6.2"
      description="Approve or hide photos uploaded by attendees." />
  );
};
export default GalleryReview;
