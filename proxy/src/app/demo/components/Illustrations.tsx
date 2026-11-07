import type { PropertyKind } from "../presets";

/** Our own flat illustrations: no listing photos are used anywhere in the demo. */

function Windows({ x, y, cols, rows, w, h, gx, gy }: { x: number; y: number; cols: number; rows: number; w: number; h: number; gx: number; gy: number }) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = (r * 7 + c * 3) % 5 === 0;
      out.push(<rect key={`${r}-${c}`} x={x + c * (w + gx)} y={y + r * (h + gy)} width={w} height={h} rx={1.5} className={lit ? "ill-win lit" : "ill-win"} />);
    }
  }
  return <>{out}</>;
}

export function Facade({ kind }: { kind: PropertyKind }) {
  return (
    <svg viewBox="0 0 320 240" className="ill" role="img" aria-label={`Illustration of a ${kind.toLowerCase()}`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="ill-sky-top" />
          <stop offset="1" className="ill-sky-bottom" />
        </linearGradient>
      </defs>
      <rect width="320" height="240" fill="url(#sky)" />
      <circle cx="262" cy="52" r="20" className="ill-sun" />
      <rect x="0" y="206" width="320" height="34" className="ill-ground" />
      <rect x="0" y="202" width="320" height="6" className="ill-kerb" />
      {kind === "Apartment" ? (
        <g>
          <rect x="24" y="92" width="64" height="112" className="ill-bldg-2" />
          <rect x="96" y="40" width="128" height="164" className="ill-bldg" />
          <Windows x={108} y={54} cols={4} rows={6} w={20} h={16} gx={9} gy={8} />
          <rect x="146" y="178" width="28" height="26" className="ill-door" />
          <rect x="232" y="110" width="70" height="94" className="ill-bldg-2" />
          <Windows x={242} y={122} cols={2} rows={3} w={18} h={14} gx={14} gy={10} />
        </g>
      ) : kind === "House" ? (
        <g>
          <rect x="70" y="96" width="180" height="108" className="ill-bldg" />
          <path d="M60 100 L160 44 L260 100 Z" className="ill-roof" />
          <rect x="70" y="128" width="180" height="6" className="ill-lace" />
          <rect x="92" y="146" width="34" height="40" rx={2} className="ill-win" />
          <rect x="194" y="146" width="34" height="40" rx={2} className="ill-win lit" />
          <rect x="144" y="150" width="32" height="54" className="ill-door" />
          <rect x="102" y="104" width="22" height="18" rx={2} className="ill-win" />
          <rect x="196" y="104" width="22" height="18" rx={2} className="ill-win" />
        </g>
      ) : (
        <g>
          {[40, 130, 220].map((x, i) => (
            <g key={x}>
              <rect x={x} y={84 + (i % 2) * 8} width="84" height={120 - (i % 2) * 8} className={i === 1 ? "ill-bldg" : "ill-bldg-2"} />
              <path d={`M${x - 4} ${88 + (i % 2) * 8} L${x + 42} ${56 + (i % 2) * 8} L${x + 88} ${88 + (i % 2) * 8} Z`} className="ill-roof" />
              <rect x={x + 14} y={108 + (i % 2) * 8} width="22" height="20" rx={2} className={i === 1 ? "ill-win lit" : "ill-win"} />
              <rect x={x + 48} y={108 + (i % 2) * 8} width="22" height="20" rx={2} className="ill-win" />
              <rect x={x + 30} y="162" width="24" height="42" className="ill-door" />
            </g>
          ))}
        </g>
      )}
      <circle cx="18" cy="176" r="22" className="ill-tree" />
      <rect x="16" y="190" width="4" height="16" className="ill-trunk" />
      <circle cx="300" cy="182" r="18" className="ill-tree" />
    </svg>
  );
}

export function FloorPlan({ beds }: { beds: number }) {
  const rooms = Math.max(1, Math.min(4, beds));
  const w = 240 / rooms;
  return (
    <svg viewBox="0 0 320 240" className="ill ill-plan" role="img" aria-label={`Schematic floor plan, ${beds} bedrooms`}>
      <rect width="320" height="240" className="ill-paper" />
      <g className="ill-walls">
        <rect x="40" y="30" width="240" height="180" />
        <line x1="40" y1="110" x2="280" y2="110" />
        {Array.from({ length: rooms - 1 }, (_, i) => <line key={i} x1={40 + w * (i + 1)} y1="30" x2={40 + w * (i + 1)} y2="110" />)}
        <line x1="200" y1="110" x2="200" y2="210" />
      </g>
      {Array.from({ length: rooms }, (_, i) => <text key={i} x={40 + w * i + w / 2} y="74" className="ill-label">Bed {i + 1}</text>)}
      <text x="120" y="164" className="ill-label">Living</text>
      <text x="240" y="164" className="ill-label">Kitchen</text>
    </svg>
  );
}

const ICON = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const BedIcon = () => <svg {...ICON}><path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 15h18M7 10V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v3" /></svg>;
export const BathIcon = () => <svg {...ICON}><path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3ZM6 12V6a2 2 0 0 1 4 0M7 19l-1 2M17 19l1 2" /></svg>;
export const CarIcon = () => <svg {...ICON}><path d="M5 16V12l2-5h10l2 5v4M4 16h16v2H4zM7 16v2M17 16v2M5 12h14" /></svg>;
export const HomeIcon = () => <svg {...ICON}><path d="M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-5h4v5" /></svg>;
