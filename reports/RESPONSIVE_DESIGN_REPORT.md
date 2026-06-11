# Responsive Design Report

## Breakpoint Strategy

| Breakpoint | Width | Navigation | Layout |
|------------|-------|------------|--------|
| Mobile | 320px - 767px | Bottom nav bar + slide-out drawer | Single column, card-based |
| Tablet | 768px - 1023px | Mini sidebar (w-16) | 2-3 column grids |
| Laptop | 1024px - 1279px | Collapsible sidebar (w-64 / w-16) | Full multi-column |
| Desktop | 1280px+ | Full sidebar | Max 6-column, 1400px content |

## Navigation Modes

### Desktop (lg: 1024px+)
- Collapsible sidebar: `w-64` expanded, `w-16` collapsed
- Toggle button in sidebar header
- User profile at bottom
- Full section labels visible when expanded

### Tablet (md: 768px-1023px)
- Mini sidebar with icon-only navigation
- Brand logo icon at top
- No text labels - space efficient
- Avatar at bottom

### Mobile (< 768px)
- Bottom navigation bar with 5 primary items
- Slide-out drawer for full navigation (triggered by hamburger menu)
- "More" button opens bottom sheet for additional items
- Safe area padding for notched phones

## Layout Responsiveness

### KPI Cards
- Mobile: 1 column
- Tablet: 2 columns (sm:grid-cols-2)
- Desktop: 3-6 columns (lg:grid-cols-3, xl:grid-cols-6)

### Content Area
- Max width: 1400px
- Padding: px-3 (mobile) → px-6 (tablet) → px-8 (desktop)
- Bottom padding: pb-16 (mobile for bottom nav) → pb-0 (desktop)

### Tables
- Desktop: Standard sortable table
- Mobile: Converted to card layout with `data-label` fields
- Horizontal scroll: Eliminated

## Charts & Visualizations
- Recharts ResponsiveContainer: 100% width
- Dynamic height: 200-280px depending on chart type
- Proper tooltip positioning
