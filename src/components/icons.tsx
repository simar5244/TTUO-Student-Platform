// Minimal geometric icon set — 24px viewBox, stroke-based, currentColor.
import { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const I = (paths: React.ReactNode) =>
  function Icon(props: P) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
        strokeLinecap="round" strokeLinejoin="round" width={20} height={20} {...props}>
        {paths}
      </svg>
    );
  };

export const IconHome = I(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9 21v-6h6v6" /></>);
export const IconUser = I(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></>);
export const IconUsers = I(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.4 2.9-5.5 6.5-5.5s6.5 2.1 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.9c1.9.8 3 2.3 3 4.4" /></>);
export const IconDoc = I(<><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 12h6M9 16h6" /></>);
export const IconUpload = I(<><path d="M12 16V4" /><path d="m6 10 6-6 6 6" /><path d="M4 20h16" /></>);
export const IconCheck = I(<path d="m4 12.5 5 5L20 6.5" />);
export const IconCheckCircle = I(<><circle cx="12" cy="12" r="9" /><path d="m8 12.5 3 3 5.5-6" /></>);
export const IconX = I(<path d="m6 6 12 12M18 6 6 18" />);
export const IconChat = I(<><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></>);
export const IconMerge = I(<><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="12" r="2.5" /><path d="M6 8.5v7M8.3 6.8c5 0 4 4 7 4.7M8.3 17.2c5 0 4-4 7-4.7" /></>);
export const IconShield = I(<><path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z" /><path d="m9 12 2.2 2.2L15.5 10" /></>);
export const IconClock = I(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>);
export const IconSearch = I(<><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.8-4.8" /></>);
export const IconFilter = I(<><path d="M4 5h16l-6.5 8v6l-3 2v-8z" /></>);
export const IconLogout = I(<><path d="M14 4h6v16h-6" /><path d="M3 12h11" /><path d="m10 8 4 4-4 4" /></>);
export const IconMenu = I(<path d="M4 7h16M4 12h16M4 17h16" />);
export const IconEye = I(<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>);
export const IconChart = I(<><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-5M12 16V8M16 16v-3" /></>);
export const IconBell = I(<><path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10Z" /><path d="M10 19a2 2 0 0 0 4 0" /></>);
export const IconArrowR = I(<path d="M4 12h15m-6-7 7 7-7 7" />);
export const IconArrowL = I(<path d="M20 12H5m6-7-7 7 7 7" />);
export const IconGrid = I(<><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></>);
export const IconList = I(<><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>);
export const IconLink = I(<><path d="M9 15 15 9" /><path d="M11 6l1.5-1.5a3.5 3.5 0 0 1 5 5L16 11" /><path d="M13 18l-1.5 1.5a3.5 3.5 0 0 1-5-5L8 13" /></>);
export const IconSend = I(<path d="M4 12 20 4l-4 16-4.5-6.5z" />);
export const IconDots = I(<><circle cx="5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="19" cy="12" r="1.2" fill="currentColor" /></>);
export const IconPhone = I(<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />);
export const IconMail = I(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>);
export const IconCalendar = I(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>);
export const IconBook = I(<><path d="M5 4h6a3 3 0 0 1 1 .2A3 3 0 0 1 13 4h6v15h-6a3 3 0 0 0-1 .2V4.2" /><path d="M5 4v15h6" /></>);
export const IconDownload = I(<><path d="M12 4v12" /><path d="m6 10 6 6 6-6" /><path d="M4 20h16" /></>);
export const IconWarn = I(<><path d="M12 4 2.5 20h19z" /><path d="M12 10v4" /><circle cx="12" cy="17" r=".8" fill="currentColor" /></>);
export const IconPlus = I(<path d="M12 5v14M5 12h14" />);
export const IconEdit = I(<><path d="m14.5 5.5 4 4L8 20H4v-4z" /><path d="m13 7 4 4" /></>);
export const IconLock = I(<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>);
export const IconSpark = I(<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />);
