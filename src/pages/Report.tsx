import { useParams } from "react-router-dom";
import { PlaceholderPage } from "@/components/PlaceholderPage";

const Report = () => {
  const { type, id } = useParams();
  return (
    <PlaceholderPage route={`/report/${type ?? ":type"}/${id ?? ":id"}`} title="Report" phase="Phase 6.4"
      description="Submit a report on an event or photo. Available to anyone, including signed-out visitors." />
  );
};
export default Report;
