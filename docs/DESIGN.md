# Design System and Frontend Standards
## EAK PUSTAK Workspace

- Status: Design direction, to be refined against the existing brand and repository.
- Product character: calm, precise, modern, professional and operational.

## 1. Design objective

The interface should feel like a dependable company workspace, not a flashy marketing site or generic AI dashboard. Optimize for clarity, speed, readability and frequent daily use.

## 2. Inspiration and implementation references

Use references as sources of patterns, not as permission to copy an entire product.

- [21st.dev](https://21st.dev/) — component discovery, interaction patterns, themes and templates.
- [21st MCP documentation](https://docs.21st.dev/mcp) — agent-assisted component search and installation.
- [shadcn/ui](https://ui.shadcn.com/) — accessible, composable component primitives and conventions.
- [Tailwind CSS](https://tailwindcss.com/docs) — utility styling and design tokens.
- [Lucide](https://lucide.dev/) — consistent icon family.
- [Motion](https://motion.dev/) — purposeful transitions and interaction feedback.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) — accessibility target.

Before adding a third-party component:
1. Search for an appropriate pattern.
2. Check its license, dependencies, accessibility and maintenance.
3. Confirm it fits the project's framework and styling conventions.
4. Adapt it to the product's tokens and interaction rules.
5. Remove unnecessary dependencies and visual effects.
6. Test responsive behavior and keyboard access.

## 3. Visual direction

### Layout
- Persistent left navigation on desktop.
- Workspace switcher/department context visible.
- Main content area with clear page title, concise description and primary action.
- Secondary actions grouped consistently.
- Responsive navigation on smaller screens.
- Avoid excessive nested cards.

### Typography
- Use a highly readable sans-serif.
- Establish a clear hierarchy: page title, section title, body, metadata.
- Use tabular numerals for metrics and timestamps where helpful.
- Avoid tiny low-contrast helper text.

### Color
Define semantic tokens rather than hard-coding colors in components:
- background
- surface
- elevated surface
- primary text
- secondary text
- border
- primary action
- success
- warning
- danger
- informational

Choose the exact palette after inspecting the EAK PUSTAK brand assets and current application. Avoid choosing a loud palette without brand evidence. Status colors must remain consistent and accessible.

### Shape and elevation
- Use restrained radii and subtle borders.
- Use shadows only when they clarify layering.
- Avoid glassmorphism and decorative gradients as default surfaces.
- Keep density appropriate for operational tables and forms.

## 4. Shared application shell

Expected structure:
- Company mark and workspace name.
- Workspace/department selector, where user has access.
- Primary navigation.
- Clearly separated administration navigation for authorized users.
- Notifications entry point.
- User profile and account actions.
- Breadcrumbs for deep pages.
- Main content with consistent spacing.

Navigation must be permission-aware, but API authorization remains authoritative.

## 5. Component inventory

Build or adopt consistent versions of:
- Button and icon button
- Text input, textarea, select, combobox
- Date picker and date range
- Checkbox, radio, switch
- Form field, validation message and helper text
- Dialog, alert dialog, popover, dropdown
- Tabs and segmented control
- Data table with sorting, filtering and pagination
- Status badge
- Avatar and avatar group
- Breadcrumbs
- Sidebar and mobile navigation
- Command/search palette (only if useful)
- Toast/inline alert
- Skeleton/loading state
- Empty state
- Error state
- Confirmation pattern
- Activity timeline
- Task card/list row
- Handover status panel
- File attachment control
- Permission-aware action menu

Use a component library where appropriate, but do not create an abstraction for every one-off element.

## 6. Dashboard standards

Dashboard widgets must answer an operational question. Examples:
- My open tasks
- Tasks due soon
- Overdue work
- Pending handovers requiring my action
- Recent activity I am allowed to see
- Department workload summary
- Pending approvals

Rules:
- No fabricated numbers.
- Each metric links to the filtered records behind it.
- Use charts only when they improve a decision.
- Distinguish zero data from loading and failed data.
- Management summaries must use permission-safe aggregates.

## 7. Table and form standards

### Tables
- Clear column labels and row actions.
- Useful filters and search.
- Pagination for large data.
- Preserve filters when navigating back where practical.
- Responsive strategy: horizontal scroll, prioritized columns or mobile list layout.
- Never expose restricted columns in API payloads.

### Forms
- Label every field.
- Mark required fields clearly.
- Validate on the server as well as client.
- Explain validation errors next to the field.
- Preserve entered values after recoverable errors.
- Use confirmation for destructive or irreversible actions.
- Do not ask for data the system already knows.

## 8. Interaction and motion

- Motion should explain state changes, not decorate the screen.
- Keep transitions short and subtle.
- Respect reduced-motion preferences.
- Provide hover, focus, active, disabled and loading states.
- Avoid blocking animations and scroll hijacking.
- A successful action must be confirmed only after the server confirms it.

## 9. Accessibility

Target WCAG 2.2 AA where practical:
- Keyboard-operable navigation and controls.
- Visible focus indicators.
- Correct semantic landmarks and heading order.
- Programmatic labels and accessible names.
- Sufficient text and non-text contrast.
- Do not communicate status using color alone.
- Dialog focus management and Escape behavior.
- Reduced motion support.
- Accessible validation and live feedback.

## 10. Frontend engineering standards

- TypeScript strictness appropriate to the existing codebase.
- Reuse existing project patterns and aliases.
- Separate data fetching, state and presentation sensibly.
- Avoid giant page components.
- Keep server state and local UI state distinct.
- Use typed API contracts and centralized error handling.
- Avoid duplicated permission logic; server remains authoritative.
- Lazy-load expensive screens where appropriate.
- Prevent unnecessary client-side bundles and layout shifts.
- Add component, integration and end-to-end tests for important flows.

## 11. Page quality checklist

Before shipping each page:
- Does the page have one clear primary purpose?
- Is the primary action obvious?
- Can the user understand ownership and status?
- Are loading, empty, error and unauthorized states designed?
- Does the page work at mobile widths?
- Can it be used by keyboard?
- Are labels and contrast accessible?
- Are permissions enforced by the backend?
- Is there unnecessary visual decoration?
- Does the page follow the established design tokens?
