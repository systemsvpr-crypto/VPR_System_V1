// Company divisions a document / subscription can belong to. Edit this list
// to match the organisation — every Docs dropdown and filter reads it.
//
// VPR's access model is page/tab based (Settings → Users), with no
// per-division restriction, so every user may see every division. The two
// helpers keep the reference module's division-scoping hooks in place in
// case per-division access is added later.
export const ALL_DIVISIONS = ["VPR Head Office", "VPR Warehousing", "VPR Trading", "VPR Logistics"];

export const DEFAULT_DIVISION = ALL_DIVISIONS[0];

// Empty array = no restriction.
export const getUserAllowedDivisions = () => [];

export const isDivisionAllowed = (division, allowedDivisions) =>
  !allowedDivisions || allowedDivisions.length === 0 || allowedDivisions.includes(division);
