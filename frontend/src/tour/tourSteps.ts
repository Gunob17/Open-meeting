import { Step } from 'react-joyride';

const welcome: Step = {
  target: 'body',
  placement: 'center',
  title: 'Welcome to Open Meeting',
  content: 'Let\'s take a quick tour of every section available to you. You can skip at any time and replay this tour from Account Settings.',
  disableBeacon: true,
};

const step = (target: string, title: string, content: string, placement: Step['placement'] = 'right'): Step => ({
  target: `[data-tour="${target}"]`,
  placement,
  title,
  content,
  disableBeacon: true,
});

export const tourStepsByRole: Record<string, Step[]> = {

  // ──────────────────────────────────────────────────────────────
  // Super Admin — sees everything
  // ──────────────────────────────────────────────────────────────
  super_admin: [
    welcome,
    step('park-select', 'Site Selector',
      'Switch between parks (sites) here. As Super Admin you can manage all sites from one account. The data shown on every page reflects the selected site.'),
    step('nav-calendar', 'Calendar',
      'The visual weekly calendar shows every room\'s availability side-by-side. Click any open slot to create a booking. Past bookings remain visible for the full current week.'),
    step('nav-rooms', 'Rooms',
      'Browse the full list of meeting rooms. Filter by capacity and amenities to find the right space, then click a room to see its schedule and book directly.'),
    step('nav-my-bookings', 'My Bookings',
      'A list of all your own upcoming and past bookings. Cancel meetings, view attendee details, or check the room assigned to each booking.'),
    step('nav-users', 'Users',
      'Invite new users by email and assign them a role. View and edit existing accounts, reset two-factor authentication, and resend pending invite links.'),
    step('nav-admin-rooms', 'Manage Rooms',
      'Create and configure meeting rooms — set capacity, floor, amenities, per-room opening/closing hours, company access restrictions, and IoT display booking durations.'),
    step('nav-admin-devices', 'Devices',
      'Manage ESP32 room display devices. Monitor online status and last-seen timestamps, push over-the-air firmware updates, and regenerate device security tokens.'),
    step('nav-admin-companies', 'Companies',
      'Create and manage the companies (tenants) that share your site. Set company-level two-factor authentication policy and assign users to the correct company.'),
    step('nav-admin-statistics', 'Statistics',
      'Analytics for your site: room utilization percentages, peak booking hours, daily booking trends, amenity popularity, and top-booker rankings. Filter by custom date ranges.'),
    step('nav-admin-settings', 'Settings',
      'System-wide configuration: default booking hours, timezone, time format, two-factor authentication enforcement policy, and the system-wide announcement banner.'),
    step('nav-admin-parks', 'Parks',
      'Create and manage sites. Upload per-site logos, configure the visitor reception email and custom guest fields, and control whether iCal calendar feeds are enabled for a site.'),
    step('user-menu', 'Account Menu',
      'Click here to open your account menu. Access personal settings (two-factor authentication, calendar feed subscriptions, password), or log out.', 'top'),
  ],

  // ──────────────────────────────────────────────────────────────
  // Park Admin — sees Navigation + Management (Users) + Administration
  // ──────────────────────────────────────────────────────────────
  park_admin: [
    welcome,
    step('nav-calendar', 'Calendar',
      'The visual weekly calendar shows every room\'s availability side-by-side. Click any open slot to create a booking. You can also view and manage any booking on behalf of users.'),
    step('nav-rooms', 'Rooms',
      'Browse all meeting rooms in your site. Filter by capacity and amenities, view room details and current availability.'),
    step('nav-my-bookings', 'My Bookings',
      'A list of all your own upcoming and past bookings. Cancel meetings, view attendee details, or check the room assigned to each booking.'),
    step('nav-users', 'Users',
      'Invite new users by email and assign them a role within your site. Edit accounts, reset two-factor authentication, and resend pending invite links.'),
    step('nav-admin-rooms', 'Manage Rooms',
      'Create and configure meeting rooms — set capacity, floor, amenities, per-room opening/closing hours, company access restrictions, quick-booking durations, and optional email-based booking (iMIP).'),
    step('nav-admin-devices', 'Devices',
      'Manage ESP32 room display devices mounted outside meeting rooms. Monitor status, push over-the-air firmware updates to individual devices or all at once, and regenerate access tokens.'),
    step('nav-admin-companies', 'Companies',
      'Create and manage the companies (tenants) that share your site. Set per-company two-factor authentication policy and control which users belong to which company.'),
    step('nav-admin-statistics', 'Statistics',
      'Analytics for your site: room utilization percentages, hourly and daily booking trends, peak hours, amenity popularity, and top bookers. Useful for optimizing your space.'),
    step('nav-admin-settings', 'Settings',
      'Configure default booking hours, timezone, time format, and two-factor authentication enforcement policy for your site.'),
    step('user-menu', 'Account Menu',
      'Click here to open your account menu. Access personal settings (two-factor authentication, calendar feed subscriptions, password), or log out.', 'top'),
  ],

  // ──────────────────────────────────────────────────────────────
  // Company Admin — sees Navigation + Management (Users, LDAP, SSO)
  // ──────────────────────────────────────────────────────────────
  company_admin: [
    welcome,
    step('nav-calendar', 'Calendar',
      'The visual weekly calendar shows every available room side-by-side. Click any open slot to book a room for your team. The system prevents double-bookings automatically.'),
    step('nav-rooms', 'Rooms',
      'Browse available meeting rooms. Filter by capacity and amenities to find the right space, then book directly from the room detail view.'),
    step('nav-my-bookings', 'My Bookings',
      'A list of all your own upcoming and past bookings. Cancel meetings, view attendee details, or check the status of any booking.'),
    step('nav-users', 'Users',
      'Invite team members by email and assign them a role (User, Company Admin, or Receptionist). Edit existing accounts and resend invite links for pending users.'),
    step('nav-ldap', 'LDAP Settings',
      'Connect your company\'s LDAP directory to automatically sync users and map LDAP groups to application roles. Configure sync intervals and run manual syncs from here.'),
    step('nav-sso', 'SSO Settings',
      'Enable Single Sign-On so your team logs in with their existing corporate credentials. Supports OpenID Connect (OIDC) and SAML 2.0 — compatible with Keycloak, Azure AD, Okta, ADFS, and more.'),
    step('user-menu', 'Account Menu',
      'Click here to open your account menu. Access personal settings (two-factor authentication, calendar feed subscriptions, password), or log out.', 'top'),
  ],

  // ──────────────────────────────────────────────────────────────
  // Regular User — sees Navigation only
  // ──────────────────────────────────────────────────────────────
  user: [
    welcome,
    step('nav-calendar', 'Book a Room',
      'The weekly calendar shows all rooms side-by-side. Green slots are free, red slots are booked. Click any open slot to create a booking — conflicts are prevented automatically.'),
    step('nav-rooms', 'Browse Rooms',
      'Filter rooms by capacity and amenities to find the right space for your meeting. Click a room to see its full schedule and book directly from there.'),
    step('nav-my-bookings', 'My Bookings',
      'All your upcoming and past bookings in one place. Cancel a meeting, see who else is attending, or check which room is assigned.'),
    step('user-menu', 'Account Settings',
      'Click here to access your personal account settings — set up two-factor authentication, generate calendar feed subscription URLs, change your password, or log out.', 'top'),
  ],

  // ──────────────────────────────────────────────────────────────
  // Receptionist — sees Navigation + Reception
  // ──────────────────────────────────────────────────────────────
  receptionist: [
    welcome,
    step('nav-calendar', 'Calendar',
      'The weekly calendar shows all room bookings. Use it to see which meetings are happening now and which rooms are available.'),
    step('nav-rooms', 'Rooms',
      'Browse all meeting rooms, view their amenities and current availability.'),
    step('nav-my-bookings', 'My Bookings',
      'A list of all your own bookings. Cancel meetings or review details from here.'),
    step('nav-reception', 'Guest Management',
      'Your main dashboard as a receptionist. See every expected visitor for today, check guests in when they arrive, and mark them out when they leave. Overstay alerts highlight guests still on-site past their meeting\'s end time.'),
    step('user-menu', 'Account Settings',
      'Click here to access your personal account settings — two-factor authentication, calendar feed subscriptions, or log out.', 'top'),
  ],
};

export function getStepsForRole(role: string): Step[] {
  return tourStepsByRole[role] ?? tourStepsByRole['user'];
}
