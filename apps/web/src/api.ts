import type { ApiError } from "@better-resume/api-contract";
export class ApiRequestError extends Error {
  constructor(message: string, readonly code: ApiError["code"], readonly retryable: boolean) { super(message); }
}
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const value = await response.json() as T | ApiError;
  if (!response.ok) { const error = value as ApiError; throw new ApiRequestError(error.message ?? "请求失败", error.code, error.retryable ?? false); }
  return value as T;
}
export const post = <T,>(path: string, body: object = {}) => request<T>(path, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
