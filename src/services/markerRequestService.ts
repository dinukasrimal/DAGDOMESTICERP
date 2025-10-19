import { supabase } from '@/integrations/supabase/client';
import { MarkerFabricAssignment } from '@/types/marker';

export interface MarkerRequestPayload {
  marker_number: string;
  marker_type: 'body' | 'gusset';
  width: number;
  layers: number;
  efficiency: number;
  pieces_per_marker: number;
  marker_length_yards: number;
  marker_length_inches: number;
  measurement_type: 'yard' | 'kg';
  marker_gsm?: number | null;
  total_fabric_yards?: number | null;
  total_fabric_kg?: number | null;
  po_ids: string[];
  details?: Record<string, unknown> | null;
  fabric_assignment?: MarkerFabricAssignment | null;
  fabric_assignments?: MarkerFabricAssignment[] | null;
}

export interface MarkerRequest extends MarkerRequestPayload {
  id: string;
  created_at?: string;
}

const FALLBACK_PREFIX = 'MR';

export class MarkerRequestService {
  async generateMarkerNumber(): Promise<string> {
    try {
      const { data, error } = await supabase.rpc('generate_marker_request_number');
      if (error) throw error;
      if (data && typeof data === 'string') {
        return data;
      }
    } catch (error) {
      console.warn('Failed to generate marker request number via RPC, using fallback.', error);
    }

    const now = new Date();
    const date = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now
      .getDate()
      .toString()
      .padStart(2, '0')}`;
    const suffix = now.getTime().toString().slice(-4);
    return `${FALLBACK_PREFIX}-${date}-${suffix}`;
  }

  async createMarkerRequest(payload: MarkerRequestPayload): Promise<MarkerRequest> {
    const mergedDetails = {
      ...(payload.details ?? {}),
      ...(payload.fabric_assignment ? { fabric_assignment: payload.fabric_assignment } : {}),
      ...(payload.fabric_assignments ? { fabric_assignments: payload.fabric_assignments } : {}),
    };
    const detailsForInsert = Object.keys(mergedDetails).length ? mergedDetails : null;

    try {

      const { data, error } = await supabase
        .from('marker_requests')
        .insert({
          marker_number: payload.marker_number,
          marker_type: payload.marker_type,
          width: payload.width,
          layers: payload.layers,
          efficiency: payload.efficiency,
          pieces_per_marker: payload.pieces_per_marker,
          marker_length_yards: payload.marker_length_yards,
          marker_length_inches: payload.marker_length_inches,
          measurement_type: payload.measurement_type,
          marker_gsm: payload.marker_gsm ?? null,
          total_fabric_yards: payload.total_fabric_yards ?? null,
          total_fabric_kg: payload.total_fabric_kg ?? null,
          po_ids: payload.po_ids,
          details: detailsForInsert,
        })
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      const details = (data as any)?.details ?? detailsForInsert;
      const fabricAssignment =
        (details?.fabric_assignment as MarkerFabricAssignment | undefined) ||
        payload.fabric_assignment ||
        null;
      const fabricAssignments =
        (details?.fabric_assignments as MarkerFabricAssignment[] | undefined) ||
        payload.fabric_assignments ||
        null;

      return {
        ...(data as MarkerRequest),
        marker_number: payload.marker_number,
        marker_type: payload.marker_type,
        width: payload.width,
        layers: payload.layers,
        efficiency: payload.efficiency,
        pieces_per_marker: payload.pieces_per_marker,
        marker_length_yards: payload.marker_length_yards,
        marker_length_inches: payload.marker_length_inches,
        measurement_type: payload.measurement_type,
        marker_gsm: payload.marker_gsm ?? null,
        total_fabric_yards: payload.total_fabric_yards ?? null,
        total_fabric_kg: payload.total_fabric_kg ?? null,
        po_ids: payload.po_ids,
        details,
        fabric_assignment: fabricAssignment,
        fabric_assignments: fabricAssignments,
      };
    } catch (error: any) {
      const message = String(error?.message || '').toLowerCase();

      if (message.includes('relation') || message.includes('table') || message.includes('column')) {
        console.warn('marker_requests table missing; returning mock marker request.');
        const fallbackDetails = detailsForInsert;

        return {
          id: `marker-${Date.now()}`,
          marker_number: payload.marker_number,
          marker_type: payload.marker_type,
          width: payload.width,
          layers: payload.layers,
          efficiency: payload.efficiency,
          pieces_per_marker: payload.pieces_per_marker,
          marker_length_yards: payload.marker_length_yards,
          marker_length_inches: payload.marker_length_inches,
          measurement_type: payload.measurement_type,
          marker_gsm: payload.marker_gsm ?? null,
          total_fabric_yards: payload.total_fabric_yards ?? null,
          total_fabric_kg: payload.total_fabric_kg ?? null,
          po_ids: payload.po_ids,
          details: fallbackDetails,
          fabric_assignment: payload.fabric_assignment ?? null,
          fabric_assignments: payload.fabric_assignments ?? null,
          created_at: new Date().toISOString(),
        };
      }

      throw new Error(`Failed to create marker request: ${error?.message || error}`);
    }
  }

  async getMarkerRequests(): Promise<MarkerRequest[]> {
    try {
      const { data, error } = await supabase
        .from('marker_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((item: any) => {
        const details = item.details ?? null;
        const fabricAssignment = details?.fabric_assignment as MarkerFabricAssignment | undefined;
        const fabricAssignments = details?.fabric_assignments as MarkerFabricAssignment[] | undefined;

        return {
          id: item.id,
          marker_number: item.marker_number,
          marker_type: item.marker_type,
          width: Number(item.width) || 0,
          layers: Number(item.layers) || 0,
          efficiency: Number(item.efficiency) || 0,
          pieces_per_marker: Number(item.pieces_per_marker) || 0,
          marker_length_yards: Number(item.marker_length_yards) || 0,
          marker_length_inches: Number(item.marker_length_inches) || 0,
          measurement_type:
            (item.measurement_type as 'yard' | 'kg') ||
            (item.details?.measurement_type as 'yard' | 'kg') ||
            'yard',
          marker_gsm:
            item.marker_gsm != null
              ? Number(item.marker_gsm)
              : item.details?.marker_gsm ?? null,
          total_fabric_yards:
            item.total_fabric_yards != null
              ? Number(item.total_fabric_yards)
              : item.details?.total_fabric_yards ?? null,
          total_fabric_kg:
            item.total_fabric_kg != null
              ? Number(item.total_fabric_kg)
              : item.details?.total_fabric_kg ?? null,
          po_ids: Array.isArray(item.po_ids) ? item.po_ids : [],
          details,
          fabric_assignment: fabricAssignment ?? null,
          fabric_assignments: fabricAssignments ?? null,
          created_at: item.created_at,
        };
      });
    } catch (error: any) {
      const message = String(error?.message || '').toLowerCase();
      if (message.includes('relation') || message.includes('table')) {
        console.warn('marker_requests table not found; returning empty list.');
        return [];
      }
      throw new Error(`Failed to load marker requests: ${error?.message || error}`);
    }
  }

  async updateMarkerRequest(id: string, payload: Partial<MarkerRequestPayload>): Promise<MarkerRequest> {
    const mergedDetails = {
      ...(payload.details ?? {}),
      ...(payload.fabric_assignment ? { fabric_assignment: payload.fabric_assignment } : {}),
      ...(payload.fabric_assignments ? { fabric_assignments: payload.fabric_assignments } : {}),
    };
    const detailsForUpdate = Object.keys(mergedDetails).length ? mergedDetails : undefined;

    const updateBody: any = {};
    if (payload.marker_number !== undefined) updateBody.marker_number = payload.marker_number;
    if (payload.marker_type !== undefined) updateBody.marker_type = payload.marker_type;
    if (payload.width !== undefined) updateBody.width = payload.width;
    if (payload.layers !== undefined) updateBody.layers = payload.layers;
    if (payload.efficiency !== undefined) updateBody.efficiency = payload.efficiency;
    if (payload.pieces_per_marker !== undefined) updateBody.pieces_per_marker = payload.pieces_per_marker;
    if (payload.marker_length_yards !== undefined) updateBody.marker_length_yards = payload.marker_length_yards;
    if (payload.marker_length_inches !== undefined) updateBody.marker_length_inches = payload.marker_length_inches;
    if (payload.measurement_type !== undefined) updateBody.measurement_type = payload.measurement_type;
    if (payload.marker_gsm !== undefined) updateBody.marker_gsm = payload.marker_gsm;
    if (payload.total_fabric_yards !== undefined) updateBody.total_fabric_yards = payload.total_fabric_yards;
    if (payload.total_fabric_kg !== undefined) updateBody.total_fabric_kg = payload.total_fabric_kg;
    if (payload.po_ids !== undefined) updateBody.po_ids = payload.po_ids;
    if (detailsForUpdate !== undefined) updateBody.details = detailsForUpdate;

    try {
      const { data, error } = await supabase
        .from('marker_requests')
        .update(updateBody)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;

      const item: any = data;
      const details = item.details ?? detailsForUpdate ?? null;
      const fabricAssignment = details?.fabric_assignment as MarkerFabricAssignment | undefined;
      const fabricAssignments = details?.fabric_assignments as MarkerFabricAssignment[] | undefined;

      return {
        id: item.id,
        marker_number: item.marker_number,
        marker_type: item.marker_type,
        width: Number(item.width) || 0,
        layers: Number(item.layers) || 0,
        efficiency: Number(item.efficiency) || 0,
        pieces_per_marker: Number(item.pieces_per_marker) || 0,
        marker_length_yards: Number(item.marker_length_yards) || 0,
        marker_length_inches: Number(item.marker_length_inches) || 0,
        measurement_type: (item.measurement_type as 'yard' | 'kg') || 'yard',
        marker_gsm: item.marker_gsm != null ? Number(item.marker_gsm) : null,
        total_fabric_yards: item.total_fabric_yards != null ? Number(item.total_fabric_yards) : null,
        total_fabric_kg: item.total_fabric_kg != null ? Number(item.total_fabric_kg) : null,
        po_ids: Array.isArray(item.po_ids) ? item.po_ids : [],
        details,
        fabric_assignment: fabricAssignment ?? null,
        fabric_assignments: fabricAssignments ?? null,
        created_at: item.created_at,
      };
    } catch (error: any) {
      const message = String(error?.message || '').toLowerCase();
      if (message.includes('relation') || message.includes('table')) {
        // Fallback mock update for local dev without table
        return {
          id,
          marker_number: payload.marker_number as any,
          marker_type: (payload.marker_type as any) || 'body',
          width: Number(payload.width) || 0,
          layers: Number(payload.layers) || 0,
          efficiency: Number(payload.efficiency) || 0,
          pieces_per_marker: Number(payload.pieces_per_marker) || 0,
          marker_length_yards: Number(payload.marker_length_yards) || 0,
          marker_length_inches: Number(payload.marker_length_inches) || 0,
          measurement_type: (payload.measurement_type as any) || 'yard',
          marker_gsm: payload.marker_gsm ?? null,
          total_fabric_yards: payload.total_fabric_yards ?? null,
          total_fabric_kg: payload.total_fabric_kg ?? null,
          po_ids: payload.po_ids || [],
          details: detailsForUpdate ?? null,
          fabric_assignment: (detailsForUpdate as any)?.fabric_assignment ?? null,
          fabric_assignments: (detailsForUpdate as any)?.fabric_assignments ?? null,
          created_at: new Date().toISOString(),
        };
      }
      throw new Error(`Failed to update marker request: ${error?.message || error}`);
    }
  }
}

export const markerRequestService = new MarkerRequestService();
