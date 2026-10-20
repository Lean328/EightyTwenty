# BOS experience audit and navigation contract

Audited before implementation, 20 October 2026, on `main` at `24c1df1`.
The complete screen/action inventory is in `FRONTEND_AUDIT.md`. This document
records the structural redesign contract. The application is Django Admin,
using live server-rendered forms, scoped querysets and real session authentication.
No replacement SPA or backend changes are required.

## Old to new navigation

Each destination retains its existing URL, server permission check and deep links.
The frontend enhances only the links already supplied to the current user.

| Existing area | Existing destination/key | New workspace |
|---|---|---|
| Home | `index` | Overview |
| Home | `view:bos_reports` | Insights |
| Daily operations | `view:bos_schedule` | Operations |
| Daily operations | `orders.order` | Operations |
| Daily operations | `pos.cashshift` | Finance |
| Daily operations | `pos.tilltransaction` | Finance |
| Daily operations | `pos.promotion` | Finance |
| Daily operations | `bookings.booking` | Operations |
| Daily operations | `enquiries.enquiry` | Operations |
| Daily operations | `bookings.bookingrule` | Settings |
| Menu | `menu.menuitem` | Content Studio |
| Menu | `view:bos_availability` | Operations |
| Menu | `menu.category` | Content Studio |
| Menu | `menu.locationmenuitem` | Content Studio |
| Menu | `menu.modifiergroup` | Content Studio |
| Menu | `menu.modifieroption` | Content Studio |
| Menu | `menu.dietarytag` | Content Studio |
| Menu | `enquiries.cateringpackage` | Content Studio |
| Locations | `locations.location` | Content Studio |
| Locations | `locations.openinghours` | Settings |
| Locations | `locations.specialhours` | Settings |
| Locations | `locations.locationimage` | Content Studio |
| Locations | `pos.tilltable` | Operations |
| Website | `cms.page` | Content Studio |
| Website | `cms.contentblock` | Content Studio |
| Website | `cms.navigationitem` | Content Studio |
| Website | `cms.offer` | Content Studio |
| Website | `cms.faq` | Content Studio |
| Website | `media.mediaasset` | Content Studio |
| Website | `core.sitesettings` | Settings |
| People | `accounts.user` | Administration |
| People | `accounts.customer` | Customers |
| People | `accounts.staffassignment` | Administration |
| People | `accounts.customerprofile` | Customers |
| People | `loyalty.loyaltycard` | Customers |
| People | `loyalty.giftcard` | Customers |
| System | `view:bos_system` | Administration |
| System | `notifications.emailmessage` | Administration |
| System | `notifications.pushdevice` | Administration |
| System | `core.auditlog` | Administration |

## Workflow preservation checklist

- Overview: all four KPIs, five permission-dependent attention queues, reservation
  review, today's schedule, trend and daily figures, enquiry mix, location health,
  recent activity, location/period filters and quick links.
- Operations: order receipt/modifiers/payments/refunds/timeline and transitions;
  reservation guest details/notes/timeline and permitted transitions; schedule
  date/location/capacity/actions; availability search/category/scoped POST toggle;
  enquiry types/message/contact/reply/status; till tables and their forms.
- Customers: customer identity/profile, coffee stamps/history, gift balances/history,
  recent orders/bookings/enquiries, account editing and original permissions.
- Finance: cash shifts/reconciliation, transaction values/states, promotions,
  original search/filter/sort and record forms. Order payments remain on orders.
- Content Studio: menu/prices/photos/modifiers/dietary labels and inlines, local
  overrides, catering, location details/images, CMS pages/blocks/navigation/offers/
  FAQs, media upload/picker/lightbox. Keep upload/related widgets and management forms.
- Insights: sales/refunds/cash variance, time series, tenders/channels, location and
  bestseller breakdowns; reservations/status/heatmap/party/lead/channel/location;
  enquiry pipeline/types; menu availability/category prices; CSV and printing.
- Settings/Admin: booking rules, hours/exceptions/site singleton, team/assignments/
  roles, email status/retry, push devices, activity, system health and profile/password.
- Shared: create/edit/delete/history/confirmation, bulk actions, pagination,
  search/filter/sort/date hierarchy, CSRF and errors, media, autocomplete popups,
  theme, keyboard navigation, mobile drawer, page finder and no-JavaScript fallback.

Deletion policy: the existing shared `RoleAccessMixin` denies deletion for every
role, including the chain owner. Records are hidden/deactivated instead. This
policy remains unchanged; no delete control or bypass has been introduced.

## Interaction and layout decisions

Six primary workspace links; Settings and Administration are compact utilities.
Frequently used destinations are one click away in contextual navigation. A grouped,
searchable workspace directory exposes secondary destinations in two clicks.
The global page finder searches all permitted destinations. Unknown future links
fall back to Administration rather than disappearing. Original links remain as a
no-JavaScript fallback. Editors group existing fieldsets and inlines into an
accessible section rail; all inputs, POST targets and hidden management fields stay
inside their original form. Lists retain their real Django result table and tools.

## Backend dependencies, intentionally unchanged

No payout interface or payment-provider configuration screen exists in this source.
Paid app ordering still depends on an unconfigured provider (existing 501 response).
The overview context supplies booking/enquiry/menu metrics, not daily sales; sales
remain available in Reports. These are existing backend capabilities/limits, not
screens to fabricate. Preview verification uses the isolated local SQLite fixture
database only; no production data is seeded or changed.
