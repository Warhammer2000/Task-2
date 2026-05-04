import { useParams } from "react-router-dom";
import { PlaceholderPage } from "@/components/PlaceholderPage";

const EventDetail = () => {
  const { id } = useParams();
  return (
    <PlaceholderPage
      route={`/events/${id ?? ":id"}`}
      title="Event detail"
      phase="Phase 2.2"
      description="Full event info, RSVP CTA, ticket display when confirmed, feedback form when ended."
    />
  );
};

export default EventDetail;
