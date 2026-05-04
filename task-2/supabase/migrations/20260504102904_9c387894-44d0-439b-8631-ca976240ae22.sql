GRANT EXECUTE ON FUNCTION public.is_host_member(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_host_role(uuid, uuid, public.app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.event_host_id(uuid) TO anon, authenticated;