/** Minimal line icons. Consistent style: currentColor stroke, round caps. */
import type { SVGProps, ReactNode } from "react";

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function make(node: ReactNode, displayName: string) {
  const Comp = ({ size = 24, strokeWidth = 1.6, ...props }: IconProps & { strokeWidth?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {node}
    </svg>
  );
  Comp.displayName = displayName;
  return Comp;
}

export const HomeIcon = make(<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z" />, "HomeIcon");
export const ReceiptIcon = make(
  <>
    <path d="M6 3.5h12v17l-2.2-1.4-2.2 1.4-2.2-1.4-2.2 1.4L7 20.5 6 21z" />
    <path d="M9 8h6M9 12h6" />
  </>,
  "ReceiptIcon",
);
export const RepeatIcon = make(
  <>
    <path d="M4 9a6 6 0 0 1 10.5-4M20 15A6 6 0 0 1 9.5 19" />
    <path d="M15 4.5 15 8l3.4-.2M9 19.5 9 16l-3.4.2" />
  </>,
  "RepeatIcon",
);
export const UserIcon = make(
  <>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
  </>,
  "UserIcon",
);
export const PlusIcon = make(<path d="M12 5v14M5 12h14" />, "PlusIcon");
export const BellIcon = make(
  <>
    <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
    <path d="M10.5 19a1.8 1.8 0 0 0 3 0" />
  </>,
  "BellIcon",
);
export const ChevronRightIcon = make(<path d="M9 6l6 6-6 6" />, "ChevronRightIcon");
export const ChevronLeftIcon = make(<path d="M15 6l-6 6 6 6" />, "ChevronLeftIcon");
export const ChevronDownIcon = make(<path d="M6 9l6 6 6-6" />, "ChevronDownIcon");
export const CloseIcon = make(<path d="M6 6l12 12M18 6 6 18" />, "CloseIcon");
export const CheckIcon = make(<path d="M5 12.5 10 17l9-10" />, "CheckIcon");
export const TrashIcon = make(
  <path d="M5 7h14M10 7V5h4v2M8 7l.7 12a1 1 0 0 0 1 1h4.6a1 1 0 0 0 1-1L16 7" />,
  "TrashIcon",
);
export const PencilIcon = make(<path d="M4 20h4L18.5 9.5a1.8 1.8 0 0 0 0-2.5l-1.5-1.5a1.8 1.8 0 0 0-2.5 0L4 16z" />, "PencilIcon");
export const CalendarIcon = make(
  <>
    <rect x="4" y="5.5" width="16" height="15" rx="3" />
    <path d="M4 9.5h16M8 3.5v4M16 3.5v4" />
  </>,
  "CalendarIcon",
);
export const CameraIcon = make(
  <>
    <path d="M4 9a2 2 0 0 1 2-2h1.3l.9-1.4A1.5 1.5 0 0 1 9.4 5h5.2a1.5 1.5 0 0 1 1.2.6L16.7 7H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="13" r="3.2" />
  </>,
  "CameraIcon",
);
export const ImageIcon = make(
  <>
    <rect x="4" y="5" width="16" height="14" rx="2.5" />
    <circle cx="9" cy="10" r="1.5" />
    <path d="m5 17 4.5-4 3 2.4L16 12l3 3.4" />
  </>,
  "ImageIcon",
);
export const WalletIcon = make(
  <>
    <path d="M4 8a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v1" />
    <rect x="4" y="7" width="16" height="12" rx="3" />
    <path d="M20 12h-3.5a1.5 1.5 0 0 0 0 3H20" />
  </>,
  "WalletIcon",
);
export const GearIcon = make(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M4.2 7l2.6 1.5M17.2 15.5l2.6 1.5M4.2 17l2.6-1.5M17.2 8.5l2.6-1.5" />
  </>,
  "GearIcon",
);
export const DownloadIcon = make(<path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" />, "DownloadIcon");
export const LogOutIcon = make(
  <>
    <path d="M14 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7" />
    <path d="M16 12H10M16 12l-3-3M16 12l-3 3" />
  </>,
  "LogOutIcon",
);
export const ShieldIcon = make(
  <>
    <path d="M12 3.5 19 6v5c0 4.5-3 7.5-7 9.5-4-2-7-5-7-9.5V6z" />
    <path d="M9 12l2 2 4-4" />
  </>,
  "ShieldIcon",
);
export const InfoIcon = make(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </>,
  "InfoIcon",
);
export const BarChartIcon = make(<path d="M5 20V10M12 20V4M19 20v-7" />, "BarChartIcon");
export const MailIcon = make(
  <>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="m4 7 8 5.5L20 7" />
  </>,
  "MailIcon",
);
export const SparkIcon = make(
  <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M17.5 6.5 15 9M9 15l-2.5 2.5" />,
  "SparkIcon",
);

export type IconComponent = ReturnType<typeof make>;
