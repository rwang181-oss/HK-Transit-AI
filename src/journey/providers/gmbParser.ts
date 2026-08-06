export interface GmbEtaFilter {
  routeId?: string;
  routeSeq?: number;
  stopSeq?: number;
}

export interface ParsedGmbEta {
  eta: string;
  remarks_en: string;
  remarks_tc: string;
}

function sameNumber(value: unknown, expected: number | undefined): boolean {
  if (expected == null) return true;
  return Number(value) === expected;
}

export function parseGmbEtaResponse(
  payload: any,
  filter: GmbEtaFilter = {}
): ParsedGmbEta[] {
  const blocks = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.data?.route_stops)
      ? payload.data.route_stops
      : payload?.data && typeof payload.data === 'object'
        ? [payload.data]
        : [];

  const result: ParsedGmbEta[] = [];
  for (const block of blocks) {
    if (filter.routeId != null && block?.route_id != null && String(block.route_id) !== String(filter.routeId)) continue;
    if (block?.route_seq != null && !sameNumber(block.route_seq, filter.routeSeq)) continue;
    if (block?.stop_seq != null && !sameNumber(block.stop_seq, filter.stopSeq)) continue;
    if (block?.enabled === false) continue;

    const etaRows = Array.isArray(block?.eta) ? block.eta : [];
    for (const etaRow of etaRows) {
      const eta = String(etaRow?.timestamp || etaRow?.eta || etaRow?.eta_timestamp || '');
      if (!eta) continue;
      result.push({
        eta,
        remarks_en: String(etaRow?.remarks_en || ''),
        remarks_tc: String(etaRow?.remarks_tc || ''),
      });
    }
  }
  return result;
}
