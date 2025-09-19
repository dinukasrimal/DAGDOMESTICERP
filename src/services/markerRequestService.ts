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
}

export const markerRequestService = new MarkerRequestService();
