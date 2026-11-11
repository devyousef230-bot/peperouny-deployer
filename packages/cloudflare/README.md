# Cloudflare integration

This package will contain server-side Cloudflare API clients and resource provisioning helpers.

Security requirements:
- Accept tokens only through protected server-side flows.
- Never expose tokens to the browser.
- Never write tokens to application logs.
- Request only the Cloudflare permissions required for the selected deployment.
