import { useParams } from "react-router-dom";
import { PlaceholderPage } from "@/components/PlaceholderPage";

const CheckIn = () => {
  const { id } = useParams();
  return (
    <PlaceholderPage route={`/dashboard/events/${id ?? ":id"}/checkin`} title="Check-in" phase="Phase 5"
      description="Manual code entry, live counters, duplicate prevention, undo last scan. Accessible to host + checker." />
  );
};
export default CheckIn;
