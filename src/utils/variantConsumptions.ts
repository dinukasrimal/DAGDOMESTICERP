export interface ParsedVariantConsumption {
  productId: number | null;
  label: string;
  quantity: number | null;
  unit: string | null;
  waste: number | null;
  raw: string;
}

const VARIANT_MARKER = 'variant consumptions:';

const sliceAfterMarker = (notes: string): string | null => {
  const lower = notes.toLowerCase();
  const markerIndex = lower.indexOf(VARIANT_MARKER);
  if (markerIndex === -1) {
    return null;
  }
  return notes.slice(markerIndex + VARIANT_MARKER.length).trim();
};

const parseJsonSection = (section: string): ParsedVariantConsumption[] => {
  const trimmed = section.trim();
  if (!trimmed.startsWith('[')) {
    return [];
  }

  const locateJsonArray = (): string | null => {
    let depth = 0;
    let start = -1;

    for (let index = 0; index < trimmed.length; index += 1) {
      const char = trimmed[index];
      if (char === '[') {
        if (start === -1) {
          start = index;
        }
        depth += 1;
      } else if (char === ']') {
        if (depth > 0) {
          depth -= 1;
          if (depth === 0 && start !== -1) {
            return trimmed.slice(start, index + 1);
          }
        }
      }
    }

    return null;
  };

  const jsonCandidate = locateJsonArray();
  if (!jsonCandidate) {
    return [];
  }

  try {
    const parsed = JSON.parse(jsonCandidate);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const toNumber = (value: unknown): number | null => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
          return null;
        }
        const parsed = Number.parseFloat(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    return parsed.map<ParsedVariantConsumption>((entry) => {
      const safeEntry = entry ?? {};
      const productId = typeof safeEntry.product_id === 'number' ? safeEntry.product_id : null;
      const label = typeof safeEntry.label === 'string' && safeEntry.label.trim().length > 0
        ? safeEntry.label.trim()
        : typeof safeEntry.name === 'string' ? safeEntry.name.trim() : '';
      const quantity = toNumber(safeEntry.quantity);
      const unit = typeof safeEntry.unit === 'string' ? safeEntry.unit.trim() : null;
      const wasteRaw = safeEntry.waste_percentage ?? safeEntry.waste ?? null;
      const waste = toNumber(wasteRaw);

      return {
        productId,
        label,
        quantity,
        unit,
        waste,
        raw: JSON.stringify(entry)
      };
    }).filter((entry) => entry.label.length > 0 || entry.productId !== null);
  } catch (error) {
    console.warn('Failed to parse variant consumption JSON section', error);
    return [];
  }
};

const parseLegacySection = (section: string): ParsedVariantConsumption[] => {
  return section
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map<ParsedVariantConsumption>((entry) => {
      const idMatch = entry.match(/\b(?:id[:=]?|#)\s*(\d+)/i);
      const productId = idMatch ? Number.parseInt(idMatch[1], 10) : null;

      const detailMatch = entry.match(/([^:]+):\s*([0-9.]+)\s*([^()]+)\(([^%]+)%\s*waste\)/i);
      const label = detailMatch ? detailMatch[1].trim() : entry.replace(/\s*\([^)]*\)\s*/g, '').trim();
      const quantityValue = detailMatch ? Number.parseFloat(detailMatch[2]) : Number.NaN;
      const quantity = Number.isFinite(quantityValue) ? quantityValue : null;
      const unit = detailMatch ? detailMatch[3].trim() : null;
      const wasteValue = detailMatch ? Number.parseFloat(detailMatch[4]) : Number.NaN;
      const waste = Number.isFinite(wasteValue) ? wasteValue : null;

      return {
        productId: Number.isFinite(productId) ? productId : null,
        label,
        quantity,
        unit,
        waste,
        raw: entry
      };
    });
};

export const parseVariantConsumptionsFromNotes = (notes?: string | null): ParsedVariantConsumption[] => {
  if (!notes) {
    return [];
  }

  const section = sliceAfterMarker(notes);
  if (!section) {
    return [];
  }

  const jsonParsed = parseJsonSection(section);
  if (jsonParsed.length > 0) {
    return jsonParsed;
  }

  return parseLegacySection(section);
};
