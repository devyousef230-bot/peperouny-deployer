const API_BASE = "https://api.cloudflare.com/client/v4";

export class CloudflareClient {
  constructor(private readonly apiToken: string) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    const payload = await response.json() as {
      success: boolean;
      errors?: Array<{ message: string }>;
      result: T;
    };

    if (!response.ok || !payload.success) {
      throw new Error(payload.errors?.map((item) => item.message).join(", ") || `Cloudflare API error: ${response.status}`);
    }
    return payload.result;
  }

  verifyToken() {
    return this.request<{ id: string; status: string }>("/user/tokens/verify");
  }
}
