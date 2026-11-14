/** Visible route for persistent workspaces. */
export const WORKSPACE_ROUTES = ['/', '/compress', '/upscale'] as const;
export function isWorkspaceRoute(pathname: string): boolean {
  return WORKSPACE_ROUTES.some(route => route === pathname);
}
