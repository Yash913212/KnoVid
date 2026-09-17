from fastapi import Depends, HTTPException, Security, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.db.supabase import supabase

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security), req: Request = None) -> str:
    # Handle the /files route which might pass token in query param
    token = credentials.credentials if credentials else None
    if not token and req and "token" in req.query_params:
        token = req.query_params["token"]
        
    if not token:
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    try:
        res = supabase.auth.get_user(token)
        if not res or not res.user:
            raise ValueError("Invalid session")
        return res.user.id
    except Exception as e:
        print(f"Supabase auth verification failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid Supabase session")

# For routes that might pass token in query string (like /files/<name>)
def get_current_user_optional_query(req: Request) -> str:
    auth_header = req.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    else:
        token = req.query_params.get("token")
        
    if not token:
        raise HTTPException(status_code=401, detail="Missing or invalid token")
        
    try:
        res = supabase.auth.get_user(token)
        if not res or not res.user:
            raise ValueError("Invalid session")
        return res.user.id
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid Supabase session")
