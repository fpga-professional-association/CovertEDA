type IconProps = { size?: number };
const s = (size: number = 14) => ({ width: size, height: size });

export const Play = ({ size }: IconProps) => (
  <svg {...s(size || 11)} viewBox="0 0 12 12" fill="currentColor"><path d="M2.5 1l8 5-8 5z" /></svg>
);
export const Stop = ({ size }: IconProps) => (
  <svg {...s(size || 11)} viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="2" width="8" height="8" rx="1" /></svg>
);
export const Refresh = ({ size }: IconProps) => (
  <svg {...s(size || 11)} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1.5 6a4.5 4.5 0 018.2-2.5M10.5 6a4.5 4.5 0 01-8.2 2.5" /><path d="M10 1v3H7M2 11V8h3" /></svg>
);
export const Check = ({ size }: IconProps) => (
  <svg {...s(size || 11)} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 6l3 3L10 3" /></svg>
);
export const Search = ({ size }: IconProps) => (
  <svg {...s(size || 13)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="6" cy="6" r="4" /><path d="M9 9l3 3" /></svg>
);
export const Chip = ({ size }: IconProps) => (
  <svg {...s(size || 16)} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="4" y="4" width="10" height="10" rx="1" /><path d="M7 4V2M11 4V2M7 14v2M11 14v2M4 7H2M4 11H2M14 7h2M14 11h2" /></svg>
);
export const Git = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="3.5" r="1.5" /><circle cx="8" cy="12.5" r="1.5" /><circle cx="12" cy="8" r="1.5" /><path d="M8 5v6M9.3 7.2l1.5.3" /></svg>
);
export const Branch = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="5" cy="4" r="2" /><circle cx="5" cy="12" r="2" /><circle cx="12" cy="7" r="2" /><path d="M5 6v4M7 5.5l3 1" /></svg>
);
export const Arrow = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4 8h8M9 5l3 3-3 3" /></svg>
);
export const Zap = () => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M7.5 1L3 8h4l-1 5 5-7H7l.5-5z" /></svg>
);
export const Gauge = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M2 11a6 6 0 1112 0" /><path d="M8 11V5.5" /><circle cx="8" cy="11" r="1" fill="currentColor" /></svg>
);
export const Pin = () => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="3" y="1" width="8" height="6" rx="1" /><path d="M5 7v3M9 7v3M7 10v3" /></svg>
);
export const Term = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="1" y="2" width="14" height="12" rx="2" /><path d="M4 6l3 2.5L4 11M9 11h3" /></svg>
);
export const Doc = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M4 2h5l3 3v9H4z" /><path d="M9 2v3h3" /><path d="M6 8h4M6 10.5h3" /></svg>
);
export const Clock = () => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="7" cy="7" r="5.5" /><path d="M7 4v3.5l2.5 1.5" /></svg>
);
export const Warn = () => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M7 1L1 13h12z" /><path d="M7 5.5v3M7 10.5v.5" /></svg>
);
export const Bolt = () => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 1v5H2L7 13V8h2z" /></svg>
);
export const Key = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="5.5" cy="10.5" r="3" /><path d="M8 8l5-5M11 3l2 2" /></svg>
);
export const Settings = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="8" cy="8" r="2.5" /><path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.8 3.8l1.4 1.4M10.8 10.8l1.4 1.4M3.8 12.2l1.4-1.4M10.8 5.2l1.4-1.4" /></svg>
);
export const Box = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M8 1L2 4v8l6 3 6-3V4z" /><path d="M2 4l6 3 6-3M8 7v8" /></svg>
);
export const Brain = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M8 14V8" /><path d="M5 3a3 3 0 013-1 3 3 0 013 1" /><circle cx="5" cy="6" r="2.5" /><circle cx="11" cy="6" r="2.5" /><path d="M5 8.5C5 10 6 11 8 11s3-1 3-2.5" /></svg>
);
export const Link = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M4 8h8" /><rect x="1" y="5" width="5" height="6" rx="1" /><rect x="10" y="5" width="5" height="6" rx="1" /></svg>
);
export const MapIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="1" y="3" width="14" height="10" rx="1" /><path d="M5 3v10M11 3v10M1 8h14" /></svg>
);
export const Send = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M1 1l12 6-12 6V8.5L8 7 1 5.5z" /></svg>
);
export const Wave = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M1 12V4h3v8h2V4h2v8h2V4h2v8h2" /></svg>
);
export const Download = () => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M7 1v8M4 6l3 3 3-3M2 11h10" /></svg>
);
export const Server = () => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="2" y="1" width="10" height="4" rx="1" /><rect x="2" y="9" width="10" height="4" rx="1" /><path d="M7 5v4" /><circle cx="4.5" cy="3" r="0.7" fill="currentColor" /><circle cx="4.5" cy="11" r="0.7" fill="currentColor" /></svg>
);
export const GitHub = ({ size }: IconProps) => (
  <svg {...s(size || 14)} viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
);
export const LinkedIn = ({ size }: IconProps) => (
  <svg {...s(size || 14)} viewBox="0 0 16 16" fill="currentColor"><path d="M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854V1.146zm4.943 12.248V6.169H2.542v7.225h2.401zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248-.822 0-1.359.54-1.359 1.248 0 .694.521 1.248 1.327 1.248h.016zm4.908 8.212V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.712-2.165 1.198V6.169H6.249c.032.675 0 7.225 0 7.225h2.401z" /></svg>
);
