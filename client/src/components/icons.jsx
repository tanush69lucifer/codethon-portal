// Small inline icon set (stroke icons, 24px grid). No external icon font, so it
// works under Safe Exam Browser URL filtering and adds nothing to the network.
const base = (size) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
});

const make = (paths) =>
  function Icon({ size = 16, ...rest }) {
    return (
      <svg {...base(size)} {...rest}>
        {paths}
      </svg>
    );
  };

export const IconMail = make(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>);
export const IconKey = make(<><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 8.3-8.3" /><path d="m16 7 3 3" /><path d="m14 9 2 2" /></>);
export const IconLock = make(<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>);
export const IconUser = make(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>);
export const IconShield = make(<><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>);
export const IconArrowRight = make(<><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>);
export const IconArrowLeft = make(<><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></>);
export const IconClock = make(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconList = make(<><path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>);
export const IconCode = make(<><path d="m8 7-5 5 5 5" /><path d="m16 7 5 5-5 5" /><path d="m14 4-4 16" /></>);
export const IconCalendar = make(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></>);
export const IconCheck = make(<path d="m5 12 5 5L20 7" />);
export const IconCheckCircle = make(<><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>);
export const IconInfo = make(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>);
export const IconAlert = make(<><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4" /><path d="M12 17h.01" /></>);
export const IconX = make(<><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>);
export const IconEye = make(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>);
export const IconSave = make(<><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V3Z" /><path d="M8 3v5h7V3" /><rect x="8" y="13" width="8" height="5" rx="1" /></>);
export const IconTerminal = make(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3" /><path d="M13 15h4" /></>);
export const IconPlay = make(<path d="M7 5v14l11-7L7 5Z" />);
export const IconSend = make(<><path d="M4 12 20 4l-6 16-3-7-7-1Z" /></>);
export const IconReset = make(<><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>);
export const IconStar = make(<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z" />);
export const IconCpu = make(<><rect x="6" y="6" width="12" height="12" rx="2" /><rect x="10" y="10" width="4" height="4" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></>);
export const IconLayers = make(<><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>);
export const IconTrophy = make(<><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5a3 3 0 0 0 3 4" /><path d="M16 6h3a3 3 0 0 1-3 4" /><path d="M12 13v4" /><path d="M8 21h8" /><path d="M9 17h6" /></>);
export const IconMaximize = make(<><path d="M4 9V4h5" /><path d="M20 9V4h-5" /><path d="M4 15v5h5" /><path d="M20 15v5h-5" /></>);
export const IconFlag = make(<><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>);
export const IconInbox = make(<><path d="M3 13h5l2 3h4l2-3h5" /><path d="M5 5h14l2 8v6H3v-6l2-8Z" /></>);
export const IconLogout = make(<><path d="M15 4h4v16h-4" /><path d="M10 8l-4 4 4 4" /><path d="M6 12h10" /></>);
export const IconJava = make(<><path d="M8 17c-2 1 1 2 4 2s6-1 4-2" /><path d="M9 14c-1.5.8.5 1.5 3 1.5s4.5-.7 3-1.5" /><path d="M12 3c2 2-3 3-1 6" /><path d="M14 6c1.5 1.5-2 2.5-.5 4.5" /></>);
