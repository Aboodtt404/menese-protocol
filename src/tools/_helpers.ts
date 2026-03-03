import type { SdkResponse } from "../sdk-client.js";

/** Standard tool return: JSON text content block */
export function jsonResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

/** Convert an SdkResponse to a tool result — returns error with userMessage on failure */
export function sdkToResult<T>(res: SdkResponse<T>) {
  if (res.ok) {
    return jsonResult(res.data);
  }
  return jsonResult({ error: res.error.userMessage, code: res.error.code });
}
