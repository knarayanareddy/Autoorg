import requests
from typing import Optional, List, Dict, Any

class AutoOrgClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        })

    def _request(self, method: str, path: str, json_data: Optional[Dict] = None) -> Any:
        url = f"{self.base_url}{path}"
        response = self.session.request(method, url, json=json_data)
        
        if response.status_code >= 400:
            raise Exception(f"AutoOrg API Error: {response.status_code} {response.text}")
            
        return response.json()

    def submit_run(self, workspace_id: str, mission_text: str, mode: str = 'single_org') -> Dict:
        """Submits a new hosted run to the platform."""
        data = {
            "workspaceId": workspace_id,
            "mode": mode,
            "request": {"missionText": mission_text}
        }
        return self._request("POST", "/api/hosted-runs", json_data=data)

    def get_run_status(self, run_id: str) -> Dict:
        """Retrieves the status of a specific run."""
        return self._request("GET", f"/api/hosted-runs/{run_id}")

    def list_workspaces(self) -> List[Dict]:
        """Lists all workspaces accessible by the tenant."""
        return self._request("GET", "/api/workspaces")

    def create_workspace(self, slug: str, display_name: str, isolation_mode: str = 'git') -> Dict:
        """Creates a new isolated workspace."""
        data = {
            "slug": slug,
            "displayName": display_name,
            "isolationMode": isolation_mode
        }
        return self._request("POST", "/api/workspaces", json_data=data)
