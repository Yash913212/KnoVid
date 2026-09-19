from supabase import create_client, Client, ClientOptions
from app.core.config import settings

if not settings.supabase_url or not settings.supabase_key:
    raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) must be set")

supabase: Client = create_client(
    settings.supabase_url, 
    settings.supabase_key,
    options=ClientOptions(postgrest_client_timeout=60.0)
)
