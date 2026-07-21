import { Step } from 'react-joyride';

type TFunc = (key: string) => string;

const step = (
  t: TFunc,
  target: string,
  titleKey: string,
  contentKey: string,
  placement: Step['placement'] = 'right',
): Step => ({
  target: `[data-tour="${target}"]`,
  placement,
  title: t(titleKey),
  content: t(contentKey),
  skipBeacon: true,
});

export function getStepsForRole(
  role: string,
  t: TFunc,
  options: { deskBookingEnabled?: boolean } = {},
): Step[] {
  const deskEnabled = options.deskBookingEnabled ?? false;

  const welcome: Step = {
    target: 'body',
    placement: 'center',
    title: t('tour.welcome.title'),
    content: t('tour.welcome.content'),
    skipBeacon: true,
  };

  const deskUserStep = step(t, 'nav-desks', 'tour.hotDesks.title', 'tour.hotDesks.content');
  const deskAdminStep = step(t, 'nav-admin-desks', 'tour.manageDesks.title', 'tour.manageDesks.content');

  switch (role) {

    // ──────────────────────────────────────────────────────────────
    // Super Admin — sees everything; desks always shown
    // ──────────────────────────────────────────────────────────────
    case 'super_admin': return [
      welcome,
      step(t, 'park-select', 'tour.parkSelect.title', 'tour.parkSelect.content'),
      step(t, 'nav-calendar', 'tour.calendarSuperAdmin.title', 'tour.calendarSuperAdmin.content'),
      step(t, 'nav-rooms', 'tour.roomsSuperAdmin.title', 'tour.roomsSuperAdmin.content'),
      deskUserStep,
      step(t, 'nav-my-bookings', 'tour.myBookingsSuperAdmin.title', 'tour.myBookingsSuperAdmin.content'),
      step(t, 'nav-users', 'tour.users.title', 'tour.users.content'),
      step(t, 'nav-admin-rooms', 'tour.manageRooms.title', 'tour.manageRooms.content'),
      deskAdminStep,
      step(t, 'nav-admin-devices', 'tour.devices.title', 'tour.devices.content'),
      step(t, 'nav-admin-companies', 'tour.companies.title', 'tour.companies.content'),
      step(t, 'nav-admin-statistics', 'tour.statistics.title', 'tour.statistics.content'),
      step(t, 'nav-admin-settings', 'tour.settings.title', 'tour.settings.content'),
      step(t, 'nav-admin-parks', 'tour.parks.title', 'tour.parks.content'),
      step(t, 'user-menu', 'tour.userMenu.title', 'tour.userMenu.content', 'auto'),
    ];

    // ──────────────────────────────────────────────────────────────
    // Park Admin — sees Navigation + Management (Users) + Administration
    // desks always shown
    // ──────────────────────────────────────────────────────────────
    case 'park_admin': return [
      welcome,
      step(t, 'nav-calendar', 'tour.calendarParkAdmin.title', 'tour.calendarParkAdmin.content'),
      step(t, 'nav-rooms', 'tour.roomsParkAdmin.title', 'tour.roomsParkAdmin.content'),
      deskUserStep,
      step(t, 'nav-my-bookings', 'tour.myBookingsSuperAdmin.title', 'tour.myBookingsSuperAdmin.content'),
      step(t, 'nav-users', 'tour.usersParkAdmin.title', 'tour.usersParkAdmin.content'),
      step(t, 'nav-admin-rooms', 'tour.manageRoomsParkAdmin.title', 'tour.manageRoomsParkAdmin.content'),
      deskAdminStep,
      step(t, 'nav-admin-devices', 'tour.devicesParkAdmin.title', 'tour.devicesParkAdmin.content'),
      step(t, 'nav-admin-companies', 'tour.companiesParkAdmin.title', 'tour.companiesParkAdmin.content'),
      step(t, 'nav-admin-statistics', 'tour.statisticsParkAdmin.title', 'tour.statisticsParkAdmin.content'),
      step(t, 'nav-admin-settings', 'tour.settingsParkAdmin.title', 'tour.settingsParkAdmin.content'),
      step(t, 'user-menu', 'tour.userMenu.title', 'tour.userMenu.content', 'auto'),
    ];

    // ──────────────────────────────────────────────────────────────
    // Company Admin — sees Navigation + Management (Users, LDAP, SSO)
    // desks shown if company has desk booking enabled
    // ──────────────────────────────────────────────────────────────
    case 'company_admin': return [
      welcome,
      step(t, 'nav-calendar', 'tour.calendarCompanyAdmin.title', 'tour.calendarCompanyAdmin.content'),
      step(t, 'nav-rooms', 'tour.roomsCompanyAdmin.title', 'tour.roomsCompanyAdmin.content'),
      ...(deskEnabled ? [deskUserStep] : []),
      step(t, 'nav-my-bookings', 'tour.myBookingsSuperAdmin.title', 'tour.myBookingsSuperAdmin.content'),
      step(t, 'nav-users', 'tour.usersCompanyAdmin.title', 'tour.usersCompanyAdmin.content'),
      step(t, 'nav-ldap', 'tour.ldap.title', 'tour.ldap.content'),
      step(t, 'nav-sso', 'tour.sso.title', 'tour.sso.content'),
      step(t, 'user-menu', 'tour.userMenu.title', 'tour.userMenu.content', 'auto'),
    ];

    // ──────────────────────────────────────────────────────────────
    // Receptionist — sees Navigation + Reception
    // desks shown if company has desk booking enabled
    // ──────────────────────────────────────────────────────────────
    case 'receptionist': return [
      welcome,
      step(t, 'nav-calendar', 'tour.calendarReceptionist.title', 'tour.calendarReceptionist.content'),
      step(t, 'nav-rooms', 'tour.roomsReceptionist.title', 'tour.roomsReceptionist.content'),
      ...(deskEnabled ? [deskUserStep] : []),
      step(t, 'nav-my-bookings', 'tour.myBookingsReceptionist.title', 'tour.myBookingsReceptionist.content'),
      step(t, 'nav-reception', 'tour.reception.title', 'tour.reception.content'),
      step(t, 'user-menu', 'tour.userMenuReceptionist.title', 'tour.userMenuReceptionist.content', 'top'),
    ];

    // ──────────────────────────────────────────────────────────────
    // Regular User — sees Navigation only
    // desks shown if company has desk booking enabled
    // ──────────────────────────────────────────────────────────────
    default: return [
      welcome,
      step(t, 'nav-calendar', 'tour.calendarUser.title', 'tour.calendarUser.content'),
      step(t, 'nav-rooms', 'tour.roomsUser.title', 'tour.roomsUser.content'),
      ...(deskEnabled ? [deskUserStep] : []),
      step(t, 'nav-my-bookings', 'tour.myBookingsUser.title', 'tour.myBookingsUser.content'),
      step(t, 'user-menu', 'tour.userMenuUser.title', 'tour.userMenuUser.content', 'top'),
    ];
  }
}
