import { useParams } from "react-router-dom";
import { PlaceholderPage } from "@/components/PlaceholderPage";

const HostPublic = () => {
  const { slug } = useParams();
  return (
    <PlaceholderPage
      route={`/hosts/${slug ?? ":slug"}`}
      title="Host page"
      phase="Phase 2.3"
      description="Public host profile: name, logo, bio, contact, list of upcoming and past events."
    />
  );
};

export default HostPublic;
