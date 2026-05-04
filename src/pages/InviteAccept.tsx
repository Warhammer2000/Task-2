import { useParams } from "react-router-dom";
import { PlaceholderPage } from "@/components/PlaceholderPage";

const InviteAccept = () => {
  const { token } = useParams();
  return (
    <PlaceholderPage route={`/invite/${token ?? ":token"}`} title="Accept invitation" phase="Phase 4.6"
      description="Join a host organization with the role specified in the invite token." />
  );
};
export default InviteAccept;
