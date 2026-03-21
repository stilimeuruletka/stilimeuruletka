import { describe, expect, it, vi } from "vitest";
import { createTelegramApi, TelegramError } from "./telegramApi.js";

describe("telegramApi", () => {
  it("sends requests and parses ok responses", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createTelegramApi("1234567890:abcdefghijklmnopqrstuvwxyz");
    const res = await api.sendMessage(1, "hi");
    expect(res).toEqual({ message_id: 1 });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("throws on Telegram error responses", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: false, error_code: 403, description: "forbidden" }), { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createTelegramApi("1234567890:abcdefghijklmnopqrstuvwxyz");
    await expect(api.sendMessage(1, "hi")).rejects.toBeInstanceOf(TelegramError);
  });

  it("supports other methods", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/answerCallbackQuery")) {
        return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
      }
      if (url.includes("/getChatMember")) {
        return new Response(JSON.stringify({ ok: true, result: { status: "member" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createTelegramApi("1234567890:abcdefghijklmnopqrstuvwxyz");
    await expect(api.answerCallbackQuery("id")).resolves.toBe(true);
    await expect(api.getChatMember("@c", 1)).resolves.toEqual({ status: "member" });
  });

  it("throws on invalid JSON payloads", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response("not-json", { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = createTelegramApi("1234567890:abcdefghijklmnopqrstuvwxyz");
    await expect(api.sendMessage(1, "hi")).rejects.toBeInstanceOf(TelegramError);
  });
});
