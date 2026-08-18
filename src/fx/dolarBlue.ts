import { logger, serializeError } from "../logger.js";

const BLUE_RATE_URL = "https://dolarapi.com/v1/dolares/blue";
const CACHE_TTL_MS = 15 * 60 * 1000;

export interface BlueRate {
  compra: number;
  venta: number;
  fechaActualizacion: string;
}

let cache: { rate: BlueRate; fetchedAt: number } | null = null;

export async function getBlueRate(): Promise<BlueRate | null> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.rate;
  }

  try {
    const response = await fetch(BLUE_RATE_URL);
    if (!response.ok) throw new Error(`dolarapi returned ${response.status}`);
    const data = (await response.json()) as BlueRate;
    cache = { rate: data, fetchedAt: Date.now() };
    return data;
  } catch (err) {
    logger.error({ err: serializeError(err) }, "Failed to fetch blue dollar rate");
    return cache?.rate ?? null;
  }
}

// Uses "venta" (sell rate): pesos needed to acquire one blue-market dollar.
export function convertArsToUsd(totalArs: number, rate: BlueRate): number {
  return totalArs / rate.venta;
}
