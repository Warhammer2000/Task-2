import { useParams } from "react-router-dom";
import { PlaceholderPage } from "@/components/PlaceholderPage";

const EventEdit = () => {
  const { id } = useParams();
  return (
    <PlaceholderPage route={`/dashboard/events/${id ?? ":id"}/edit`} title="Edit event" phase="Phase 4.2"
      description="Update fields, publish/unpublish/duplicate." />
  );
};
export default EventEdit;
